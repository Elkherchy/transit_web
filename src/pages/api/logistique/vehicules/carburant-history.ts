import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { CarburantHistorique, Transaction, Vehicule } from '@/models';
import {
  ApiResponse,
  CaisseType,
  CarburantHistoriqueSource,
  CarburantHistoriqueType,
  ICarburantHistoriqueResponse,
  PaginatedResponse,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import { ensureBanqueCaisse } from '@/lib/caisse';

type HistoryRowLike = {
  _id: unknown;
  vehiculeId: unknown;
  matricule: unknown;
  type: ICarburantHistoriqueResponse['type'];
  source: ICarburantHistoriqueResponse['source'];
  fuelDate?: Date;
  quantite?: number;
  before?: number;
  after?: number;
  compteurPrecedentKm?: number;
  compteurActuelKm?: number;
  nombreTrajets?: number;
  rendementCarburantParTrajet?: number;
  rendementCompteurParTrajet?: number;
  distanceKm?: number;
  consommationL100?: number;
  batchKey?: string;
  note?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

function mapHistoryRow(row: HistoryRowLike): ICarburantHistoriqueResponse {
  return {
    _id: String(row._id),
    vehiculeId: String(row.vehiculeId),
    matricule: String(row.matricule),
    type: row.type,
    source: row.source,
    fuelDate: row.fuelDate,
    quantite: Number(row.quantite || 0),
    before: Number(row.before || 0),
    after: Number(row.after || 0),
    compteurPrecedentKm:
      row.compteurPrecedentKm === undefined ? undefined : Number(row.compteurPrecedentKm || 0),
    compteurActuelKm:
      row.compteurActuelKm === undefined ? undefined : Number(row.compteurActuelKm || 0),
    nombreTrajets: row.nombreTrajets === undefined ? undefined : Number(row.nombreTrajets || 0),
    rendementCarburantParTrajet:
      row.rendementCarburantParTrajet === undefined
        ? undefined
        : Number(row.rendementCarburantParTrajet || 0),
    rendementCompteurParTrajet:
      row.rendementCompteurParTrajet === undefined
        ? undefined
        : Number(row.rendementCompteurParTrajet || 0),
    distanceKm: row.distanceKm === undefined ? undefined : Number(row.distanceKm || 0),
    consommationL100:
      row.consommationL100 === undefined ? undefined : Number(row.consommationL100 || 0),
    batchKey: row.batchKey || undefined,
    note: row.note || undefined,
    createdBy: row.createdBy || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listHistory(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<ICarburantHistoriqueResponse>>>
) {
  try {
    await connectDB();

    const { page = '1', limit = '20', vehiculeId, matricule } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    const normalizedVehiculeId = String(vehiculeId || '').trim();
    const normalizedMatricule = String(matricule || '').trim().toUpperCase();

    if (normalizedVehiculeId) query.vehiculeId = normalizedVehiculeId;
    if (normalizedMatricule) query.matricule = normalizedMatricule;

    const [rows, total] = await Promise.all([
      CarburantHistorique.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      CarburantHistorique.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        data: rows.map(mapHistoryRow),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List carburant history error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function addCarburant(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ICarburantHistoriqueResponse>>
) {
  try {
    await connectDB();

    const { vehiculeId, matricule, amount, note, fuelDate } = req.body as {
      vehiculeId?: string;
      matricule?: string;
      amount?: number;
      note?: string;
      fuelDate?: string;
    };

    const normalizedVehiculeId = String(vehiculeId || '').trim();
    const normalizedMatricule = String(matricule || '').trim().toUpperCase();
    const quantity = Number(amount || 0);
    const parsedFuelDate = fuelDate ? new Date(fuelDate) : undefined;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Montant ajout invalide' });
    }

    const vehicule = normalizedVehiculeId
      ? await Vehicule.findById(normalizedVehiculeId)
      : await Vehicule.findOne({ matricule: normalizedMatricule });

    if (!vehicule) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    const before = Number(vehicule.carburant || 0);
    const after = before + quantity;
    vehicule.carburant = after;
    await vehicule.save();

    const history = await CarburantHistorique.create({
      vehiculeId: String(vehicule._id),
      matricule: String(vehicule.matricule || '').trim().toUpperCase(),
      type: CarburantHistoriqueType.AJOUT,
      source: CarburantHistoriqueSource.MANUEL,
      fuelDate:
        parsedFuelDate && !Number.isNaN(parsedFuelDate.getTime()) ? parsedFuelDate : undefined,
      quantite: quantity,
      before,
      after,
      note: String(note || '').trim() || undefined,
      createdBy: req.user?.userId,
    });

    // Domaine logistique : ajout carburant → Banque_Logistique.
    const banque = await ensureBanqueCaisse(CaisseType.LOGISTIQUE);
    await Transaction.create({
      caisseId: banque._id,
      type: TransactionType.DEBIT,
      montant: quantity,
      description: `Ajout carburant vehicule ${String(vehicule.matricule || '').trim().toUpperCase()}`,
      date:
        parsedFuelDate && !Number.isNaN(parsedFuelDate.getTime()) ? parsedFuelDate : new Date(),
      reference: String(vehicule.matricule || '').trim().toUpperCase(),
      userId: req.user!.userId,
      vehiculeId: String(vehicule._id),
      vehiculeMatricule: String(vehicule.matricule || '').trim().toUpperCase(),
      sourcePaiementId: `vehicule-fuel-${String(history._id)}`,
    });

    return res.status(201).json({
      success: true,
      data: mapHistoryRow(history),
      message: 'Ajout carburant enregistre',
    });
  } catch (error) {
    console.error('Add carburant history error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listHistory)(req, res);
    case 'POST':
      return withLogistique(addCarburant)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
