import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, ClientDepense } from '@/models';
import { ClientDepenseStatus } from '@/models/ClientDepense';
import { ApiResponse, CaisseKind, CompteType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/depenses/clients/[id]/valider
 *
 * ADMIN_TRANSIT valide un client dépense. Une caisse `kind=CLIENT` est créée
 * automatiquement pour suivre les montants payés/dûs à ce bénéficiaire.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ id: string; caisseId?: string }>>
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
      return res
        .status(400)
        .json({ success: false, error: 'Ce client n\'est pas en attente' });
    }
    client.statut = ClientDepenseStatus.VALIDE;
    client.valideBy = req.user!.userId;
    client.valideAt = new Date();
    await client.save();

    // Création automatique de la caisse interne associée (kind=CLIENT).
    if (!client.caisseId) {
      const caisse = await Caisse.create({
        nom: `Dépense — ${client.nom}`,
        type: CompteType.CAISSE,
        kind: CaisseKind.CLIENT,
        clientId: String(client._id),
        actif: true,
        isDefaultGeneral: false,
        statut: 'VALIDE',
      });
      client.caisseId = String(caisse._id);
      await client.save();
    }

    return res.status(200).json({
      success: true,
      data: { id: String(client._id), caisseId: client.caisseId },
      message: 'Client dépense validé — caisse associée créée',
    });
  } catch (error) {
    console.error('POST /api/depenses/clients/[id]/valider error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
