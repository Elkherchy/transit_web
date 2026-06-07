import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FichierLogistique, Voyage, Caisse, Transaction } from '@/models';
import {
  ApiResponse,
  FichierLogistiqueStatus,
  TransactionType,
  UserRole,
  VoyageStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureVehiculeCaisse } from '@/lib/caisse';

interface ValidationResult {
  fichierId: string;
  voyagesValides: number;
  totalCreditVehicules: number;
  totalDebitCommissions: number;
}

/**
 * POST /api/logistique/fichiers/[id]/valider
 *
 * Validation transit du dossier — pour chaque voyage RETOURNE, deux
 * transactions sont créées sur la caisse VEHICULE (matricule) :
 *   - **CREDIT** `prixTransport` (revenu du véhicule sur ce voyage)
 *   - **DEBIT** `commissionChauffeur` (la commission du chauffeur est
 *     prélevée sur le revenu du véhicule)
 *
 * Toutes les opérations sont **idempotentes** :
 *   - crédit prix transport  → `voyage-{id}-prix-transport`
 *   - débit commission       → `voyage-{id}-commission-vehicule`
 *
 * Voyage passe à VALIDE + valideTransitBy/At.
 * FichierLogistique passe à VALIDE + valideTransitBy/At.
 *
 * Auth : ADMIN, AGENT_TRANSIT
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ValidationResult>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const fichier = await FichierLogistique.findById(id);
    if (!fichier) {
      return res.status(404).json({ success: false, error: 'Fichier introuvable' });
    }

    if (fichier.statut === FichierLogistiqueStatus.VALIDE) {
      return res.status(400).json({
        success: false,
        error: 'Fichier déjà validé',
      });
    }

    // Prix transport & Commission chauffeur saisis par le user TRANSIT au
    // moment de la validation — appliqués identiquement à chaque voyage.
    // Si non fournis, on conserve la valeur stockée sur le voyage.
    const { prixTransport: prixOverride, commissionChauffeur: comOverride } =
      (req.body || {}) as { prixTransport?: number; commissionChauffeur?: number };
    const hasPrixOverride =
      prixOverride !== undefined &&
      Number.isFinite(Number(prixOverride)) &&
      Number(prixOverride) >= 0;
    const hasComOverride =
      comOverride !== undefined &&
      Number.isFinite(Number(comOverride)) &&
      Number(comOverride) >= 0;
    const prixUnit = hasPrixOverride ? Number(prixOverride) : null;
    const comUnit = hasComOverride ? Number(comOverride) : null;

    const voyages = await Voyage.find({ fichierLogistiqueId: id });
    if (voyages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucun voyage dans ce dossier',
      });
    }

    const notReturned = voyages.filter(
      (v) =>
        v.statutVoyage !== VoyageStatus.RETOURNE &&
        v.statutVoyage !== VoyageStatus.VALIDE
    );
    if (notReturned.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${notReturned.length} voyage(s) ne sont pas encore retournés`,
      });
    }

    const uid = req.user!.userId;
    const now = new Date();
    let voyagesValides = 0;
    let totalCredit = 0;
    let totalDebitCommission = 0;

    for (const voyage of voyages) {
      if (voyage.statutVoyage === VoyageStatus.VALIDE) {
        continue;
      }

      // Si overrides fournis par le user TRANSIT, on les persiste sur le voyage
      // avant de créer les transactions, pour que tout le reste du système
      // (factures, mouvements caisse, etc.) reflète les bons montants.
      if (prixUnit !== null) voyage.prixTransport = prixUnit;
      if (comUnit !== null) voyage.commissionChauffeur = comUnit;

      const matricule = String(voyage.matricule || '').trim().toUpperCase();
      const prix = Number(voyage.prixTransport) || 0;
      const commission = Number(voyage.commissionChauffeur) || 0;
      const voyageId = String(voyage._id);
      const label = voyage.bl || voyage.ntc || voyageId;

      if (!matricule) {
        // Pas de matricule (cas anormal) — on saute crédit/débit, mais on valide.
        voyage.statutVoyage = VoyageStatus.VALIDE;
        voyage.valideTransitBy = uid;
        voyage.valideTransitAt = now;
        await voyage.save();
        voyagesValides += 1;
        continue;
      }

      const vehiculeCaisseId = await ensureVehiculeCaisse(matricule);

      // 1. CREDIT prix transport (revenu véhicule)
      const refCredit = `voyage-${voyageId}-prix-transport`;
      const dupCredit = await Transaction.findOne({
        sourcePaiementId: refCredit,
      });
      if (!dupCredit && prix > 0) {
        await Transaction.create({
          caisseId: vehiculeCaisseId,
          type: TransactionType.CREDIT,
          montant: prix,
          description: `Prix transport — ${label} (${matricule})`,
          date: now,
          reference: voyageId,
          userId: uid,
          sourcePaiementId: refCredit,
        });
        await Caisse.findByIdAndUpdate(vehiculeCaisseId, {
          $inc: { solde: prix },
        });
        totalCredit += prix;
      }

      // 2. DEBIT commission chauffeur (prélevée sur le revenu véhicule)
      const refDebit = `voyage-${voyageId}-commission-vehicule`;
      const dupDebit = await Transaction.findOne({
        sourcePaiementId: refDebit,
      });
      if (!dupDebit && commission > 0) {
        await Transaction.create({
          caisseId: vehiculeCaisseId,
          type: TransactionType.DEBIT,
          montant: commission,
          description: `Commission chauffeur — ${label} (${matricule})`,
          date: now,
          reference: voyageId,
          userId: uid,
          sourcePaiementId: refDebit,
        });
        await Caisse.findByIdAndUpdate(vehiculeCaisseId, {
          $inc: { solde: -commission },
        });
        totalDebitCommission += commission;
      }

      voyage.statutVoyage = VoyageStatus.VALIDE;
      voyage.valideTransitBy = uid;
      voyage.valideTransitAt = now;
      await voyage.save();
      voyagesValides += 1;
    }

    fichier.statut = FichierLogistiqueStatus.VALIDE;
    fichier.valideTransitBy = uid;
    fichier.valideTransitAt = now;
    await fichier.save();

    return res.status(200).json({
      success: true,
      data: {
        fichierId: String(fichier._id),
        voyagesValides,
        totalCreditVehicules: totalCredit,
        totalDebitCommissions: totalDebitCommission,
      },
      message: `Dossier validé — ${voyagesValides} voyage(s) · +${totalCredit.toFixed(
        2
      )} MRU prix transport · −${totalDebitCommission.toFixed(2)} MRU commissions sur caisses véhicules`,
    });
  } catch (error) {
    console.error('POST /api/logistique/fichiers/[id]/valider error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT]);
