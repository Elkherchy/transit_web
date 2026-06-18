import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Client, Facture } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

export interface ClientDebiteurTransit {
  clientId: string;
  clientNom: string;
  totalFacture: number;
  totalPaye: number;
  soldeDu: number;
  nbFactures: number;
  derniereFactureDate?: Date;
}

/**
 * GET /api/transit/clients-debiteurs
 * Liste des clients transit avec un solde dû (factures émises - paiements
 * encaissés > 0).
 *
 * Query :
 *   - includeZero?  : '1' → inclure aussi les clients à solde nul (par défaut
 *     seuls les débiteurs sont retournés)
 *   - search?       : filtre nom client (regex insensible à la casse)
 *
 * Auth : ADMIN, ADMIN_TRANSIT, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ClientDebiteurTransit[]>>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    const includeZero =
      req.query.includeZero === '1' || req.query.includeZero === 'true';
    const search =
      typeof req.query.search === 'string' ? req.query.search.trim() : '';

    // Agrégation MongoDB : pour chaque clientId, sum(totalFinal) et sum(montantPaye).
    const agg = (await Facture.aggregate([
      { $match: { clientId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$clientId',
          totalFacture: { $sum: { $ifNull: ['$totalFinal', 0] } },
          totalPaye: { $sum: { $ifNull: ['$montantPaye', 0] } },
          nbFactures: { $sum: 1 },
          derniereFactureDate: { $max: '$createdAt' },
        },
      },
    ])) as Array<{
      _id: mongoose.Types.ObjectId | string;
      totalFacture: number;
      totalPaye: number;
      nbFactures: number;
      derniereFactureDate?: Date;
    }>;

    // Lookup clients en bulk pour récupérer le nom.
    const clientIds = agg
      .map((r) => r._id)
      .filter(Boolean)
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter((x): x is mongoose.Types.ObjectId => x !== null);

    const clients = clientIds.length
      ? await Client.find({ _id: { $in: clientIds } })
          .select('nom')
          .lean()
      : [];
    const clientMap = new Map(clients.map((c) => [String(c._id), String(c.nom)]));

    let rows: ClientDebiteurTransit[] = agg
      .map((r) => {
        const id = String(r._id || '');
        const nom = clientMap.get(id) || '—';
        const soldeDu =
          Math.round(((r.totalFacture || 0) - (r.totalPaye || 0)) * 100) / 100;
        return {
          clientId: id,
          clientNom: nom,
          totalFacture: r.totalFacture || 0,
          totalPaye: r.totalPaye || 0,
          soldeDu,
          nbFactures: r.nbFactures || 0,
          derniereFactureDate: r.derniereFactureDate,
        };
      })
      .filter((r) => (includeZero ? true : r.soldeDu > 0))
      .sort((a, b) => b.soldeDu - a.soldeDu);

    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => r.clientNom.toLowerCase().includes(s));
    }

    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/transit/clients-debiteurs error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.COMPTABLE,
]);
