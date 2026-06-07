import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import {
  Caisse,
  ClientDepense,
  Depense,
  DepenseCategorie,
  JourneeCaisse,
  Transaction,
} from '@/models';
import {
  DepenseCategorieStatus,
} from '@/models/DepenseCategorie';
import { ClientDepenseStatus } from '@/models/ClientDepense';
import { type IDepense } from '@/models/Depense';
import {
  ApiResponse,
  CaisseType,
  JourneeCaisseStatus,
  TransactionType,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';

/**
 * GET /api/depenses?from=YYYY-MM-DD&to=YYYY-MM-DD&journeeId=...
 *
 * Liste les dépenses (filtre date / journée). Utilisé par le caissier sur sa
 * page Dépenses et par la clôture journée.
 */
async function listDepenses(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IDepense[]>>
) {
  try {
    await connectDB();
    const { from, to, journeeId, limit = '200' } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof journeeId === 'string' && mongoose.isValidObjectId(journeeId)) {
      filter.journeeId = journeeId;
    }
    const dateFilter: Record<string, Date> = {};
    if (typeof from === 'string' && from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) dateFilter.$gte = d;
    }
    if (typeof to === 'string' && to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + 1);
        dateFilter.$lt = d;
      }
    }
    if (Object.keys(dateFilter).length > 0) {
      filter.date = dateFilter;
    }
    const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 200));
    const rows = await Depense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(lim)
      .lean();
    return res
      .status(200)
      .json({ success: true, data: rows as unknown as IDepense[] });
  } catch (error) {
    console.error('GET /api/depenses error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST /api/depenses
 *
 * Caissier (ou admin) enregistre une dépense :
 *   - Vérifie la catégorie VALIDE
 *   - Vérifie le solde de la caisse source
 *   - Crée une transaction DEBIT sur la caisse
 *   - Rattache à la journée OUVERTE du caissier
 *
 * Body : { categorieId, montant, caisseId, description?, date? }
 */
async function createDepense(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IDepense>>
) {
  try {
    await connectDB();
    const {
      categorieId,
      clientDepenseId,
      montant,
      caisseId,
      description,
      date,
    } = (req.body || {}) as {
      categorieId?: string;
      clientDepenseId?: string;
      montant?: number;
      caisseId?: string;
      description?: string;
      date?: string;
    };

    if (!categorieId || !mongoose.isValidObjectId(String(categorieId))) {
      return res.status(400).json({ success: false, error: 'categorieId invalide' });
    }
    if (!caisseId || !mongoose.isValidObjectId(String(caisseId))) {
      return res.status(400).json({ success: false, error: 'caisseId invalide' });
    }
    if (
      clientDepenseId &&
      !mongoose.isValidObjectId(String(clientDepenseId))
    ) {
      return res.status(400).json({
        success: false,
        error: 'clientDepenseId invalide',
      });
    }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Montant invalide' });
    }

    const cat = await DepenseCategorie.findById(categorieId);
    if (!cat || cat.statut !== DepenseCategorieStatus.VALIDE || !cat.actif) {
      return res
        .status(400)
        .json({ success: false, error: 'Catégorie non utilisable' });
    }

    let clientDep = null;
    if (clientDepenseId) {
      clientDep = await ClientDepense.findById(clientDepenseId);
      if (
        !clientDep ||
        clientDep.statut !== ClientDepenseStatus.VALIDE ||
        !clientDep.actif
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Client dépense non utilisable' });
      }
    }

    const caisse = await Caisse.findById(caisseId);
    if (!caisse || !caisse.actif) {
      return res
        .status(404)
        .json({ success: false, error: 'Caisse introuvable ou inactive' });
    }
    if (caisse.caisseType !== CaisseType.TRANSIT) {
      return res.status(400).json({
        success: false,
        error: 'Les dépenses transit doivent débiter une caisse transit',
      });
    }
    const soldeSource = Number(caisse.solde) || 0;
    if (soldeSource < m) {
      return res.status(400).json({
        success: false,
        error: `Solde insuffisant sur ${caisse.nom} (${soldeSource.toFixed(2)} MRU)`,
      });
    }

    const now = date ? new Date(date) : new Date();
    if (Number.isNaN(now.getTime())) {
      return res.status(400).json({ success: false, error: 'Date invalide' });
    }

    // Rattachement à la journée OUVERTE du caissier (si applicable).
    let journeeId: string | null = null;
    if (req.user!.role === UserRole.CAISSIER) {
      const journee = await getOrCreateOpenJournee(req.user!.userId);
      if (journee.statut !== JourneeCaisseStatus.OUVERTE) {
        return res.status(400).json({
          success: false,
          error: 'Votre journée est déjà clôturée — aucune dépense possible',
        });
      }
      journeeId = String(journee._id);
    }

    // Création de la transaction DEBIT.
    const tx = await Transaction.create({
      caisseId: caisse._id,
      type: TransactionType.DEBIT,
      montant: m,
      description: `Dépense — ${cat.nom}${description ? ` · ${String(description).trim()}` : ''}`,
      date: now,
      reference: `depense-${Date.now()}`,
      userId: req.user!.userId,
    });
    await Caisse.findByIdAndUpdate(caisse._id, { $inc: { solde: -m } });

    const depense = await Depense.create({
      categorieId: String(cat._id),
      categorieNom: cat.nom,
      clientDepenseId: clientDep ? String(clientDep._id) : null,
      clientDepenseNom: clientDep ? clientDep.nom : null,
      montant: m,
      description: description ? String(description).trim() : null,
      date: now,
      caisseId: String(caisse._id),
      caisseNom: caisse.nom,
      transactionId: String(tx._id),
      journeeId,
      createdBy: req.user!.userId,
    });

    // Si un client dépense est désigné, on CRÉDITE sa caisse interne pour
    // tracer combien on lui a payé (mirror du DEBIT sur la caisse système).
    if (clientDep && clientDep.caisseId) {
      try {
        await Transaction.create({
          caisseId: clientDep.caisseId,
          type: TransactionType.CREDIT,
          montant: m,
          description: `Dépense — ${cat.nom}${
            description ? ` · ${String(description).trim()}` : ''
          }`,
          date: now,
          reference: `depense-${String(depense._id)}`,
          userId: req.user!.userId,
          mirrorSourceId: tx._id,
        });
        await Caisse.findByIdAndUpdate(clientDep.caisseId, {
          $inc: { solde: m },
        });
      } catch (mirrorErr) {
        console.error('Mirror dépense → caisse client:', mirrorErr);
      }
    }

    return res.status(201).json({
      success: true,
      data: depense.toObject() as unknown as IDepense,
      message: 'Dépense enregistrée',
    });
  } catch (error) {
    console.error('POST /api/depenses error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return withAuth(listDepenses, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(createDepense, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
      ])(req, res);
    default:
      return res
        .status(405)
        .json({ success: false, error: 'Méthode non autorisée' });
  }
}
