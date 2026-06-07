import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, FichierLogistique, Transaction, Voyage } from '@/models';
import {
  ApiResponse,
  FichierLogistiqueStatus,
  TransactionType,
  UserRole,
  VoyageStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureVehiculeCaisse } from '@/lib/caisse';

interface ValidateOneResult {
  voyageId: string;
  fichierStatut: FichierLogistiqueStatus;
  prixCredit: number;
  commissionDebit: number;
}

/**
 * POST /api/logistique/voyages/[id]/valider-transit
 *
 * Validation transit d'UN seul voyage (workflow voyage-par-voyage demandé
 * par l'agent transit). Crée les 2 transactions sur la caisse VEHICULE
 * du matricule (idempotentes via `sourcePaiementId`) :
 *   - CREDIT prix transport  → `voyage-{id}-prix-transport`
 *   - DEBIT  commission       → `voyage-{id}-commission-vehicule`
 *
 * Le voyage passe à VALIDE. Si tous les voyages du fichier deviennent
 * VALIDE, le fichier passe automatiquement à VALIDE aussi.
 *
 * Auth : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ValidateOneResult>>
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

    const voyage = await Voyage.findById(id);
    if (!voyage) {
      return res
        .status(404)
        .json({ success: false, error: 'Voyage introuvable' });
    }

    if (voyage.statutVoyage === VoyageStatus.VALIDE) {
      return res
        .status(400)
        .json({ success: false, error: 'Ce voyage est déjà validé' });
    }
    if (voyage.statutVoyage !== VoyageStatus.RETOURNE) {
      return res.status(400).json({
        success: false,
        error: 'Le voyage doit être retourné avant validation',
      });
    }

    // Le fichier doit être prêt pour validation (ou déjà validé partiellement).
    const fichier = voyage.fichierLogistiqueId
      ? await FichierLogistique.findById(voyage.fichierLogistiqueId)
      : null;
    if (
      fichier &&
      fichier.statut !== FichierLogistiqueStatus.PRET_VALIDATION &&
      fichier.statut !== FichierLogistiqueStatus.VALIDE
    ) {
      return res.status(400).json({
        success: false,
        error: 'Le dossier n\'est pas encore soumis pour validation',
      });
    }

    // Overrides prix/commission saisis par le user TRANSIT — appliqués sur
    // le voyage avant création des transactions, comme pour la validation
    // au niveau fichier.
    const { prixTransport: prixOverride, commissionChauffeur: comOverride } =
      (req.body || {}) as { prixTransport?: number; commissionChauffeur?: number };
    if (
      prixOverride !== undefined &&
      Number.isFinite(Number(prixOverride)) &&
      Number(prixOverride) >= 0
    ) {
      voyage.prixTransport = Number(prixOverride);
    }
    if (
      comOverride !== undefined &&
      Number.isFinite(Number(comOverride)) &&
      Number(comOverride) >= 0
    ) {
      voyage.commissionChauffeur = Number(comOverride);
    }

    const uid = req.user!.userId;
    const now = new Date();
    const matricule = String(voyage.matricule || '').trim().toUpperCase();
    const prix = Number(voyage.prixTransport) || 0;
    const commission = Number(voyage.commissionChauffeur) || 0;
    const voyageId = String(voyage._id);
    const label = voyage.bl || voyage.ntc || voyageId;

    let prixCredit = 0;
    let commissionDebit = 0;

    if (matricule) {
      const vehiculeCaisseId = await ensureVehiculeCaisse(matricule);

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
        prixCredit = prix;
      }

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
        commissionDebit = commission;
      }
    }

    voyage.statutVoyage = VoyageStatus.VALIDE;
    voyage.valideTransitBy = uid;
    voyage.valideTransitAt = now;
    await voyage.save();

    // Si tous les voyages du fichier sont VALIDE, on passe le fichier à VALIDE.
    let nextFichierStatut: FichierLogistiqueStatus =
      fichier?.statut || FichierLogistiqueStatus.PRET_VALIDATION;
    if (fichier && fichier.statut !== FichierLogistiqueStatus.VALIDE) {
      const remaining = await Voyage.countDocuments({
        fichierLogistiqueId: fichier._id,
        statutVoyage: { $ne: VoyageStatus.VALIDE },
      });
      if (remaining === 0) {
        fichier.statut = FichierLogistiqueStatus.VALIDE;
        fichier.valideTransitBy = uid;
        fichier.valideTransitAt = now;
        await fichier.save();
        nextFichierStatut = FichierLogistiqueStatus.VALIDE;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        voyageId,
        fichierStatut: nextFichierStatut,
        prixCredit,
        commissionDebit,
      },
      message: 'Voyage validé',
    });
  } catch (error) {
    console.error('POST /api/logistique/voyages/[id]/valider-transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
]);
