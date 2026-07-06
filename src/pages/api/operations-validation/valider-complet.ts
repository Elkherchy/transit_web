import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { OperationValidation, Transit } from '@/models';
import {
  OperationType,
  OperationValidationStatus,
} from '@/models/OperationValidation';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import {
  finalizeTransitIfAllValidated,
  markDesignationValideeAdmin,
} from '@/lib/transit/finalizeTransit';
import { finalizeJourneeIfAllValidated } from '@/lib/journee/finalizeJournee';

/**
 * POST /api/operations-validation/valider-complet
 * Validation COMPLÈTE d'un paiement payeur (désignation) en une seule étape :
 *   - marque la désignation VALIDEE_ADMIN
 *   - enregistre / met à jour l'OperationValidation → VALIDEE_ADMIN
 *   - finalise le transit (VALIDE + facture client) si tout est validé
 *   - finalise la journée liée (VALIDEE_ADMIN) si tous ses transits le sont
 *
 * Contrairement au flux normal (caissier → agent → admin), ceci valide
 * directement sans passer par les étapes intermédiaires. Réservé aux admins.
 * Body : { designationId: string }
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
    const { designationId } = req.body || {};
    if (!designationId || !mongoose.isValidObjectId(designationId)) {
      return res.status(400).json({ success: false, error: 'Désignation invalide' });
    }

    const transit = await Transit.findOne({
      'designations._id': new mongoose.Types.ObjectId(designationId),
    })
      .select('_id journeeId')
      .lean();
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }

    const transitId = String((transit as { _id: unknown })._id);
    const userId = req.user!.userId;

    // 1) Marque la désignation VALIDEE_ADMIN
    await markDesignationValideeAdmin(transitId, String(designationId), userId);

    // 2) Trace : OperationValidation → VALIDEE_ADMIN (upsert)
    const existing = await OperationValidation.findOne({
      opType: OperationType.PAYEUR_PAIEMENT,
      opId: String(designationId),
      statut: { $ne: OperationValidationStatus.REJETEE },
    });
    const now = new Date();
    if (existing) {
      existing.statut = OperationValidationStatus.VALIDEE_ADMIN;
      existing.validatedBy = userId;
      existing.validatedAt = now;
      await existing.save();
    } else {
      await OperationValidation.create({
        opType: OperationType.PAYEUR_PAIEMENT,
        opId: String(designationId),
        statut: OperationValidationStatus.VALIDEE_ADMIN,
        submittedBy: userId,
        submittedAt: now,
        validatedBy: userId,
        validatedAt: now,
      });
    }

    // 3) Finalise transit + journée si tout est validé
    await finalizeTransitIfAllValidated(transitId, userId);
    const journeeId = (transit as { journeeId?: unknown }).journeeId;
    if (journeeId) {
      await finalizeJourneeIfAllValidated(String(journeeId), userId);
    }

    return res.status(200).json({
      success: true,
      data: { designationId: String(designationId) },
      message: 'Opération validée complètement',
    });
  } catch (error) {
    console.error('POST /api/operations-validation/valider-complet:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
