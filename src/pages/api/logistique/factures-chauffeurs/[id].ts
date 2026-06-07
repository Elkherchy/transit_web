import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, ChauffeurFacture, Transaction, User, Vehicule } from '@/models';
import {
  ApiResponse,
  ChauffeurFactureStatut,
  IChauffeurFacture,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

function toYmd(value: unknown): string {
  return new Date(value as string | number | Date).toISOString().slice(0, 10);
}

function serializeFacture(doc: Record<string, unknown>, chauffeurNom?: string): IChauffeurFacture {
  return {
    _id: String(doc._id),
    reference: String(doc.reference),
    chauffeurId: String(doc.chauffeurId),
    chauffeurNom,
    weekStart: toYmd(doc.weekStart),
    weekEnd: toYmd(doc.weekEnd),
    nombreCharges: Number(doc.nombreCharges || 0),
    montantCharge: Number(doc.montantCharge || 0),
    total: Number(doc.total || 0),
    statut: doc.statut as ChauffeurFactureStatut,
    caisseId: doc.caisseId ? String(doc.caisseId) : undefined,
    caisseNom: doc.caisseNom as string | undefined,
    transactionId: doc.transactionId ? String(doc.transactionId) : undefined,
    paidAt: doc.paidAt as Date | undefined,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function updateFacture(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IChauffeurFacture>>
) {
  const { id } = req.query;
  if (!id || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  try {
    await connectDB();

    const facture = await ChauffeurFacture.findById(String(id));
    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const { action, caisseId } = req.body as { action?: string; caisseId?: string };

    if (action === 'confirm') {
      if (facture.statut !== ChauffeurFactureStatut.BROUILLON) {
        return res.status(400).json({ success: false, error: 'Facture déjà confirmée ou payée' });
      }
      facture.statut = ChauffeurFactureStatut.CONFIRME;
      await facture.save();
      const chauffeur = await User.findById(facture.chauffeurId).select('nom').lean();
      return res.status(200).json({
        success: true,
        data: serializeFacture(facture.toObject() as unknown as Record<string, unknown>, chauffeur?.nom),
        message: 'Facture confirmée',
      });
    }

    if (action === 'pay') {
      if (facture.statut !== ChauffeurFactureStatut.CONFIRME) {
        return res.status(400).json({ success: false, error: 'Seule une facture confirmée peut être payée' });
      }
      if (!caisseId || !mongoose.isValidObjectId(caisseId)) {
        return res.status(400).json({ success: false, error: 'caisseId requis et valide' });
      }

      const caisse = await Caisse.findById(caisseId).lean();
      if (!caisse || !caisse.actif) {
        return res.status(404).json({ success: false, error: 'Caisse introuvable' });
      }

      const tx = await Transaction.create({
        caisseId: new mongoose.Types.ObjectId(caisseId),
        type: TransactionType.DEBIT,
        montant: facture.total,
        description: `Paiement facture chauffeur ${facture.reference}`,
        date: new Date(),
        reference: facture.reference,
        userId: req.user!.userId,
      });

      const vehiculeDoc = await Vehicule.findOne({ chauffeurId: facture.chauffeurId })
        .select('_id matricule')
        .lean();
      if (vehiculeDoc) {
        await Transaction.findByIdAndUpdate(tx._id, {
          $set: {
            vehiculeId: String(vehiculeDoc._id),
            vehiculeMatricule: String(vehiculeDoc.matricule || '').trim().toUpperCase(),
          },
        });
      }

      facture.statut = ChauffeurFactureStatut.PAYE;
      facture.caisseId = tx.caisseId;
      facture.caisseNom = String(caisse.nom);
      facture.transactionId = tx._id;
      facture.paidAt = new Date();
      await facture.save();

      const chauffeur = await User.findById(facture.chauffeurId).select('nom').lean();
      return res.status(200).json({
        success: true,
        data: serializeFacture(facture.toObject() as unknown as Record<string, unknown>, chauffeur?.nom),
        message: 'Facture payée, caisse débitée',
      });
    }

    return res.status(400).json({ success: false, error: 'Action invalide' });
  } catch (error) {
    console.error('Update chauffeur facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'PATCH':
      return withLogistique(updateFacture)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
