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
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

/**
 * POST /api/operations-validation/liberer-designation
 *
 * Le caissier remet une désignation rejetée par l'agent transit à l'état LIBRE.
 * Cela libère la réservation du payeur — n'importe quel payeur peut ensuite
 * réserver et payer cette désignation.
 *
 * Effets :
 *  - Désignation : PAYEE → LIBRE (payeurId, paidAt, recus effacés)
 *  - OperationValidation : trace audit REJETEE
 *
 * Body : { designationId: string, motif?: string }
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ designationId: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const { designationId, motif } = (req.body || {}) as {
      designationId?: string;
      motif?: string;
    };

    if (!designationId || !mongoose.isValidObjectId(String(designationId))) {
      return res.status(400).json({ success: false, error: 'designationId invalide' });
    }

    const transit = await Transit.findOne({
      'designations._id': new mongoose.Types.ObjectId(String(designationId)),
    });
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }
    const desig = transit.designations.id(String(designationId));
    if (!desig) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }

    const liberableStatuts: DesignationStatus[] = [
      DesignationStatus.PAYEE,
      DesignationStatus.RESERVEE,
    ];
    if (!liberableStatuts.includes(desig.statutDesignation as DesignationStatus)) {
      return res.status(400).json({
        success: false,
        error: 'La désignation ne peut pas être remise à LIBRE depuis son statut actuel',
      });
    }

    // Remettre à LIBRE : libère complètement le verrou payeur
    desig.statutDesignation = DesignationStatus.LIBRE;
    desig.payeurId = null;
    desig.paidAt = null;
    desig.recuUrl = null;
    desig.recuFilename = null;
    desig.recus = [] as unknown as typeof desig.recus;
    desig.commentaire = motif
      ? `Libéré par caissier : ${String(motif).trim()}`
      : 'Remis à LIBRE par caissier';
    await transit.save({ validateModifiedOnly: true });

    try {
      await syncFactureManutentionStatusFromTransit(String(transit._id));
    } catch (syncErr) {
      console.error('sync facture manutention (liberer):', syncErr);
    }

    // Trace audit
    try {
      await OperationValidation.create({
        opType: OperationType.PAYEUR_PAIEMENT,
        opId: String(designationId),
        snapshot: {
          libelle: `Libération ${desig.nom}`,
          montant: Number(desig.montant) || 0,
          date: new Date(),
        },
        statut: OperationValidationStatus.REJETEE,
        submittedBy: req.user!.userId,
        submittedAt: new Date(),
        validatedBy: req.user!.userId,
        validatedAt: new Date(),
        rejectMotif: motif ? `Libéré : ${String(motif).trim()}` : 'Libéré par caissier',
      });
    } catch (e) {
      console.error('OperationValidation audit (liberer):', e);
    }

    return res.status(200).json({
      success: true,
      data: { designationId: String(designationId) },
      message: 'Désignation remise à LIBRE — disponible pour tous les payeurs',
    });
  } catch (error) {
    console.error('POST /api/operations-validation/liberer-designation:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.CAISSIER,
]);
