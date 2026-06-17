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
 * POST /api/transit/[id]/designation/[idx]/valider-transit
 * Agent transit valide ou rejette une désignation PAYEE.
 * Body : { action: 'valider' | 'rejeter', commentaire?: string }
 *
 * Sur 'rejeter' : statut → REJETEE et le verrou est libéré (statut LIBRE,
 * payeurId null) après preservation du commentaire pour audit.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ transitId: string; designationId: string; statut: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const transitId = String(req.query.id);
    const idxRaw = String(req.query.idx);
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit ID invalide' });
    }

    const { action, commentaire } = req.body || {};
    if (action !== 'valider' && action !== 'rejeter') {
      return res.status(400).json({ success: false, error: 'Action invalide' });
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

    if (designation.statutDesignation !== DesignationStatus.PAYEE) {
      return res.status(400).json({
        success: false,
        error: 'Seule une désignation PAYEE peut être validée/rejetée',
      });
    }

    if (action === 'valider') {
      designation.statutDesignation = DesignationStatus.VALIDEE_TRANSIT;
      designation.valideTransitBy = new mongoose.Types.ObjectId(req.user!.userId);
      designation.valideTransitAt = new Date();
      if (commentaire) designation.commentaire = String(commentaire).slice(0, 500);
    } else {
      designation.statutDesignation = DesignationStatus.REJETEE;
      designation.commentaire = commentaire ? String(commentaire).slice(0, 500) : 'Rejet agent transit';
      // On libère le verrou pour qu'un autre payeur puisse réessayer.
      // Ligne séparée afin de préserver la trace dans le commentaire.
      designation.payeurId = null;
      designation.recuUrl = null;
      designation.recuFilename = null;
      designation.statutDesignation = DesignationStatus.LIBRE;
    }

    await transit.save({ validateModifiedOnly: true });

    try {
      await syncFactureManutentionStatusFromTransit(String(transit._id));
    } catch (syncErr) {
      console.error('syncFactureManutentionStatus error:', syncErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        transitId: String(transit._id),
        designationId: String(designation._id),
        statut: designation.statutDesignation as string,
      },
      message: action === 'valider' ? 'Désignation validée' : 'Désignation rejetée',
    });
  } catch (error) {
    console.error('Valider/rejeter désignation transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.AGENT_TRANSIT]);
