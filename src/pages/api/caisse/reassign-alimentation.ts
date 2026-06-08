import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, JourneeCaisse, Transaction, User } from '@/models';
import { ApiResponse, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensurePayeurUserCaisse } from '@/lib/caisse';

/**
 * POST /api/caisse/reassign-alimentation
 * Réaffecte une alimentation d'un payeur vers un autre.
 * Body : { transactionId, newPayeurId }
 *
 * Effets :
 *   - DEBIT caisse ancien payeur (annulation du crédit initial)
 *   - CREDIT caisse nouveau payeur
 *   - Met à jour l'entrée `alimentationsPayeurs` dans la journée
 *   - Met à jour `Caisse.solde` pour les deux caisses
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ transactionId: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const { transactionId, newPayeurId } = req.body || {};

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ success: false, error: 'transactionId requis' });
    }
    if (!newPayeurId || !mongoose.isValidObjectId(String(newPayeurId))) {
      return res.status(400).json({ success: false, error: 'newPayeurId invalide' });
    }

    // Trouver la journée contenant cet alimentation
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

    const oldPayeurId = String((entry as { payeurId: string }).payeurId);
    const oldCaisseId = String((entry as { caisseId: string }).caisseId);
    const montant = Number((entry as { montant: number }).montant);

    if (oldPayeurId === String(newPayeurId)) {
      return res.status(400).json({ success: false, error: 'Le nouveau payeur est identique à l\'ancien' });
    }

    // Vérifier que le nouveau payeur existe
    const newPayeur = await User.findById(newPayeurId).select('_id nom role actif').lean();
    if (!newPayeur || newPayeur.role !== UserRole.USER_PAYEUR) {
      return res.status(404).json({ success: false, error: 'Nouveau payeur introuvable ou rôle non éligible' });
    }
    if (!newPayeur.actif) {
      return res.status(400).json({ success: false, error: 'Le nouveau payeur est inactif' });
    }

    // Caisse de l'ancien payeur
    const oldCaisse = await Caisse.findById(oldCaisseId).lean();
    if (!oldCaisse) {
      return res.status(404).json({ success: false, error: 'Caisse de l\'ancien payeur introuvable' });
    }

    // Caisse du nouveau payeur (créée si inexistante)
    const newCaisseId = await ensurePayeurUserCaisse(String(newPayeurId));

    const date = new Date();
    const reference = `reassign-${transactionId}`;

    // 1. DEBIT ancien payeur (annulation)
    await Transaction.create({
      caisseId: oldCaisseId,
      type: TransactionType.DEBIT,
      montant,
      description: `Réaffectation → ${newPayeur.nom}`,
      date,
      reference,
      userId: req.user!.userId,
    });
    await Caisse.findByIdAndUpdate(oldCaisseId, { $inc: { solde: -montant } });

    // 2. CREDIT nouveau payeur
    const newCredit = await Transaction.create({
      caisseId: newCaisseId,
      type: TransactionType.CREDIT,
      montant,
      description: `Réaffectation depuis un autre payeur`,
      date,
      reference,
      userId: req.user!.userId,
    });
    await Caisse.findByIdAndUpdate(newCaisseId, { $inc: { solde: montant } });

    // 3. Mettre à jour l'entrée dans la journée
    await JourneeCaisse.updateOne(
      {
        _id: journee._id,
        'alimentationsPayeurs.transactionId': transactionId,
      },
      {
        $set: {
          'alimentationsPayeurs.$.payeurId': String(newPayeurId),
          'alimentationsPayeurs.$.caisseId': String(newCaisseId),
          'alimentationsPayeurs.$.transactionId': String(newCredit._id),
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: { transactionId: String(newCredit._id) },
      message: `Alimentation réaffectée à ${newPayeur.nom}`,
    });
  } catch (error) {
    console.error('Reassign alimentation error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
