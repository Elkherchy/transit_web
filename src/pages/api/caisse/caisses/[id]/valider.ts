import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/caisse/caisses/[id]/valider
 *
 * ADMIN / ADMIN_TRANSIT valide un compte (caisse ou banque) créé en attente par
 * par un AGENT_TRANSIT. Le compte devient utilisable (statut VALIDE).
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
      return res
        .status(400)
        .json({ success: false, error: 'Ce compte n\'est pas en attente' });
    }
    caisse.statut = 'VALIDE';
    caisse.valideBy = req.user!.userId;
    caisse.valideAt = new Date();
    await caisse.save();
    return res.status(200).json({
      success: true,
      data: { id: String(caisse._id) },
      message: 'Compte validé',
    });
  } catch (error) {
    console.error('POST /api/caisse/caisses/[id]/valider error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
]);
