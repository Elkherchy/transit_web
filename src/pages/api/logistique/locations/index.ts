import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Location, Transaction, User, Vehicule } from '@/models';
import {
  ApiResponse,
  CaisseType,
  ILocationResponse,
  LocationStatut,
  LocationType,
  PaginatedResponse,
  TransactionType,
  VehiculeCategorie,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import { ensureBanqueCaisse } from '@/lib/caisse';

function generateReference(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `LOC-${y}${m}${d}-${rand}`;
}

function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeTotalEstime(dateDebut: Date, dateFin: Date | null, montantJournalier: number): number {
  if (!dateFin) return montantJournalier;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.max(0, Math.floor((dateFin.getTime() - dateDebut.getTime()) / msPerDay));
  const days = diff + 1;
  return Number((days * montantJournalier).toFixed(2));
}

function computeAutomaticStatut(dateDebut: Date, dateFin?: Date): LocationStatut {
  const now = new Date();
  const start = new Date(dateDebut);
  const end = dateFin ? new Date(dateFin) : undefined;

  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dayNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = end ? new Date(end.getFullYear(), end.getMonth(), end.getDate()) : undefined;

  if (dayNow < dayStart) return LocationStatut.BROUILLON;
  if (dayEnd && dayNow > dayEnd) return LocationStatut.TERMINEE;
  return LocationStatut.ACTIVE;
}

async function syncLocationVehiculeTransaction(input: {
  locationId: string;
  type: LocationType;
  statut: LocationStatut;
  vehiculeInterneId?: string;
  vehiculeInterneMatricule?: string;
  clientNom: string;
  montant: number;
  dateDebut: Date;
  actorUserId: string;
}) {
  const sourcePaiementId = `location-${input.locationId}`;

  if (
    input.type !== LocationType.VEHICULE_INTERNE ||
    input.statut === LocationStatut.ANNULEE ||
    !input.vehiculeInterneId
  ) {
    await Transaction.deleteOne({ sourcePaiementId });
    return;
  }

  // Domaine logistique : recettes location → Banque_Logistique.
  const banque = await ensureBanqueCaisse(CaisseType.LOGISTIQUE);
  const matricule = String(input.vehiculeInterneMatricule || '').trim().toUpperCase();

  await Transaction.findOneAndUpdate(
    { sourcePaiementId },
    {
      $set: {
        caisseId: banque._id,
        type: TransactionType.CREDIT,
        montant: Number(input.montant || 0),
        description: `Location vehicule ${matricule} - Client ${input.clientNom}`,
        date: input.dateDebut,
        reference: input.locationId,
        userId: input.actorUserId,
        vehiculeId: input.vehiculeInterneId,
        vehiculeMatricule: matricule,
        sourcePaiementId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function serializeLocation(doc: Record<string, unknown>, createdByNom?: string): ILocationResponse {
  return {
    _id: String(doc._id),
    reference: String(doc.reference || ''),
    type: doc.type as LocationType,
    clientNom: String(doc.clientNom || ''),
    vehiculeInterneId: doc.vehiculeInterneId ? String(doc.vehiculeInterneId) : undefined,
    vehiculeInterneMatricule: doc.vehiculeInterneMatricule
      ? String(doc.vehiculeInterneMatricule)
      : undefined,
    vehiculeClientId: doc.vehiculeClientId ? String(doc.vehiculeClientId) : undefined,
    vehiculeClientMatricule: doc.vehiculeClientMatricule
      ? String(doc.vehiculeClientMatricule)
      : undefined,
    conteneurNumero: doc.conteneurNumero ? String(doc.conteneurNumero) : undefined,
    dateDebut: doc.dateDebut as Date,
    dateFin: doc.dateFin as Date | undefined,
    montantJournalier: Number(doc.montantJournalier || 0),
    totalEstime: Number(doc.totalEstime || 0),
    statut: doc.statut as LocationStatut,
    note: doc.note ? String(doc.note) : undefined,
    createdBy: String(doc.createdBy || ''),
    createdByNom,
    createdAt: doc.createdAt as Date | undefined,
    updatedAt: doc.updatedAt as Date | undefined,
  };
}

async function listLocations(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<ILocationResponse>>>
) {
  try {
    await connectDB();

    const { page = '1', limit = '20', search = '', type, statut } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    const q = String(search || '').trim();
    if (q) {
      query.$or = [
        { reference: { $regex: q, $options: 'i' } },
        { clientNom: { $regex: q, $options: 'i' } },
        { vehiculeInterneMatricule: { $regex: q, $options: 'i' } },
        { vehiculeClientMatricule: { $regex: q, $options: 'i' } },
        { conteneurNumero: { $regex: q, $options: 'i' } },
      ];
    }

    if (typeof type === 'string' && Object.values(LocationType).includes(type as LocationType)) {
      query.type = type;
    }

    if (
      typeof statut === 'string' &&
      Object.values(LocationStatut).includes(statut as LocationStatut)
    ) {
      query.statut = statut;
    }

    const [rows, total] = await Promise.all([
      Location.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Location.countDocuments(query),
    ]);

    for (const row of rows) {
      if (row.statut === LocationStatut.ANNULEE) continue;
      const expected = computeAutomaticStatut(new Date(row.dateDebut), row.dateFin ? new Date(row.dateFin) : undefined);
      if (row.statut !== expected) {
        await Location.updateOne({ _id: row._id }, { $set: { statut: expected } });
        row.statut = expected;
      }
    }

    const userIds = [...new Set(rows.map((row) => String(row.createdBy || '')).filter(Boolean))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('nom').lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), String(u.nom || '')]));

    return res.status(200).json({
      success: true,
      data: {
        data: rows.map((row) =>
          serializeLocation(
            row as unknown as Record<string, unknown>,
            userMap.get(String(row.createdBy || ''))
          )
        ),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List locations error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createLocation(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILocationResponse>>
) {
  try {
    await connectDB();

    const {
      type,
      clientNom,
      vehiculeInterneId,
      vehiculeClientId,
      vehiculeClientMatricule,
      conteneurNumero,
      dateDebut,
      dateFin,
      montantJournalier,
      note,
    } = req.body as {
      type?: LocationType;
      clientNom?: string;
      vehiculeInterneId?: string;
      vehiculeClientId?: string;
      vehiculeClientMatricule?: string;
      conteneurNumero?: string;
      dateDebut?: string;
      dateFin?: string;
      montantJournalier?: number;
      note?: string;
    };

    if (!type || !Object.values(LocationType).includes(type)) {
      return res.status(400).json({ success: false, error: 'Type de location invalide' });
    }

    const normalizedClientNom = String(clientNom || '').trim();
    if (!normalizedClientNom) {
      return res.status(400).json({ success: false, error: 'Nom client requis' });
    }

    const startDate = normalizeDate(dateDebut);
    if (!startDate) {
      return res.status(400).json({ success: false, error: 'Date debut invalide' });
    }

    const endDate = normalizeDate(dateFin);
    if (endDate && endDate < startDate) {
      return res.status(400).json({ success: false, error: 'Date fin doit etre >= date debut' });
    }

    const dailyAmount = Number(montantJournalier || 0);
    if (!Number.isFinite(dailyAmount) || dailyAmount < 0) {
      return res.status(400).json({ success: false, error: 'Montant journalier invalide' });
    }

    const internalVehiculeId = String(vehiculeInterneId || '').trim();
    const clientVehiculeId = String(vehiculeClientId || '').trim();
    const vehiclePlate = String(vehiculeClientMatricule || '').trim().toUpperCase();
    const containerNo = String(conteneurNumero || '').trim().toUpperCase();
    let internalVehiculeMatricule = '';
    let clientVehiculeMatricule = vehiclePlate;

    if (type === LocationType.VEHICULE_INTERNE) {
      if (!internalVehiculeId || !mongoose.isValidObjectId(internalVehiculeId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Vehicule interne requis et invalide' });
      }
      const vehiculeDoc = await Vehicule.findById(internalVehiculeId)
        .select('matricule actif')
        .lean();
      if (!vehiculeDoc || !vehiculeDoc.actif) {
        return res.status(400).json({ success: false, error: 'Vehicule interne introuvable ou inactif' });
      }
      internalVehiculeMatricule = String(vehiculeDoc.matricule || '').trim().toUpperCase();
    }

    if (type === LocationType.VEHICULE_CLIENT) {
      if (clientVehiculeId) {
        if (!mongoose.isValidObjectId(clientVehiculeId)) {
          return res
            .status(400)
            .json({ success: false, error: 'Vehicule client invalide' });
        }
        const vehiculeClientDoc = await Vehicule.findById(clientVehiculeId)
          .select('matricule categorie actif')
          .lean();
        if (
          !vehiculeClientDoc ||
          !vehiculeClientDoc.actif ||
          vehiculeClientDoc.categorie !== VehiculeCategorie.CLIENT
        ) {
          return res.status(400).json({ success: false, error: 'Vehicule client introuvable ou invalide' });
        }
        clientVehiculeMatricule = String(vehiculeClientDoc.matricule || '').trim().toUpperCase();
      }

      if (!clientVehiculeMatricule) {
        return res
          .status(400)
          .json({ success: false, error: 'Matricule vehicule client requis pour ce type' });
      }
    }
    if (type === LocationType.CONTENEUR && !containerNo) {
      return res
        .status(400)
        .json({ success: false, error: 'Numero conteneur requis pour ce type' });
    }

    let reference = generateReference();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await Location.findOne({ reference }).lean();
      if (!exists) break;
      reference = generateReference();
      attempts += 1;
    }

    const location = await Location.create({
      reference,
      type,
      clientNom: normalizedClientNom,
      vehiculeInterneId:
        type === LocationType.VEHICULE_INTERNE ? internalVehiculeId : undefined,
      vehiculeInterneMatricule:
        type === LocationType.VEHICULE_INTERNE ? internalVehiculeMatricule : undefined,
      vehiculeClientId: type === LocationType.VEHICULE_CLIENT ? clientVehiculeId : undefined,
      vehiculeClientMatricule:
        type === LocationType.VEHICULE_CLIENT ? clientVehiculeMatricule : undefined,
      conteneurNumero: type === LocationType.CONTENEUR ? containerNo : undefined,
      dateDebut: startDate,
      dateFin: endDate || undefined,
      montantJournalier: dailyAmount,
      totalEstime: computeTotalEstime(startDate, endDate, dailyAmount),
      statut: computeAutomaticStatut(startDate, endDate || undefined),
      note: String(note || '').trim() || undefined,
      createdBy: req.user!.userId,
    });

    await syncLocationVehiculeTransaction({
      locationId: String(location._id),
      type,
      statut: location.statut as LocationStatut,
      vehiculeInterneId: location.vehiculeInterneId
        ? String(location.vehiculeInterneId)
        : undefined,
      vehiculeInterneMatricule: location.vehiculeInterneMatricule
        ? String(location.vehiculeInterneMatricule)
        : undefined,
      clientNom: normalizedClientNom,
      montant: Number(location.totalEstime || 0),
      dateDebut: location.dateDebut,
      actorUserId: req.user!.userId,
    });

    return res.status(201).json({
      success: true,
      data: serializeLocation(location.toObject() as unknown as Record<string, unknown>),
      message: 'Location creee',
    });
  } catch (error) {
    console.error('Create location error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listLocations)(req, res);
    case 'POST':
      return withLogistique(createLocation)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
