import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, MouvementPending, Transaction } from '@/models';
import {
  ApiResponse,
  TransactionType,
  UserRole,
} from '@/types';
import {
  MouvementPendingKind,
  MouvementPendingStatus,
} from '@/models/MouvementPending';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/caisse/mouvement-pending/[id]/valider
 *
 * ADMIN_TRANSIT (ou ADMIN) valide un mouvement en attente. Crée les
 * transactions réelles et met à jour les soldes :
 *   - CREDIT : 1 transaction sur la caisse source.
 *   - DEBIT  : 1 transaction sur la caisse source.
 *   - TRANSFER : 2 transactions (DEBIT source + CREDIT destination).
 *
 * Le statut du mouvement passe à VALIDE et l'utilisateur valideur est
 * enregistré (audit).
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

    const now = new Date();
    const uid = req.user!.userId;
    const ref = `pending-${String(pending._id)}`;

    const source = await Caisse.findById(pending.sourceCaisseId);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Compte source introuvable',
      });
    }

    let destination = null;
    if (
      pending.kind === MouvementPendingKind.TRANSFER &&
      pending.destinationCaisseId
    ) {
      destination = await Caisse.findById(pending.destinationCaisseId);
      if (!destination) {
        return res.status(404).json({
          success: false,
          error: 'Compte destination introuvable',
        });
      }
    }

    // Vérifie le solde pour DEBIT / TRANSFER — sauf si l'un des comptes
    // (source ou destination) est de type CLIENT : ces transferts admettent
    // un solde négatif (créance enregistrée).
    const involvesClient =
      String((source as { kind?: unknown }).kind || '') === 'CLIENT' ||
      String((destination as { kind?: unknown })?.kind || '') === 'CLIENT';
    if (
      (pending.kind === MouvementPendingKind.DEBIT ||
        pending.kind === MouvementPendingKind.TRANSFER) &&
      !involvesClient
    ) {
      const soldeSource = Number(source.solde) || 0;
      if (soldeSource < pending.montant) {
        return res.status(400).json({
          success: false,
          error: `Solde insuffisant sur ${source.nom} (${soldeSource.toFixed(2)} MRU)`,
        });
      }
    }

    let debitId: mongoose.Types.ObjectId | undefined;
    let creditId: mongoose.Types.ObjectId | undefined;

    if (pending.kind === MouvementPendingKind.CREDIT) {
      const tx = await Transaction.create({
        caisseId: source._id,
        type: TransactionType.CREDIT,
        montant: pending.montant,
        description: pending.description,
        date: pending.date || now,
        reference: ref,
        userId: uid,
      });
      creditId = tx._id;
      await Caisse.findByIdAndUpdate(source._id, {
        $inc: { solde: pending.montant },
      });
    } else if (pending.kind === MouvementPendingKind.DEBIT) {
      const tx = await Transaction.create({
        caisseId: source._id,
        type: TransactionType.DEBIT,
        montant: pending.montant,
        description: pending.description,
        date: pending.date || now,
        reference: ref,
        userId: uid,
      });
      debitId = tx._id;
      await Caisse.findByIdAndUpdate(source._id, {
        $inc: { solde: -pending.montant },
      });
    } else if (
      pending.kind === MouvementPendingKind.TRANSFER &&
      destination
    ) {
      const debit = await Transaction.create({
        caisseId: source._id,
        type: TransactionType.DEBIT,
        montant: pending.montant,
        description: pending.description,
        date: pending.date || now,
        reference: ref,
        userId: uid,
        sourcePaiementId: ref,
      });
      let credit;
      try {
        credit = await Transaction.create({
          caisseId: destination._id,
          type: TransactionType.CREDIT,
          montant: pending.montant,
          description: pending.description,
          date: pending.date || now,
          reference: ref,
          userId: uid,
          sourcePaiementId: `${ref}-credit`,
          mirrorSourceId: debit._id,
        });
      } catch (e) {
        await Transaction.findByIdAndDelete(debit._id).catch(() => null);
        throw e;
      }
      debitId = debit._id;
      creditId = credit._id;
      await Promise.all([
        Caisse.findByIdAndUpdate(source._id, {
          $inc: { solde: -pending.montant },
        }),
        Caisse.findByIdAndUpdate(destination._id, {
          $inc: { solde: pending.montant },
        }),
      ]);
    }

    pending.statut = MouvementPendingStatus.VALIDE;
    pending.valideBy = uid;
    pending.valideAt = now;
    if (debitId) pending.transactionDebitId = String(debitId);
    if (creditId) pending.transactionCreditId = String(creditId);
    await pending.save();

    return res.status(200).json({
      success: true,
      data: { id: String(pending._id) },
      message: 'Mouvement validé',
    });
  } catch (error) {
    console.error(
      'POST /api/caisse/mouvement-pending/[id]/valider error:',
      error
    );
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
