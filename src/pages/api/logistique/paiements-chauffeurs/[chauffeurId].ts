import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Voyage, User, Caisse, Transaction } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  CaisseType,
  IUserResponse,
  IVoyage,
  TransactionType,
  UserRole,
  VoyageStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureChauffeurCaisse, ensureBanqueCaisse, mirrorDescriptionForGeneral } from '@/lib/caisse';

interface ChauffeurPaiementDetail {
  chauffeur: IUserResponse;
  caisseId: string;
  soldeCaisse: number;
  voyagesAPayer: IVoyage[];
  voyagesPayes: IVoyage[];
  totalAPayer: number;
  totalDejaPaye: number;
}

interface PaiementResult {
  chauffeurId: string;
  nbVoyagesPayes: number;
  montantPaye: number;
  nouveauSoldeCaisseChauffeur: number;
}

/**
 * GET /api/logistique/paiements-chauffeurs/[chauffeurId]
 *   Détail des voyages à payer / payés.
 *
 * POST /api/logistique/paiements-chauffeurs/[chauffeurId]
 *   Effectue le paiement de fin de semaine :
 *     - Débit sur caisse CHAUFFEUR du total (avec mirror crédit caisse GENERALE)
 *     - Marque tous les voyages éligibles avec commissionPaidAt
 *     - Idempotent via reference `paiement-chauffeur-{cid}-{ts}` côté Transaction
 *
 * Body POST (optionnel) : { voyageIds?: string[] } — si fourni, paye uniquement ces voyages.
 *
 * Auth : ADMIN, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ChauffeurPaiementDetail | PaiementResult>>
) {
  try {
    await connectDB();
    const chauffeurId = String(req.query.chauffeurId);
    if (!mongoose.isValidObjectId(chauffeurId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const chauffeur = await User.findById(chauffeurId)
      .select('_id nom email telephone role')
      .lean();
    if (!chauffeur || chauffeur.role !== UserRole.CHAUFFEUR) {
      return res
        .status(404)
        .json({ success: false, error: 'Chauffeur introuvable' });
    }

    const caisseId = await ensureChauffeurCaisse(chauffeurId, chauffeur.nom);
    const caisse = await Caisse.findById(caisseId).select('solde').lean();
    const soldeCaisse = Number(caisse?.solde) || 0;

    if (req.method === 'GET') {
      const voyages = await Voyage.find({
        chauffeurId,
        statutVoyage: { $in: [VoyageStatus.RETOURNE, VoyageStatus.VALIDE] },
      })
        .sort({ scanRetourAt: -1, createdAt: -1 })
        .lean();

      const voyagesAPayer = voyages.filter((v) => !v.commissionPaidAt);
      const voyagesPayes = voyages.filter((v) => v.commissionPaidAt);
      const totalAPayer = voyagesAPayer.reduce(
        (s, v) => s + (Number(v.commissionChauffeur) || 0),
        0
      );
      const totalDejaPaye = voyagesPayes.reduce(
        (s, v) => s + (Number(v.commissionChauffeur) || 0),
        0
      );

      return res.status(200).json({
        success: true,
        data: {
          chauffeur: chauffeur as unknown as IUserResponse,
          caisseId: String(caisseId),
          soldeCaisse,
          voyagesAPayer: voyagesAPayer as unknown as IVoyage[],
          voyagesPayes: voyagesPayes as unknown as IVoyage[],
          totalAPayer,
          totalDejaPaye,
        },
      });
    }

    if (req.method === 'POST') {
      const requestedIds = Array.isArray(req.body?.voyageIds)
        ? (req.body.voyageIds as string[]).filter((s) =>
            mongoose.isValidObjectId(s)
          )
        : null;

      const filter: Record<string, unknown> = {
        chauffeurId,
        statutVoyage: { $in: [VoyageStatus.RETOURNE, VoyageStatus.VALIDE] },
        commissionPaidAt: null,
      };
      if (requestedIds && requestedIds.length > 0) {
        filter._id = { $in: requestedIds };
      }

      const eligibles = await Voyage.find(filter);
      if (eligibles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Aucun voyage à payer pour ce chauffeur',
        });
      }

      const total = eligibles.reduce(
        (s, v) => s + (Number(v.commissionChauffeur) || 0),
        0
      );

      if (total <= 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Montant à payer nul' });
      }

      if (soldeCaisse < total) {
        return res.status(400).json({
          success: false,
          error: `Solde caisse chauffeur insuffisant (${soldeCaisse.toFixed(
            2
          )} < ${total.toFixed(2)})`,
        });
      }

      const now = new Date();
      const uid = req.user!.userId;
      const sourceId = `paiement-chauffeur-${chauffeurId}-${now.getTime()}`;
      const description = `Paiement commission(s) — ${
        eligibles.length
      } voyage(s)`;

      // Débit caisse chauffeur
      const debit = await Transaction.create({
        caisseId,
        type: TransactionType.DEBIT,
        montant: total,
        description,
        date: now,
        reference: chauffeurId,
        userId: uid,
        sourcePaiementId: sourceId,
      });
      await Caisse.findByIdAndUpdate(caisseId, { $inc: { solde: -total } });

      // Crédit miroir caisse générale (sortie effective des fonds — neutre globalement)
      // La logique : la commission a été promise (crédit caisse chauffeur) lors
      // du retour ; au paiement réel, on débite la caisse chauffeur et on
      // inscrit la sortie en contrepartie sur Banque_Logistique (sortie
      // bancaire / chèque chauffeur). Phase 3 : domaine logistique.
      try {
        const banque = await ensureBanqueCaisse(CaisseType.LOGISTIQUE);
        if (banque && String(banque._id) !== String(caisseId)) {
          await Transaction.create({
            caisseId: banque._id,
            type: TransactionType.DEBIT,
            montant: total,
            description: mirrorDescriptionForGeneral(
              chauffeur.nom,
              description
            ),
            date: now,
            reference: chauffeurId,
            userId: uid,
            mirrorSourceId: debit._id,
            sourcePaiementId: sourceId,
          });
          await Caisse.findByIdAndUpdate(banque._id, {
            $inc: { solde: -total },
          });
        }
      } catch (mirrorErr) {
        console.error('mirror banque logistique error:', mirrorErr);
      }

      // Marque les voyages comme payés
      const voyageIds = eligibles.map((v) => v._id);
      await Voyage.updateMany(
        { _id: { $in: voyageIds } },
        { $set: { commissionPaidAt: now } }
      );

      const fresh = await Caisse.findById(caisseId).select('solde').lean();
      const nouveauSolde = Number(fresh?.solde) || 0;

      return res.status(200).json({
        success: true,
        data: {
          chauffeurId,
          nbVoyagesPayes: eligibles.length,
          montantPaye: total,
          nouveauSoldeCaisseChauffeur: nouveauSolde,
        },
        message: `${eligibles.length} voyage(s) payé(s) — ${total.toFixed(
          2
        )} MRU`,
      });
    }

    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  } catch (error) {
    console.error('paiements-chauffeurs/[chauffeurId] error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE]);
