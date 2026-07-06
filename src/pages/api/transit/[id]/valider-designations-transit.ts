import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

/**
 * POST /api/transit/[id]/valider-designations-transit
 * Valide en une seule opération TOUTES les désignations PAYEE d'un dossier
 * transit (à valider) → statut VALIDEE_TRANSIT.
 * Body : { commentaire?: string }
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ transitId: string; validated: number }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const transitId = String(req.query.id);
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit ID invalide' });
    }

    const { commentaire } = req.body || {};

    const transit = await Transit.findById(transitId);
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Transit introuvable' });
    }

    const now = new Date();
    const userObjId = new mongoose.Types.ObjectId(req.user!.userId);
    let validated = 0;

    for (const designation of transit.designations) {
      if (designation.statutDesignation === DesignationStatus.PAYEE) {
        designation.statutDesignation = DesignationStatus.VALIDEE_TRANSIT;
        designation.valideTransitBy = userObjId;
        designation.valideTransitAt = now;
        if (commentaire) designation.commentaire = String(commentaire).slice(0, 500);
        validated += 1;
      }
    }

    if (validated === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucune désignation à valider dans ce dossier',
      });
    }

    await transit.save({ validateModifiedOnly: true });

    try {
      await syncFactureManutentionStatusFromTransit(String(transit._id));
    } catch (syncErr) {
      console.error('syncFactureManutentionStatus error:', syncErr);
    }

    return res.status(200).json({
      success: true,
      data: { transitId: String(transit._id), validated },
      message: `${validated} désignation(s) validée(s)`,
    });
  } catch (error) {
    console.error('Valider désignations transit (bulk) error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.AGENT_TRANSIT]);
