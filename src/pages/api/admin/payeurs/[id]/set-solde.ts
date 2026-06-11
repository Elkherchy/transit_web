import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, User } from '@/models';
import { ApiResponse, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensurePayeurUserCaisse } from '@/lib/caisse';

/**
 * POST /api/admin/payeurs/[id]/set-solde
 *
 * Fixe directement le solde de la caisse payeur à une valeur donnée.
 * Crée une transaction CREDIT ou DEBIT d'ajustement pour la traçabilité.
 *
 * Body : { newSolde: number, description?: string }
 * Auth : ADMIN, ADMIN_TRANSIT
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ solde: number; transactionId: string | null }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();

    const userId = String(req.query.id || '');
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: 'ID utilisateur invalide' });
    }

    const targetUser = await User.findById(userId).lean();
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }
    if ((targetUser as { role?: string }).role !== UserRole.USER_PAYEUR) {
      return res.status(400).json({
        success: false,
        error: 'Seuls les comptes payeurs peuvent être modifiés via cet endpoint',
      });
    }

    const { newSolde: rawSolde, description } = (req.body || {}) as {
      newSolde?: unknown;
      description?: unknown;
    };

    const newSolde = parseFloat(String(rawSolde ?? '').replace(',', '.'));
    if (!Number.isFinite(newSolde)) {
      return res.status(400).json({ success: false, error: 'Solde invalide' });
    }

    const desc = String(description || '').trim() || 'Correction manuelle de solde';

    const caisseId = await ensurePayeurUserCaisse(userId);
    const caisse = await Caisse.findById(caisseId);
    if (!caisse) {
      return res.status(404).json({ success: false, error: 'Caisse payeur introuvable' });
    }

    const currentSolde = Number(caisse.solde) || 0;
    const diff = newSolde - currentSolde;
    let transactionId: string | null = null;

    if (diff !== 0) {
      const tx = await Transaction.create({
        caisseId: String(caisse._id),
        type: diff > 0 ? TransactionType.CREDIT : TransactionType.DEBIT,
        montant: Math.abs(diff),
        description: desc,
        date: new Date(),
        userId: req.user!.userId,
      });
      transactionId = String(tx._id);
    }

    caisse.solde = newSolde;
    await caisse.save();

    return res.status(200).json({
      success: true,
      data: { solde: newSolde, transactionId },
      message: `Solde mis à jour : ${newSolde.toFixed(2)} MRU`,
    });
  } catch (error) {
    console.error('[POST /api/admin/payeurs/[id]/set-solde]', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
