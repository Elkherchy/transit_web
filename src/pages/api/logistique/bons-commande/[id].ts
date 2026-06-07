import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { BonCommande, Caisse, Transaction } from '@/models';
import {
  ApiResponse,
  BonCommandeStatut,
  IBonCommandeResponse,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

function serializeBC(doc: Record<string, unknown>): IBonCommandeResponse {
  const lignes = (doc.lignes as Array<Record<string, unknown>>) ?? [];
  return {
    _id: String(doc._id),
    reference: doc.reference as string,
    client: doc.client as IBonCommandeResponse['client'],
    date: doc.date ? String(doc.date).slice(0, 10) : undefined,
    lignes: lignes.map((l) => ({
      voyageId: String(l.voyageId),
      description: l.description as string,
      montant: l.montant as number,
    })),
    total: doc.total as number,
    statut: doc.statut as BonCommandeStatut,
    caisseId: doc.caisseId ? String(doc.caisseId) : undefined,
    caisseNom: doc.caisseNom as string | undefined,
    transactionId: doc.transactionId ? String(doc.transactionId) : undefined,
    paidAt: doc.paidAt as Date | undefined,
    createdBy: doc.createdBy as string,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function getBonCommande(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IBonCommandeResponse>>
) {
  const { id } = req.query;
  if (!id || !mongoose.isValidObjectId(id as string)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  try {
    await connectDB();
    const doc = await BonCommande.findById(id as string).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Bon de commande introuvable' });
    return res.status(200).json({ success: true, data: serializeBC(doc as unknown as Record<string, unknown>) });
  } catch (err) {
    console.error('getBonCommande error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function patchBonCommande(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IBonCommandeResponse>>
) {
  const { id } = req.query;
  if (!id || !mongoose.isValidObjectId(id as string)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const { action, caisseId } = req.body as { action?: string; caisseId?: string };

  try {
    await connectDB();

    const bon = await BonCommande.findById(id as string);
    if (!bon) return res.status(404).json({ success: false, error: 'Bon de commande introuvable' });

    // ── Action: payer ──────────────────────────────────────────────────────────
    if (action === 'payer') {
      if (bon.statut !== BonCommandeStatut.CONFIRME) {
        return res.status(400).json({
          success: false,
          error: 'Seul un bon confirmé peut être payé',
        });
      }

      if (!caisseId || !mongoose.isValidObjectId(caisseId)) {
        return res.status(400).json({ success: false, error: 'caisseId requis et valide' });
      }

      const caisseDoc = await Caisse.findById(caisseId).lean();
      if (!caisseDoc || !caisseDoc.actif) {
        return res.status(404).json({ success: false, error: 'Caisse introuvable ou inactive' });
      }

      // Create DEBIT transaction
      const tx = await Transaction.create({
        caisseId: new mongoose.Types.ObjectId(caisseId),
        type: TransactionType.DEBIT,
        montant: bon.total,
        description: `Paiement bon de commande ${bon.reference} — client ${bon.client}`,
        date: new Date(),
        reference: bon.reference,
        userId: req.user!.userId,
      });

      // Update bon
      bon.statut = BonCommandeStatut.PAYE;
      bon.caisseId = new mongoose.Types.ObjectId(caisseId) as unknown as typeof bon.caisseId;
      bon.caisseNom = String(caisseDoc.nom);
      bon.transactionId = tx._id as unknown as typeof bon.transactionId;
      bon.paidAt = new Date();
      await bon.save();

      const fresh = await BonCommande.findById(bon._id).lean();
      return res.status(200).json({
        success: true,
        data: serializeBC(fresh as unknown as Record<string, unknown>),
        message: 'Bon de commande payé — caisse débitée',
      });
    }

    return res.status(400).json({ success: false, error: 'Action inconnue' });
  } catch (err) {
    console.error('patchBonCommande error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(getBonCommande)(req, res);
    case 'PATCH':
      return withLogistique(patchBonCommande)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
