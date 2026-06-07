import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Client } from '@/models';
import { ClientStatus } from '@/models/Client';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/admin/clients/[id]/rejeter
 *
 * ADMIN_TRANSIT rejette un client EN_ATTENTE → suppression automatique du
 * document (le client n'a pas encore de caisse ni de factures liées).
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
    const client = await Client.findById(id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, error: 'Client introuvable' });
    }
    if (client.statut !== ClientStatus.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        error: 'Seuls les clients en attente peuvent être rejetés',
      });
    }

    await Client.findByIdAndDelete(client._id);

    return res.status(200).json({
      success: true,
      data: { id: String(client._id) },
      message: 'Client rejeté et supprimé',
    });
  } catch (error) {
    console.error('POST /api/admin/clients/[id]/rejeter error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
