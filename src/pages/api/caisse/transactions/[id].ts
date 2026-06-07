import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, User } from '@/models';
import { ApiResponse, ITransaction, TransactionType, UserRole, CaisseKind } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { mirrorDescriptionForGeneral } from '@/lib/caisse';

function isTransactionRecent(transactionDate: Date): boolean {
  const now = new Date();
  const transactionTime = new Date(transactionDate).getTime();
  const diffInHours = (now.getTime() - transactionTime) / (1000 * 60 * 60);
  return diffInHours <= 24;
}

function serializeTx(doc: Record<string, unknown>): ITransaction {
  return {
    _id: String(doc._id),
    caisseId: String(doc.caisseId),
    type: doc.type as ITransaction['type'],
    montant: doc.montant as number,
    description: doc.description as string,
    date: doc.date as Date,
    reference: doc.reference as string | undefined,
    userId: doc.userId as string,
    mirrorSourceId: doc.mirrorSourceId ? String(doc.mirrorSourceId) : undefined,
    sourcePaiementId: doc.sourcePaiementId
      ? String(doc.sourcePaiementId)
      : undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function canMutateTransaction(
  userId: string,
  role: UserRole,
  primaryCaisseId: mongoose.Types.ObjectId
): Promise<boolean> {
  if (role === UserRole.ADMIN || role === UserRole.COMPTABLE) return true;
  const c = await Caisse.findById(primaryCaisseId).lean();
  if (!c) return false;
  return (
    role === UserRole.USER_PAYEUR &&
    c.kind === CaisseKind.USER &&
    c.payeurId === userId
  );
}

async function syncMirrorsFromPrimary(primary: InstanceType<typeof Transaction>) {
  const caisse = await Caisse.findById(primary.caisseId).lean();
  let nom = 'Payeur';
  if (caisse?.payeurId) {
    const pu = await User.findById(caisse.payeurId).select('nom').lean();
    if (pu?.nom) nom = pu.nom;
  }

  const mirrors = await Transaction.find({ mirrorSourceId: primary._id });
  for (const m of mirrors) {
    m.type = primary.type;
    m.montant = primary.montant;
    m.date = primary.date;
    m.reference = primary.reference;
    m.description = mirrorDescriptionForGeneral(nom, primary.description);
    if (primary.sourcePaiementId) {
      m.sourcePaiementId = primary.sourcePaiementId;
    }
    await m.save();
  }
}

async function getTransaction(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransaction>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const transaction = await Transaction.findById(id).lean();
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction non trouvée' });
    }

    const c = await Caisse.findById(transaction.caisseId).lean();
    if (!c) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    const u = req.user!;
    if (u.role === UserRole.USER_PAYEUR) {
      if (c.kind !== CaisseKind.USER || c.payeurId !== u.userId) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
    } else if (u.role !== UserRole.ADMIN && u.role !== UserRole.COMPTABLE) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    return res.status(200).json({
      success: true,
      data: serializeTx(transaction as unknown as Record<string, unknown>),
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateTransaction(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransaction>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction non trouvée' });
    }

    if (transaction.mirrorSourceId) {
      return res.status(400).json({
        success: false,
        error: 'Modifiez cette opération depuis la caisse du payeur',
      });
    }

    if (!isTransactionRecent(transaction.createdAt)) {
      return res.status(400).json({
        success: false,
        error: 'Modifications possibles uniquement dans les 24 h suivant la création',
      });
    }

    const u = req.user!;
    if (!(await canMutateTransaction(u.userId, u.role, transaction.caisseId))) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const { type, montant, description, date, reference } = req.body;

    if (type && !Object.values(TransactionType).includes(type)) {
      return res.status(400).json({ success: false, error: 'Type invalide' });
    }
    if (montant !== undefined && montant <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    if (type) transaction.type = type;
    if (montant !== undefined) transaction.montant = montant;
    if (description) transaction.description = String(description).trim();
    if (date) transaction.date = date;
    if (reference !== undefined) transaction.reference = reference ? String(reference).trim() : undefined;

    await transaction.save();

    const caisse = await Caisse.findById(transaction.caisseId).lean();
    if (caisse?.kind === CaisseKind.USER) {
      await syncMirrorsFromPrimary(transaction);
    }

    const fresh = await Transaction.findById(transaction._id).lean();
    return res.status(200).json({
      success: true,
      data: serializeTx(fresh as unknown as Record<string, unknown>),
      message: 'Transaction mise à jour',
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function deleteTransaction(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<null>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const t = await Transaction.findById(id);
    if (!t) {
      return res.status(404).json({ success: false, error: 'Transaction non trouvée' });
    }

    const primaryId = t.mirrorSourceId ? new mongoose.Types.ObjectId(String(t.mirrorSourceId)) : t._id;
    const primary = await Transaction.findById(primaryId);
    if (!primary) {
      return res.status(404).json({ success: false, error: 'Transaction non trouvée' });
    }

    if (!isTransactionRecent(primary.createdAt)) {
      return res.status(400).json({
        success: false,
        error: 'Suppression possible uniquement dans les 24 h suivant la création',
      });
    }

    const u = req.user!;
    if (!(await canMutateTransaction(u.userId, u.role, primary.caisseId))) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    await Transaction.deleteMany({
      $or: [{ _id: primary._id }, { mirrorSourceId: primary._id }],
    });

    return res.status(200).json({ success: true, message: 'Transaction supprimée' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getTransaction)(req, res);
    case 'PUT':
      return withAuth(updateTransaction)(req, res);
    case 'DELETE':
      return withAuth(deleteTransaction)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
