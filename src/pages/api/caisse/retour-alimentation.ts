import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Caisse, JourneeCaisse, Transaction } from '@/models';
import { ApiResponse, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse } from '@/lib/caisse';

/**
 * POST /api/caisse/retour-alimentation
 * Retourne tout ou partie d'une alimentation payeur vers la caisse générale.
 * Body : { transactionId, montant? }
 *   - montant omis ou >= montant original → retour total (supprime l'entrée journée)
 *   - montant < montant original → retour partiel (réduit l'entrée journée)
 *
 * Effets :
 *   - DEBIT caisse du payeur pour le montant retourné
 *   - CREDIT caisse générale pour le même montant
 *   - Met à jour `Caisse.solde` pour les deux caisses
 *   - Retour total  : $pull de l'entrée alimentationsPayeurs
 *   - Retour partiel : $set montant restant dans l'entrée
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ ok: true; montantRetourne: number; partiel: boolean }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const { transactionId, montant: rawMontant } = req.body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionId requis' });
    }

    const journee = await JourneeCaisse.findOne({
      'alimentationsPayeurs.transactionId': transactionId,
    });
    if (!journee) {
      return res.status(404).json({ success: false, error: 'Alimentation introuvable' });
    }

    const entry = journee.alimentationsPayeurs.find(
      (a: { transactionId: string }) => String(a.transactionId) === String(transactionId)
    );
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Alimentation introuvable dans la journée' });
    }

    const oldCaisseId = String((entry as { caisseId: string }).caisseId);
    const montantTotal = Number((entry as { montant: number }).montant);

    // Montant à retourner (défaut = total)
    const montantRetourne = rawMontant !== undefined && rawMontant !== null
      ? Math.min(Number(rawMontant), montantTotal)
      : montantTotal;

    if (!Number.isFinite(montantRetourne) || montantRetourne <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    const general = await ensureDefaultGeneralCaisse();
    if (!general) {
      return res.status(500).json({ success: false, error: 'Caisse générale introuvable' });
    }

    const date = new Date();
    const reference = `retour-${transactionId}`;
    const partiel = montantRetourne < montantTotal;

    // DEBIT caisse payeur
    await Transaction.create({
      caisseId: oldCaisseId,
      type: TransactionType.DEBIT,
      montant: montantRetourne,
      description: partiel
        ? `Retour partiel vers la caisse générale (${montantRetourne.toFixed(2)} MRU)`
        : 'Retour vers la caisse générale',
      date,
      reference,
      userId: req.user!.userId,
    });
    await Caisse.findByIdAndUpdate(oldCaisseId, { $inc: { solde: -montantRetourne } });

    // CREDIT caisse générale
    await Transaction.create({
      caisseId: general._id,
      type: TransactionType.CREDIT,
      montant: montantRetourne,
      description: partiel
        ? `Retour partiel alimentation payeur (${montantRetourne.toFixed(2)} MRU)`
        : 'Retour alimentation payeur',
      date,
      reference,
      userId: req.user!.userId,
    });
    await Caisse.findByIdAndUpdate(general._id, { $inc: { solde: montantRetourne } });

    if (partiel) {
      // Réduire le montant restant dans l'entrée journée
      await JourneeCaisse.updateOne(
        { _id: journee._id, 'alimentationsPayeurs.transactionId': transactionId },
        { $inc: { 'alimentationsPayeurs.$.montant': -montantRetourne } }
      );
    } else {
      // Supprimer l'entrée de la journée
      await JourneeCaisse.findByIdAndUpdate(journee._id, {
        $pull: { alimentationsPayeurs: { transactionId: String(transactionId) } },
      });
    }

    return res.status(200).json({
      success: true,
      data: { ok: true, montantRetourne, partiel },
      message: partiel
        ? `Retour partiel de ${montantRetourne.toFixed(2)} MRU effectué`
        : 'Alimentation retournée à la caisse générale',
    });
  } catch (error) {
    console.error('Retour alimentation error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
