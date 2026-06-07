import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, JourneeCaisse, User } from '@/models';
import {
  ApiResponse,
  TransactionType,
  UserRole,
  JourneeCaisseStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import {
  ensureDefaultGeneralCaisse,
  ensurePayeurUserCaisse,
  getSoldeMapForCaisseIds,
  mirrorDescriptionForGeneral,
} from '@/lib/caisse';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';

/**
 * POST /api/caisse/alimenter-payeur
 * Caissier alimente la caisse d'un payeur depuis la caisse générale.
 * Body : { payeurId: string, montant: number, description?: string }
 *
 * Effets :
 *   - DEBIT caisse générale
 *   - CREDIT caisse du payeur (kind=USER)
 *   - L'opération est rattachée à la journée caisse OUVERTE du caissier
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ transactionId: string; nouveauSoldePayeur: number }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const { payeurId, montant, description } = req.body || {};

    if (!payeurId || !mongoose.isValidObjectId(String(payeurId))) {
      return res.status(400).json({ success: false, error: 'payeurId invalide' });
    }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    const payeur = await User.findById(payeurId).select('_id nom role actif').lean();
    // Le caissier peut alimenter la caisse d'un USER_PAYEUR (paiement
    // designations transit) ou d'un AGENT_RECEPTION_LOGISTIQUE (frais
    // opérationnels logistique).
    const ALIMENTABLE_ROLES = [
      UserRole.USER_PAYEUR,
      UserRole.AGENT_RECEPTION_LOGISTIQUE,
    ];
    if (!payeur || !ALIMENTABLE_ROLES.includes(payeur.role as UserRole)) {
      return res
        .status(404)
        .json({ success: false, error: 'Utilisateur introuvable ou rôle non éligible' });
    }
    if (!payeur.actif) {
      return res
        .status(400)
        .json({ success: false, error: 'Utilisateur inactif' });
    }

    const general = await ensureDefaultGeneralCaisse();
    if (!general) {
      return res.status(500).json({ success: false, error: 'Caisse générale introuvable' });
    }

    // Vérifier solde caisse générale.
    const generalIdObj = general._id as mongoose.Types.ObjectId;
    const soldes = await getSoldeMapForCaisseIds([generalIdObj]);
    const soldeGeneral = soldes.get(String(general._id)) ?? general.solde ?? 0;
    if (soldeGeneral < m) {
      return res.status(400).json({
        success: false,
        error: `Solde caisse générale insuffisant (${soldeGeneral.toFixed(2)} MRU)`,
      });
    }

    const payeurCaisseId = await ensurePayeurUserCaisse(String(payeurId));

    const journee = await getOrCreateOpenJournee(req.user!.userId);
    if (journee.statut !== JourneeCaisseStatus.OUVERTE) {
      return res.status(400).json({
        success: false,
        error:
          'Votre journée est déjà clôturée. Aucune nouvelle alimentation possible aujourd’hui.',
      });
    }

    const desc =
      (description && String(description).trim()) ||
      `Alimentation caisse — ${payeur.nom}`;
    const reference = `journee-${journee._id}`;
    const date = new Date();

    // DEBIT caisse générale.
    const debit = await Transaction.create({
      caisseId: general._id,
      type: TransactionType.DEBIT,
      montant: m,
      description: mirrorDescriptionForGeneral(payeur.nom, desc),
      date,
      reference,
      userId: req.user!.userId,
    });

    // CREDIT caisse payeur (mirror du débit côté payeur).
    const credit = await Transaction.create({
      caisseId: payeurCaisseId,
      type: TransactionType.CREDIT,
      montant: m,
      description: desc,
      date,
      reference,
      userId: req.user!.userId,
      mirrorSourceId: debit._id,
    });

    // Mettre à jour le solde stocké côté caisses (best-effort).
    await Promise.all([
      Caisse.findByIdAndUpdate(general._id, { $inc: { solde: -m } }),
      Caisse.findByIdAndUpdate(payeurCaisseId, { $inc: { solde: m } }),
    ]);

    // Trace l'alimentation dans la journée.
    await JourneeCaisse.findByIdAndUpdate(journee._id, {
      $push: {
        alimentationsPayeurs: {
          transactionId: String(credit._id),
          payeurId: String(payeurId),
          caisseId: String(payeurCaisseId),
          montant: m,
          date,
        },
      },
    });

    const fresh = await getSoldeMapForCaisseIds([payeurCaisseId]);
    const nouveauSolde = fresh.get(String(payeurCaisseId)) ?? 0;

    return res.status(201).json({
      success: true,
      data: {
        transactionId: String(credit._id),
        nouveauSoldePayeur: nouveauSolde,
      },
      message: 'Caisse payeur alimentée',
    });
  } catch (error) {
    console.error('Alimenter payeur error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
