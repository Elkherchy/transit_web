import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Client, Transaction } from '@/models';
import { ApiResponse, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse } from '@/lib/caisse';

/**
 * POST /api/admin/clients/[id]/debit
 *
 * Enregistre un débit manuel sur le compte du client.
 * Body : { montant: number, description: string }
 * Auth : ADMIN, ADMIN_TRANSIT
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ solde: number; transactionId: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID client invalide' });
    }

    const { montant, description } = (req.body || {}) as {
      montant?: unknown;
      description?: unknown;
    };

    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide (doit être > 0)' });
    }
    const desc = String(description || '').trim();
    if (!desc) {
      return res.status(400).json({ success: false, error: 'Description obligatoire' });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    // Ensure caisse exists
    if (!client.caisseId) {
      const caisseId = await ensureClientCaisse(String(client._id), client.nom);
      client.caisseId = String(caisseId);
      await client.save();
    }

    const caisse = await Caisse.findById(client.caisseId);
    if (!caisse) {
      return res.status(404).json({ success: false, error: 'Caisse client introuvable' });
    }

    // Create DEBIT transaction + decrement solde atomically
    const tx = await Transaction.create({
      caisseId: String(caisse._id),
      type: TransactionType.DEBIT,
      montant: montantNum,
      description: desc,
      date: new Date(),
      userId: req.user!.userId,
    });

    caisse.solde = (caisse.solde || 0) - montantNum;
    await caisse.save();

    return res.status(200).json({
      success: true,
      data: { solde: caisse.solde, transactionId: String(tx._id) },
      message: 'Débit enregistré',
    });
  } catch (error) {
    console.error('[debit client]', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
