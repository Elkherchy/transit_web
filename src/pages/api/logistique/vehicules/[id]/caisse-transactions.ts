import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, Vehicule } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  PaginatedResponse,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

type VehiculeDailyRow = {
  date: string;
  credit: number;
  debit: number;
  message: string;
};

type VehiculeCaisseTransactionsData = PaginatedResponse<VehiculeDailyRow> & {
  vehicule: { _id: string; matricule: string };
  totalCredit: number;
  totalDebit: number;
  totalGagne: number;
};

async function listVehiculeCaisseTransactions(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<VehiculeCaisseTransactionsData>>
) {
  try {
    await connectDB();

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID vehicule invalide' });
    }

    const vehicule = await Vehicule.findById(id).select('_id matricule').lean();
    if (!vehicule) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    const matNorm = String(vehicule.matricule || '').trim().toUpperCase();

    // Récupère la caisse VEHICULE liée (créée à la 1re réservation d'un voyage
    // sur ce matricule). Les transactions du nouveau workflow logistique sont
    // enregistrées sur `caisseId`, pas sur les anciens champs vehiculeId /
    // vehiculeMatricule.
    const caisseVehicule = matNorm
      ? await Caisse.findOne({
          kind: CaisseKind.VEHICULE,
          vehiculeMatricule: matNorm,
        })
          .select('_id')
          .lean()
      : null;

    const orClauses: Record<string, unknown>[] = [
      { vehiculeId: String(vehicule._id) },
      { vehiculeMatricule: matNorm },
    ];
    if (caisseVehicule?._id) {
      orClauses.push({ caisseId: caisseVehicule._id });
    }

    const match = { $or: orClauses };

    const grouped = await Transaction.aggregate<{
      _id: string;
      credit: number;
      debit: number;
      messages: string[];
    }>([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$date',
              timezone: 'Africa/Nouakchott',
            },
          },
          credit: {
            $sum: {
              $cond: [{ $eq: ['$type', TransactionType.CREDIT] }, '$montant', 0],
            },
          },
          debit: {
            $sum: {
              $cond: [{ $eq: ['$type', TransactionType.DEBIT] }, '$montant', 0],
            },
          },
          messages: { $addToSet: '$description' },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const totalCredit = grouped.reduce((acc, row) => acc + Number(row.credit || 0), 0);
    const totalDebit = grouped.reduce((acc, row) => acc + Number(row.debit || 0), 0);
    const totalGagne = totalCredit - totalDebit;

    const total = grouped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const data = grouped.slice(start, start + limit).map((row) => ({
      date: row._id,
      credit: Number(row.credit || 0),
      debit: Number(row.debit || 0),
      message: Array.isArray(row.messages)
        ? row.messages
            .map((m) => String(m || '').trim())
            .filter((m) => Boolean(m))
            .join(' | ')
        : '',
    }));

    return res.status(200).json({
      success: true,
      data: {
        data,
        total,
        page: safePage,
        limit,
        totalPages,
        vehicule: {
          _id: String(vehicule._id),
          matricule: String(vehicule.matricule || ''),
        },
        totalCredit,
        totalDebit,
        totalGagne,
      },
    });
  } catch (error) {
    console.error('Vehicule caisse transactions error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listVehiculeCaisseTransactions)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
