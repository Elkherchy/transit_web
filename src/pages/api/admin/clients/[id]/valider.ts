import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Client } from '@/models';
import { ClientStatus } from '@/models/Client';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse } from '@/lib/caisse';

/**
 * POST /api/admin/clients/[id]/valider
 *
 * ADMIN_TRANSIT valide un client créé en attente par un AGENT_TRANSIT. La
 * caisse client liée est créée à ce moment.
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
        error: 'Ce client n\'est pas en attente',
      });
    }
    client.statut = ClientStatus.VALIDE;
    client.valideBy = req.user!.userId;
    client.valideAt = new Date();
    await client.save();

    // Création automatique de la caisse client liée.
    if (!client.caisseId) {
      const caisseId = await ensureClientCaisse(String(client._id), client.nom);
      client.caisseId = String(caisseId);
      await client.save();
    }

    return res.status(200).json({
      success: true,
      data: { id: String(client._id) },
      message: 'Client validé',
    });
  } catch (error) {
    console.error('POST /api/admin/clients/[id]/valider error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
