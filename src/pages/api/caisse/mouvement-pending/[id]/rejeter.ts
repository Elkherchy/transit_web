import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { MouvementPending } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { MouvementPendingStatus } from '@/models/MouvementPending';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/caisse/mouvement-pending/[id]/rejeter
 *
 * ADMIN_TRANSIT rejette un mouvement en attente avec un commentaire optionnel.
 * Aucune transaction n'est créée, aucun solde n'est modifié.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ id: string }>>
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const { commentaire } = (req.body || {}) as { commentaire?: string };

    const pending = await MouvementPending.findById(id);
    if (!pending) {
      return res
        .status(404)
        .json({ success: false, error: 'Mouvement introuvable' });
    }
    if (pending.statut !== MouvementPendingStatus.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        error: 'Ce mouvement n\'est plus en attente',
      });
    }

    pending.statut = MouvementPendingStatus.REJETE;
    pending.rejetePar = req.user!.userId;
    pending.rejeteAt = new Date();
    if (commentaire) pending.commentaire = String(commentaire).trim();
    await pending.save();

    return res.status(200).json({
      success: true,
      data: { id: String(pending._id) },
      message: 'Mouvement rejeté',
    });
  } catch (error) {
    console.error(
      'POST /api/caisse/mouvement-pending/[id]/rejeter error:',
      error
    );
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
