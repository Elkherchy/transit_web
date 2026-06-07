import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/caisse/caisses/[id]/rejeter
 *
 * ADMIN_TRANSIT rejette un compte EN_ATTENTE → suppression définitive
 * (le compte n'a aucune transaction puisqu'il n'était pas utilisable).
 *
 * Garde-fou : refuse de rejeter un compte qui a déjà été utilisé (au cas où
 * une transaction aurait été créée à la main).
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
    const caisse = await Caisse.findById(id);
    if (!caisse) {
      return res
        .status(404)
        .json({ success: false, error: 'Compte introuvable' });
    }
    if (caisse.statut !== 'EN_ATTENTE') {
      return res.status(400).json({
        success: false,
        error: 'Seuls les comptes en attente peuvent être rejetés',
      });
    }

    const txCount = await Transaction.countDocuments({ caisseId: caisse._id });
    if (txCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ce compte a déjà des transactions — suppression impossible',
      });
    }

    await Caisse.findByIdAndDelete(caisse._id);

    return res.status(200).json({
      success: true,
      data: { id: String(caisse._id) },
      message: 'Compte rejeté et supprimé',
    });
  } catch (error) {
    console.error('POST /api/caisse/caisses/[id]/rejeter error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.ADMIN_LOGISTIQUE,
]);
