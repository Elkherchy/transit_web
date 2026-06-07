import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { BonCommande, User } from '@/models';
import {
  ApiResponse,
  BonCommandeStatut,
  IBonCommandeResponse,
  PaginatedResponse,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

function generateReference(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `BC-${y}${m}${d}-${rand}`;
}

/**
 * Prochain numéro séquentiel (001, 002, …) pour la facturation simple.
 * Cherche le `numero` numérique le plus haut existant et ajoute 1.
 * Retombe sur "001" si aucun bon avec un numero numérique n'existe.
 */
async function nextSequentialNumero(): Promise<string> {
  const docs = await BonCommande.find({ numero: { $exists: true, $ne: null } })
    .select('numero')
    .lean();
  let max = 0;
  for (const d of docs) {
    const n = parseInt(String(d.numero || '').replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(3, '0');
}

function serializeBC(doc: Record<string, unknown>, createdByNom?: string): IBonCommandeResponse {
  const lignes = (doc.lignes as Array<Record<string, unknown>>) ?? [];
  return {
    _id: String(doc._id),
    reference: doc.reference as string,
    numero: doc.numero ? String(doc.numero) : undefined,
    client: doc.client as IBonCommandeResponse['client'],
    date: doc.date ? String(doc.date).slice(0, 10) : undefined,
    lignes: lignes.map((l) => ({
      voyageId: String(l.voyageId),
      description: l.description as string,
      montant: l.montant as number,
    })),
    total: doc.total as number,
    statut: doc.statut as BonCommandeStatut,
    caisseId: doc.caisseId ? String(doc.caisseId) : undefined,
    caisseNom: doc.caisseNom as string | undefined,
    transactionId: doc.transactionId ? String(doc.transactionId) : undefined,
    paidAt: doc.paidAt as Date | undefined,
    createdBy: doc.createdBy as string,
    createdByNom,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function listBonsCommande(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IBonCommandeResponse>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '20',
      client,
      statut,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};
    if (client && typeof client === 'string') {
      query.client = client;
    }
    if (statut && Object.values(BonCommandeStatut).includes(statut as BonCommandeStatut)) {
      query.statut = statut;
    }

    const [docs, total] = await Promise.all([
      BonCommande.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      BonCommande.countDocuments(query),
    ]);

    // Enrich with creator name
    const userIds = [...new Set(docs.map((d) => String(d.createdBy)))];
    const users = await User.find({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select('_id nom')
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u.nom as string]));

    return res.status(200).json({
      success: true,
      data: {
        data: docs.map((d) =>
          serializeBC(d as unknown as Record<string, unknown>, userMap.get(String(d.createdBy)))
        ),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('listBonsCommande error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createBonCommande(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IBonCommandeResponse>>
) {
  try {
    await connectDB();

    const {
      client,
      lignes,
      date,
      numero: numeroIn,
      montant: montantIn,
    } = req.body as {
      client?: string;
      lignes?: { voyageId: string; description: string; montant: number }[];
      date?: string;
      numero?: string;
      montant?: number;
    };

    if (!client || typeof client !== 'string' || client.trim() === '') {
      return res.status(400).json({ success: false, error: 'Client invalide' });
    }

    const isSimpleMode = !Array.isArray(lignes) || lignes.length === 0;

    let total = 0;
    let lignesDocs: { voyageId: mongoose.Types.ObjectId; description: string; montant: number }[] =
      [];

    if (isSimpleMode) {
      // Mode facture simple : on attend `montant` directement.
      const m = Number(montantIn);
      if (!Number.isFinite(m) || m < 0) {
        return res.status(400).json({ success: false, error: 'Montant invalide' });
      }
      total = m;
    } else {
      for (const l of lignes!) {
        if (!l.voyageId || !mongoose.isValidObjectId(l.voyageId)) {
          return res
            .status(400)
            .json({ success: false, error: `voyageId invalide: ${l.voyageId}` });
        }
        if (typeof l.montant !== 'number' || l.montant < 0) {
          return res
            .status(400)
            .json({ success: false, error: 'Montant invalide sur une ligne' });
        }
      }
      total = lignes!.reduce((sum, l) => sum + l.montant, 0);
      lignesDocs = lignes!.map((l) => ({
        voyageId: new mongoose.Types.ObjectId(l.voyageId),
        description: String(l.description).trim(),
        montant: l.montant,
      }));
    }

    // Numéro de facture séquentiel : utilise la valeur saisie ou en génère une.
    let numero = (numeroIn || '').trim();
    if (!numero) {
      numero = await nextSequentialNumero();
    }

    // Reference UID interne (séparée du numero affiché).
    let reference = generateReference();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await BonCommande.findOne({ reference }).lean();
      if (!exists) break;
      reference = generateReference();
      attempts++;
    }

    const doc = await BonCommande.create({
      reference,
      numero,
      client,
      date: date ? new Date(date) : new Date(),
      lignes: lignesDocs,
      total,
      statut: BonCommandeStatut.CONFIRME,
      createdBy: req.user!.userId,
    });

    const fresh = await BonCommande.findById(doc._id).lean();
    return res.status(201).json({
      success: true,
      data: serializeBC(fresh as unknown as Record<string, unknown>),
      message: 'Bon de commande créé',
    });
  } catch (err) {
    console.error('createBonCommande error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listBonsCommande)(req, res);
    case 'POST':
      return withLogistique(createBonCommande)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
