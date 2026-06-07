import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { ChauffeurFacture, User } from '@/models';
import {
  ApiResponse,
  ChauffeurFactureStatut,
  IChauffeurFacture,
  PaginatedResponse,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

function buildReference(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `FCH-${y}${m}${d}-${rand}`;
}

function toYmd(value: unknown): string {
  return new Date(value as string | number | Date).toISOString().slice(0, 10);
}

function serializeFacture(doc: Record<string, unknown>, chauffeurNom?: string): IChauffeurFacture {
  return {
    _id: String(doc._id),
    reference: String(doc.reference),
    chauffeurId: String(doc.chauffeurId),
    chauffeurNom,
    weekStart: toYmd(doc.weekStart),
    weekEnd: toYmd(doc.weekEnd),
    nombreCharges: Number(doc.nombreCharges || 0),
    montantCharge: Number(doc.montantCharge || 0),
    total: Number(doc.total || 0),
    statut: doc.statut as ChauffeurFactureStatut,
    caisseId: doc.caisseId ? String(doc.caisseId) : undefined,
    caisseNom: doc.caisseNom as string | undefined,
    transactionId: doc.transactionId ? String(doc.transactionId) : undefined,
    paidAt: doc.paidAt as Date | undefined,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function listFactures(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IChauffeurFacture>>>
) {
  try {
    await connectDB();
    const { page = '1', limit = '20', chauffeurId, statut } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    const query: Record<string, unknown> = {};
    if (typeof chauffeurId === 'string' && chauffeurId.trim()) query.chauffeurId = chauffeurId.trim();
    if (typeof statut === 'string' && Object.values(ChauffeurFactureStatut).includes(statut as ChauffeurFactureStatut)) {
      query.statut = statut;
    }

    const [docs, total] = await Promise.all([
      ChauffeurFacture.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ChauffeurFacture.countDocuments(query),
    ]);

    const ids = [...new Set(docs.map((d) => String(d.chauffeurId)))];
    const chauffeurs = await User.find({ _id: { $in: ids } }).select('_id nom').lean();
    const nameMap = new Map(chauffeurs.map((c) => [String(c._id), String(c.nom)]));

    return res.status(200).json({
      success: true,
      data: {
        data: docs.map((d) => serializeFacture(d as unknown as Record<string, unknown>, nameMap.get(String(d.chauffeurId)))),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List chauffeur factures error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createFacture(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IChauffeurFacture>>
) {
  try {
    await connectDB();

    const { chauffeurId, weekStart, weekEnd, nombreCharges, montantCharge } = req.body as {
      chauffeurId?: string;
      weekStart?: string;
      weekEnd?: string;
      nombreCharges?: number;
      montantCharge?: number;
    };

    if (!chauffeurId || !weekStart || !weekEnd) {
      return res.status(400).json({ success: false, error: 'chauffeurId, weekStart et weekEnd requis' });
    }

    const nCharges = Number(nombreCharges || 0);
    const mCharge = Number(montantCharge || 0);
    if (nCharges < 0 || mCharge < 0) {
      return res.status(400).json({ success: false, error: 'Valeurs invalides' });
    }

    const total = nCharges * mCharge;
    const reference = buildReference();

    const doc = await ChauffeurFacture.create({
      reference,
      chauffeurId: String(chauffeurId).trim(),
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      nombreCharges: nCharges,
      montantCharge: mCharge,
      total,
      statut: ChauffeurFactureStatut.BROUILLON,
      createdBy: req.user!.userId,
    });

    return res.status(201).json({
      success: true,
      data: serializeFacture(doc.toObject() as unknown as Record<string, unknown>),
      message: 'Facture chauffeur créée',
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err?.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Une facture existe déjà pour ce chauffeur sur cette semaine',
      });
    }
    console.error('Create chauffeur facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listFactures)(req, res);
    case 'POST':
      return withLogistique(createFacture)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
