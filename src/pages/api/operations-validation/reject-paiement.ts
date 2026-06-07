import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { OperationValidation, Transit } from '@/models';
import {
  OperationType,
  OperationValidationStatus,
} from '@/models/OperationValidation';
import { ApiResponse, DesignationStatus, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { findOpenJourneeForCaissier } from '@/lib/journee/journeeHelpers';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

/**
 * POST /api/operations-validation/reject-paiement
 *
 * Le caissier rejette un paiement de désignation effectué par le payeur AVANT
 * sa validation : aucune sortie de caisse payeur n'a eu lieu (le DEBIT est
 * différé jusqu'à la validation caissier — cf. POST /api/operations-validation).
 *
 * Effets :
 *  - Désignation : PAYEE → REJETEE, commentaire = motif
 *  - OperationValidation : enregistre une trace REJETEE (audit + UI history)
 *
 * Body : { designationId: string, motif?: string }
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ designationId: string }>>
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const { designationId, motif } = (req.body || {}) as {
      designationId?: string;
      motif?: string;
    };
    if (!designationId || !mongoose.isValidObjectId(String(designationId))) {
      return res
        .status(400)
        .json({ success: false, error: 'designationId invalide' });
    }

    const transit = await Transit.findOne({
      'designations._id': new mongoose.Types.ObjectId(String(designationId)),
    });
    if (!transit) {
      return res
        .status(404)
        .json({ success: false, error: 'Désignation introuvable' });
    }
    const desig = transit.designations.id(String(designationId));
    if (!desig) {
      return res
        .status(404)
        .json({ success: false, error: 'Désignation introuvable' });
    }
    if (desig.statutDesignation !== DesignationStatus.PAYEE) {
      return res.status(400).json({
        success: false,
        error: "Cette désignation n'est pas en attente de validation",
      });
    }

    // Rejet caissier : la désignation revient en RESERVEE (le payeur garde
    // sa réservation) avec un commentaire indiquant le motif. Les reçus du
    // paiement rejeté sont effacés pour qu'un nouveau paiement puisse être
    // tenté proprement. `paidAt` est remis à null pour libérer l'opération.
    desig.statutDesignation = DesignationStatus.RESERVEE;
    desig.commentaire = motif
      ? `Rejet caissier : ${String(motif).trim()}`
      : 'Rejet caissier';
    desig.paidAt = null;
    desig.recuUrl = null;
    desig.recuFilename = null;
    desig.recus = [] as unknown as typeof desig.recus;
    await transit.save();

    // Recalcule le statut de la FactureManutention liée — la désignation
    // rejetée revient en RESERVEE donc le compteur "désignations payées"
    // de la facture doit être ajusté.
    try {
      await syncFactureManutentionStatusFromTransit(String(transit._id));
    } catch (syncErr) {
      console.error('sync facture manutention (reject):', syncErr);
    }

    // Rattachement à la journée OUVERTE (audit).
    let journeeId: string | null = null;
    if (req.user!.role === UserRole.CAISSIER) {
      const j = await findOpenJourneeForCaissier(req.user!.userId);
      if (j) journeeId = String(j._id);
    }

    // Trace audit dans OperationValidation directement en REJETEE.
    try {
      await OperationValidation.create({
        opType: OperationType.PAYEUR_PAIEMENT,
        opId: String(designationId),
        snapshot: {
          libelle: `Paiement ${desig.nom}`,
          montant: Number(desig.montant) || 0,
          date: desig.paidAt || new Date(),
        },
        statut: OperationValidationStatus.REJETEE,
        journeeId,
        submittedBy: req.user!.userId,
        submittedAt: new Date(),
        validatedBy: req.user!.userId,
        validatedAt: new Date(),
        rejectMotif: motif ? String(motif).trim() : null,
      });
    } catch (e) {
      // Trace audit best-effort — ne bloque pas le rejet.
      console.error('OperationValidation audit (reject):', e);
    }

    return res.status(200).json({
      success: true,
      data: { designationId: String(designationId) },
      message:
        'Paiement rejeté — la désignation est de nouveau disponible au paiement pour le payeur',
    });
  } catch (error) {
    console.error('POST /api/operations-validation/reject-paiement:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.CAISSIER,
]);
