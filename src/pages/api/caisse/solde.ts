import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, User } from '@/models';
import { ApiResponse, CaisseKind, CompteType, ICaisseListItem, UserRole } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse, getSoldeMapForCaisseIds } from '@/lib/caisse';

function serializeCaisse(
  doc: Record<string, unknown>,
  solde: number,
  payeur?: { _id: string; nom: string; email: string }
): ICaisseListItem {
  return {
    _id: String(doc._id),
    nom: doc.nom as string,
    type: (doc.type as CompteType) || CompteType.CAISSE,
    kind: doc.kind as CaisseKind,
    payeurId: doc.payeurId ? String(doc.payeurId) : undefined,
    actif: Boolean(doc.actif),
    isDefaultGeneral: Boolean(doc.isDefaultGeneral),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    solde,
    payeur,
  };
}

/** Liste des caisses actives avec solde (admin / comptable). */
async function getSoldes(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisseListItem[]>>) {
  try {
    await connectDB();
    await ensureDefaultGeneralCaisse();

    if (req.user!.role !== UserRole.ADMIN && req.user!.role !== UserRole.COMPTABLE) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    const caisses = await Caisse.find({ actif: true }).sort({ kind: 1, nom: 1 }).lean();
    const ids = caisses.map((c) => c._id as mongoose.Types.ObjectId);
    const soldeMap = await getSoldeMapForCaisseIds(ids);

    const payeurIds = [
      ...new Set(
        caisses
          .filter((c) => c.kind === CaisseKind.USER && c.payeurId)
          .map((c) => c.payeurId as string)
      ),
    ];
    const payeurs = await User.find({ _id: { $in: payeurIds } })
      .select('nom email')
      .lean();
    const payeurMap = new Map(payeurs.map((p) => [String(p._id), p]));

    const data: ICaisseListItem[] = caisses.map((c) => {
      const id = String(c._id);
      const p = c.payeurId ? payeurMap.get(String(c.payeurId)) : undefined;
      return serializeCaisse(
        c as unknown as Record<string, unknown>,
        soldeMap.get(id) ?? 0,
        p ? { _id: String(p._id), nom: p.nom, email: p.email } : undefined
      );
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get soldes error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getSoldes)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
