import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, User } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  CaisseType,
  CompteType,
  ICaisseListItem,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth, withComptable } from '@/middleware/auth';
import { getSoldeMapForCaisseIds } from '@/lib/caisse';

function resolveCompteType(doc: Record<string, unknown>): CompteType {
  const rawType = doc.type;
  if (rawType && Object.values(CompteType).includes(rawType as CompteType)) {
    return rawType as CompteType;
  }
  if (Boolean(doc.isDefaultGeneral)) return CompteType.GENERAL;
  if ((doc.kind as CaisseKind) === CaisseKind.USER) return CompteType.CAISSE;
  return CompteType.CAISSE;
}

function serializeCaisse(
  doc: Record<string, unknown>,
  solde: number,
  payeur?: { _id: string; nom: string; email: string }
): ICaisseListItem {
  return {
    _id: String(doc._id),
    nom: doc.nom as string,
    type: resolveCompteType(doc),
    kind: doc.kind as CaisseKind,
    payeurId: doc.payeurId ? String(doc.payeurId) : undefined,
    actif: Boolean(doc.actif),
    isDefaultGeneral: Boolean(doc.isDefaultGeneral),
    isDefaultBanque: Boolean(doc.isDefaultBanque),
    caisseType: (doc.caisseType as CaisseType | undefined) || undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    solde,
    payeur,
  };
}

async function getOne(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisseListItem>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const c = await Caisse.findById(id).lean();
    if (!c) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    const u = req.user!;
    if (u.role === UserRole.CAISSIER) {
      const canAccess =
        c.caissierUserId === u.userId || (c.isDefaultGeneral && c.kind === CaisseKind.GENERAL);
      if (!canAccess) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
    }
    if (u.role === UserRole.USER_PAYEUR) {
      if (c.kind !== CaisseKind.USER || c.payeurId !== u.userId) {
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
    }
    // Admin scopé et AGENT_TRANSIT : la caisse doit appartenir au domaine transit.
    if (
      (u.role === UserRole.ADMIN_TRANSIT ||
        u.role === UserRole.AGENT_TRANSIT) &&
      c.caisseType !== CaisseType.TRANSIT
    ) {
      return res.status(403).json({
        success: false,
        error: 'Caisse hors du domaine Transit',
      });
    }

    const oid = c._id as mongoose.Types.ObjectId;
    const soldeMap = await getSoldeMapForCaisseIds([oid]);
    let payeur: { _id: string; nom: string; email: string } | undefined;
    if (c.payeurId) {
      const p = await User.findById(c.payeurId).select('nom email').lean();
      if (p) payeur = { _id: String(p._id), nom: p.nom, email: p.email };
    }

    return res.status(200).json({
      success: true,
      data: serializeCaisse(
        c as unknown as Record<string, unknown>,
        soldeMap.get(String(oid)) ?? 0,
        payeur
      ),
    });
  } catch (error) {
    console.error('Get caisse error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateCaisse(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisseListItem>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const doc = await Caisse.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    const { nom, actif, isDefaultGeneral } = req.body;

    if (nom !== undefined) doc.nom = String(nom).trim();
    if (actif !== undefined) doc.actif = Boolean(actif);

    if (isDefaultGeneral === true && doc.kind === CaisseKind.GENERAL) {
      await Caisse.updateMany({ _id: { $ne: doc._id } }, { $set: { isDefaultGeneral: false } });
      doc.isDefaultGeneral = true;
    } else if (isDefaultGeneral === false) {
      doc.isDefaultGeneral = false;
    }

    await doc.save();

    const soldeMap = await getSoldeMapForCaisseIds([doc._id as mongoose.Types.ObjectId]);
    let payeur: { _id: string; nom: string; email: string } | undefined;
    if (doc.payeurId) {
      const p = await User.findById(doc.payeurId).select('nom email').lean();
      if (p) payeur = { _id: String(p._id), nom: p.nom, email: p.email };
    }

    return res.status(200).json({
      success: true,
      data: serializeCaisse(
        doc.toObject() as unknown as Record<string, unknown>,
        soldeMap.get(String(doc._id)) ?? 0,
        payeur
      ),
      message: 'Caisse mise à jour',
    });
  } catch (error) {
    console.error('Update caisse error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function deactivateCaisse(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<null>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const doc = await Caisse.findById(id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    if (doc.isDefaultGeneral) {
      const other = await Caisse.findOne({
        kind: CaisseKind.GENERAL,
        actif: true,
        _id: { $ne: doc._id },
      });
      if (!other) {
        return res.status(400).json({
          success: false,
          error: 'Impossible de désactiver la seule caisse générale',
        });
      }
      other.isDefaultGeneral = true;
      await other.save();
    }

    doc.actif = false;
    doc.isDefaultGeneral = false;
    await doc.save();

    return res.status(200).json({ success: true, message: 'Caisse désactivée' });
  } catch (error) {
    console.error('Deactivate caisse error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getOne)(req, res);
    case 'PUT':
      return withComptable(updateCaisse)(req, res);
    case 'DELETE':
      return withComptable(deactivateCaisse)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
