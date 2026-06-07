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
  TransactionType,
  VehiculeCategorie,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import { ensureBanqueCaisse } from '@/lib/caisse';

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

async function getLocation(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILocationResponse>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const doc = await Location.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Location introuvable' });
    }

    if (doc.statut !== LocationStatut.ANNULEE) {
      const expected = computeAutomaticStatut(new Date(doc.dateDebut), doc.dateFin ? new Date(doc.dateFin) : undefined);
      if (doc.statut !== expected) {
        await Location.updateOne({ _id: doc._id }, { $set: { statut: expected } });
        doc.statut = expected;
      }
    }

    const creator = await User.findById(String(doc.createdBy)).select('nom').lean();
    return res.status(200).json({
      success: true,
      data: serializeLocation(
        doc as unknown as Record<string, unknown>,
        creator?.nom ? String(creator.nom) : undefined
      ),
    });
  } catch (error) {
    console.error('Get location error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateLocation(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILocationResponse>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const doc = await Location.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Location introuvable' });
    }

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

    if (type !== undefined) {
      if (!Object.values(LocationType).includes(type)) {
        return res.status(400).json({ success: false, error: 'Type de location invalide' });
      }
      doc.type = type;
    }

    if (clientNom !== undefined) {
      const normalized = String(clientNom || '').trim();
      if (!normalized) {
        return res.status(400).json({ success: false, error: 'Nom client requis' });
      }
      doc.clientNom = normalized;
    }

    if (dateDebut !== undefined) {
      const startDate = normalizeDate(dateDebut);
      if (!startDate) {
        return res.status(400).json({ success: false, error: 'Date debut invalide' });
      }
      doc.dateDebut = startDate;
    }

    if (dateFin !== undefined) {
      const endDate = dateFin ? normalizeDate(dateFin) : null;
      if (dateFin && !endDate) {
        return res.status(400).json({ success: false, error: 'Date fin invalide' });
      }
      if (endDate && endDate < doc.dateDebut) {
        return res.status(400).json({ success: false, error: 'Date fin doit etre >= date debut' });
      }
      doc.dateFin = endDate || undefined;
    }

    if (montantJournalier !== undefined) {
      const dailyAmount = Number(montantJournalier);
      if (!Number.isFinite(dailyAmount) || dailyAmount < 0) {
        return res.status(400).json({ success: false, error: 'Montant journalier invalide' });
      }
      doc.montantJournalier = dailyAmount;
    }

    if (vehiculeClientMatricule !== undefined) {
      doc.vehiculeClientMatricule = String(vehiculeClientMatricule || '')
        .trim()
        .toUpperCase() || undefined;
    }

    if (vehiculeInterneId !== undefined) {
      doc.vehiculeInterneId = String(vehiculeInterneId || '').trim() || undefined;
    }

    if (vehiculeClientId !== undefined) {
      doc.vehiculeClientId = String(vehiculeClientId || '').trim() || undefined;
    }

    if (conteneurNumero !== undefined) {
      doc.conteneurNumero = String(conteneurNumero || '').trim().toUpperCase() || undefined;
    }

    if (doc.type === LocationType.VEHICULE_INTERNE) {
      const internalId = String(doc.vehiculeInterneId || '').trim();
      if (!internalId || !mongoose.isValidObjectId(internalId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Vehicule interne requis et invalide' });
      }
      const vehiculeDoc = await Vehicule.findById(internalId).select('matricule actif').lean();
      if (!vehiculeDoc || !vehiculeDoc.actif) {
        return res.status(400).json({ success: false, error: 'Vehicule interne introuvable ou inactif' });
      }
      doc.vehiculeInterneId = internalId;
      doc.vehiculeInterneMatricule = String(vehiculeDoc.matricule || '').trim().toUpperCase();
      doc.vehiculeClientMatricule = undefined;
      doc.conteneurNumero = undefined;
    }

    if (doc.type === LocationType.VEHICULE_CLIENT) {
      const clientId = String(doc.vehiculeClientId || '').trim();
      if (clientId) {
        if (!mongoose.isValidObjectId(clientId)) {
          return res
            .status(400)
            .json({ success: false, error: 'Vehicule client invalide' });
        }
        const vehiculeClientDoc = await Vehicule.findById(clientId)
          .select('matricule categorie actif')
          .lean();
        if (
          !vehiculeClientDoc ||
          !vehiculeClientDoc.actif ||
          vehiculeClientDoc.categorie !== VehiculeCategorie.CLIENT
        ) {
          return res.status(400).json({ success: false, error: 'Vehicule client introuvable ou invalide' });
        }
        doc.vehiculeClientMatricule = String(vehiculeClientDoc.matricule || '').trim().toUpperCase();
      }

      if (!String(doc.vehiculeClientMatricule || '').trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'Matricule vehicule client requis pour ce type' });
      }

      doc.vehiculeClientId = clientId || undefined;
    }

    if (doc.type === LocationType.VEHICULE_CLIENT) {
      doc.vehiculeInterneId = undefined;
      doc.vehiculeInterneMatricule = undefined;
      doc.conteneurNumero = undefined;
    }

    if (doc.type === LocationType.CONTENEUR && !doc.conteneurNumero) {
      return res
        .status(400)
        .json({ success: false, error: 'Numero conteneur requis pour ce type' });
    }

    if (doc.type === LocationType.CONTENEUR) {
      doc.vehiculeInterneId = undefined;
      doc.vehiculeInterneMatricule = undefined;
      doc.vehiculeClientId = undefined;
      doc.vehiculeClientMatricule = undefined;
    }

    if (note !== undefined) {
      doc.note = String(note || '').trim() || undefined;
    }

    doc.totalEstime = computeTotalEstime(doc.dateDebut, doc.dateFin || null, doc.montantJournalier);
    if (doc.statut !== LocationStatut.ANNULEE) {
      doc.statut = computeAutomaticStatut(doc.dateDebut, doc.dateFin || undefined);
    }
    await doc.save();

    await syncLocationVehiculeTransaction({
      locationId: String(doc._id),
      type: doc.type as LocationType,
      statut: doc.statut as LocationStatut,
      vehiculeInterneId: doc.vehiculeInterneId ? String(doc.vehiculeInterneId) : undefined,
      vehiculeInterneMatricule: doc.vehiculeInterneMatricule
        ? String(doc.vehiculeInterneMatricule)
        : undefined,
      clientNom: String(doc.clientNom || ''),
      montant: Number(doc.totalEstime || 0),
      dateDebut: doc.dateDebut,
      actorUserId: req.user!.userId,
    });

    return res.status(200).json({
      success: true,
      data: serializeLocation(doc.toObject() as unknown as Record<string, unknown>),
      message: 'Location mise a jour',
    });
  } catch (error) {
    console.error('Update location error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function deleteLocation(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<null>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const deleted = await Location.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Location introuvable' });
    }

    return res.status(200).json({ success: true, message: 'Location supprimee' });
  } catch (error) {
    console.error('Delete location error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(getLocation)(req, res);
    case 'PUT':
      return withLogistique(updateLocation)(req, res);
    case 'DELETE':
      return withLogistique(deleteLocation)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
