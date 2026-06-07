import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { ClientDepense } from '@/models';
import { ClientDepenseStatus } from '@/models/ClientDepense';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

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
    const client = await ClientDepense.findById(id);
    if (!client) {
      return res
        .status(404)
        .json({ success: false, error: 'Client dépense introuvable' });
    }
    if (client.statut !== ClientDepenseStatus.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        error: 'Seuls les clients en attente peuvent être rejetés',
      });
    }
    await ClientDepense.findByIdAndDelete(client._id);
    return res.status(200).json({
      success: true,
      data: { id },
      message: 'Client dépense rejeté et supprimé',
    });
  } catch (error) {
    console.error('POST /api/depenses/clients/[id]/rejeter error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
