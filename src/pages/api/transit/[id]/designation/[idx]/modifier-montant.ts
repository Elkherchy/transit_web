import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { OperationValidation, Transit } from '@/models';
import { OperationType } from '@/models/OperationValidation';
import { ApiResponse, DesignationStatus, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * PATCH /api/transit/[id]/designation/[idx]/modifier-montant
 *
 * Permet au payeur de modifier le montant d'une désignation déjà payée
 * (statutDesignation = PAYEE), UNIQUEMENT si aucune OperationValidation
 * n'existe encore pour cette désignation — c'est-à-dire que le caissier
 * n'a pas encore envoyé le paiement vers la chaîne de validation agent.
 *
 * Body: { montant: number }
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ designationId: string; montant: number }>>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();

    const transitId = String(req.query.id);
    const idxRaw = String(req.query.idx);
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit ID invalide' });
    }

    const transit = await Transit.findById(transitId);
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Transit introuvable' });
    }

    let designation = mongoose.isValidObjectId(idxRaw)
      ? transit.designations.id(idxRaw)
      : null;
    if (!designation) {
      const numIdx = parseInt(idxRaw, 10);
      if (Number.isInteger(numIdx) && numIdx >= 0 && numIdx < transit.designations.length) {
        designation = transit.designations[numIdx];
      }
    }
    if (!designation) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }

    const uid = req.user!.userId;
    if (String(designation.payeurId || '') !== uid) {
      return res.status(403).json({ success: false, error: 'Vous n\'êtes pas le payeur de cette désignation' });
    }

    if (designation.statutDesignation !== DesignationStatus.PAYEE) {
      return res.status(400).json({
        success: false,
        error: 'Seules les désignations en statut PAYÉE peuvent être modifiées',
      });
    }

    // Bloque si le caissier a déjà soumis ce paiement à la chaîne de validation.
    const existingValidation = await OperationValidation.findOne({
      opType: OperationType.PAYEUR_PAIEMENT,
      opId: String(designation._id),
    });
    if (existingValidation) {
      return res.status(409).json({
        success: false,
        error: 'Ce paiement a déjà été pris en charge par le caissier — modification impossible',
      });
    }

    const { montant: rawMontant } = (req.body || {}) as { montant?: unknown };
    const montant = parseFloat(String(rawMontant ?? '').replace(',', '.'));
    if (!Number.isFinite(montant) || montant <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    designation.montant = montant;
    await transit.save();

    return res.status(200).json({
      success: true,
      data: { designationId: String(designation._id), montant },
      message: 'Montant mis à jour',
    });
  } catch (error) {
    console.error('PATCH modifier-montant:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.USER_PAYEUR, UserRole.ADMIN]);
