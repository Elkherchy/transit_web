import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Transaction, User } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  CaisseType,
  CompteType,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface OperationRow {
  date: string;
  compteId: string;
  compteNom: string;
  compteType: string;
  type: string;
  montant: number;
  description: string;
  reference: string;
}

interface OperationsPayload {
  scope: 'societe' | 'payeur' | 'caissier';
  scopeLabel: string;
  periodeDebut: string;
  periodeFin: string;
  count: number;
  operations: OperationRow[];
}

/**
 * GET /api/admin/transit/mouvement-operations
 *
 * Export des opérations. Trois périmètres :
 *  - défaut : comptes société du domaine Transit (GENERAL + BANQUE).
 *  - ?userId=<payeur>  : mouvements de la caisse du payeur.
 *  - ?userId=<caissier>: opérations saisies par le caissier (auteur des écritures).
 *
 * Query : ?dateDebut=ISO&dateFin=ISO&userId=<id>
 * Auth  : ADMIN, ADMIN_TRANSIT, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<OperationsPayload>>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();

    const now = new Date();
    const debut = req.query.dateDebut
      ? new Date(String(req.query.dateDebut))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const fin = req.query.dateFin ? new Date(String(req.query.dateFin)) : now;

    const userId =
      req.query.userId && mongoose.isValidObjectId(String(req.query.userId))
        ? String(req.query.userId)
        : null;

    const period = { date: { $gte: debut, $lte: fin } };
    let txQuery: Record<string, unknown>;
    let scope: OperationsPayload['scope'] = 'societe';
    let scopeLabel = 'Comptes société';

    if (userId) {
      const u = await User.findById(userId).select('nom role').lean();
      if (!u) {
        return res
          .status(404)
          .json({ success: false, error: 'Utilisateur introuvable' });
      }
      scopeLabel = String((u as { nom?: string }).nom || 'Utilisateur');
      const role = (u as { role?: UserRole }).role;

      if (role === UserRole.USER_PAYEUR) {
        scope = 'payeur';
        const caisses = await Caisse.find({
          kind: CaisseKind.USER,
          payeurId: userId,
        })
          .select('_id')
          .lean();
        const ids = caisses.map((c) => c._id as mongoose.Types.ObjectId);
        txQuery = { caisseId: { $in: ids }, ...period };
      } else if (role === UserRole.CAISSIER) {
        scope = 'caissier';
        // Opérations dont le caissier est l'auteur (écritures qu'il a saisies).
        txQuery = { userId, ...period };
      } else {
        return res.status(400).json({
          success: false,
          error: 'Seuls un payeur ou un caissier peuvent être exportés',
        });
      }
    } else {
      // Comptes société du domaine Transit (GENERAL + BANQUE).
      const comptes = await Caisse.find({
        caisseType: CaisseType.TRANSIT,
        type: { $in: [CompteType.GENERAL, CompteType.BANQUE] },
        actif: true,
      })
        .select('_id')
        .lean();
      const ids = comptes.map((c) => c._id as mongoose.Types.ObjectId);
      txQuery = { caisseId: { $in: ids }, ...period };
    }

    const txs = await Transaction.find(txQuery)
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // Résout le nom des comptes présents dans les opérations.
    const caisseIds = [
      ...new Set(txs.map((t) => String(t.caisseId)).filter(Boolean)),
    ];
    const caisses = caisseIds.length
      ? await Caisse.find({
          _id: { $in: caisseIds.map((s) => new mongoose.Types.ObjectId(s)) },
        })
          .select('_id nom type')
          .lean()
      : [];
    const compteMap = new Map(
      caisses.map((c) => [
        String(c._id),
        { nom: c.nom as string, type: c.type as CompteType },
      ])
    );

    const operations: OperationRow[] = txs.map((t) => {
      const c = compteMap.get(String(t.caisseId));
      return {
        date: new Date(t.date).toISOString(),
        compteId: String(t.caisseId),
        compteNom: c?.nom || '—',
        compteType: (c?.type as string) || CompteType.CAISSE,
        type: String(t.type),
        montant: Number(t.montant) || 0,
        description: String(t.description || ''),
        reference: String(t.reference || ''),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        scope,
        scopeLabel,
        periodeDebut: debut.toISOString(),
        periodeFin: fin.toISOString(),
        count: operations.length,
        operations,
      },
    });
  } catch (err) {
    console.error('GET mouvement-operations transit error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.COMPTABLE,
]);
