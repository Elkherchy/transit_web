import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { CreditCompte, Transaction } from '@/models';
import { ensureClientCaisse, ensureDefaultGeneralCaisse } from '@/lib/caisse';
import { ApiResponse, ICreditCompte, UserRole, CaisseType, TransactionType } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import mongoose from 'mongoose';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ICreditCompte>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  const role = req.user!.role;
  const isAdmin = role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT;
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Réservé aux administrateurs' });
  }

  const { id } = req.query;
  if (!id || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  await connectDB();

  const doc = await CreditCompte.findById(String(id));
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Crédit compte introuvable' });
  }

  if (doc.statut !== 'EN_ATTENTE') {
    return res.status(400).json({ success: false, error: 'Ce crédit n\'est pas en attente de validation' });
  }

  // action: 'valider' | 'rejeter'
  const action = (req.body?.action as string) || 'valider';

  if (action === 'rejeter') {
    doc.statut = 'ANNULE';
    await doc.save();
    return res.status(200).json({ success: true, data: doc.toObject() as unknown as ICreditCompte });
  }

  // Validate → ACTIF + create transactions
  doc.statut = 'ACTIF';
  await doc.save();

  const { clientId, clientNom, montant, numero, reference, caisseClientId } = doc;

  // Ensure client caisse exists
  const caisseId = caisseClientId
    ? caisseClientId
    : String(await ensureClientCaisse(String(clientId), String(clientNom)));

  // CREDIT on client caisse (idempotent)
  const srcClient = `cc-client-${String(doc._id)}`;
  if (!(await Transaction.findOne({ sourcePaiementId: srcClient }))) {
    await Transaction.create({
      caisseId,
      type: TransactionType.CREDIT,
      montant: Number(montant),
      description: `Crédit compte — ${clientNom}${reference ? ` (${reference})` : ''} [${numero}]`,
      date: new Date(),
      reference: numero,
      userId: req.user!.userId,
      sourcePaiementId: srcClient,
    });
  }

  // CREDIT on General_Transit caisse (idempotent)
  try {
    const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
    const srcGen = `cc-general-${String(doc._id)}`;
    if (!(await Transaction.findOne({ sourcePaiementId: srcGen }))) {
      await Transaction.create({
        caisseId: general._id,
        type: TransactionType.CREDIT,
        montant: Number(montant),
        description: `Crédit compte client — ${clientNom} [${numero}]`,
        date: new Date(),
        reference: numero,
        userId: req.user!.userId,
        sourcePaiementId: srcGen,
      });
    }
  } catch (txErr) {
    console.error('CreditCompte validation → General caisse error:', txErr);
  }

  return res.status(200).json({ success: true, data: doc.toObject() as unknown as ICreditCompte });
}

export default withAuth(handler);
