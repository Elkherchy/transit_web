import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, User } from '@/models';
import { ApiResponse, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensurePayeurUserCaisse } from '@/lib/caisse';

/**
 * POST /api/admin/payeurs/[id]/debit
 *
 * Débit manuel de la caisse d'un payeur (correction de solde).
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
        error: 'Seuls les comptes payeurs peuvent être débités via cet endpoint',
      });
    }

    const { montant, description } = (req.body || {}) as {
      montant?: unknown;
      description?: unknown;
    };

    const montantNum = parseFloat(String(montant ?? '').replace(',', '.'));
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide (doit être > 0)' });
    }
    const desc = String(description || '').trim();
    if (!desc) {
      return res.status(400).json({ success: false, error: 'Description obligatoire' });
    }

    // Ensure caisse exists (creates it if missing)
    const caisseId = await ensurePayeurUserCaisse(userId);
    const caisse = await Caisse.findById(caisseId);
    if (!caisse) {
      return res.status(404).json({ success: false, error: 'Caisse payeur introuvable' });
    }

    const tx = await Transaction.create({
      caisseId: String(caisse._id),
      type: TransactionType.DEBIT,
      montant: montantNum,
      description: desc,
      date: new Date(),
      userId: req.user!.userId,
    });

    caisse.solde = (Number(caisse.solde) || 0) - montantNum;
    await caisse.save();

    return res.status(200).json({
      success: true,
      data: { solde: caisse.solde, transactionId: String(tx._id) },
      message: 'Débit enregistré',
    });
  } catch (error) {
    console.error('[POST /api/admin/payeurs/[id]/debit]', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
