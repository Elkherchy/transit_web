import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { BonCommande } from '@/models';
import { ApiResponse, BonCommandeStatut, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

export interface ClientDebiteurLogistique {
  clientNom: string;
  totalBons: number;
  totalPaye: number;
  soldeDu: number;
  nbBons: number;
  derniereBonDate?: Date;
}

/**
 * GET /api/logistique/clients-debiteurs
 * Liste des clients logistique avec solde dû calculé sur les bons de commande.
 *
 *   soldeDu = sum(total des bons CONFIRME) − sum(total des bons PAYE déjà soldés)
 *
 * Note : le BonCommande stocke `client` comme string libre (nom). On agrège
 * donc par nom (insensible à la casse — clé toUpperCase()).
 *
 * Query :
 *   - includeZero? : '1' → inclure clients à solde nul
 *   - search?      : filtre nom client
 *
 * Auth : ADMIN, ADMIN_LOGISTIQUE, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ClientDebiteurLogistique[]>>
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

    // Agrégation : par client (chaîne), on calcule
    //   - totalBons : somme des montants des bons CONFIRME ou PAYE
    //   - totalPaye : somme des montants des bons PAYE
    const agg = (await BonCommande.aggregate([
      {
        $match: {
          statut: { $in: [BonCommandeStatut.CONFIRME, BonCommandeStatut.PAYE] },
        },
      },
      {
        $group: {
          _id: { $toUpper: { $trim: { input: { $ifNull: ['$client', ''] } } } },
          clientNomRaw: { $first: '$client' },
          totalBons: { $sum: { $ifNull: ['$total', 0] } },
          totalPaye: {
            $sum: {
              $cond: [
                { $eq: ['$statut', BonCommandeStatut.PAYE] },
                { $ifNull: ['$total', 0] },
                0,
              ],
            },
          },
          nbBons: { $sum: 1 },
          derniereBonDate: { $max: '$createdAt' },
        },
      },
    ])) as Array<{
      _id: string;
      clientNomRaw?: string;
      totalBons: number;
      totalPaye: number;
      nbBons: number;
      derniereBonDate?: Date;
    }>;

    let rows: ClientDebiteurLogistique[] = agg
      .map((r) => {
        const soldeDu =
          Math.round(((r.totalBons || 0) - (r.totalPaye || 0)) * 100) / 100;
        return {
          clientNom: (r.clientNomRaw || r._id || '—').trim() || '—',
          totalBons: r.totalBons || 0,
          totalPaye: r.totalPaye || 0,
          soldeDu,
          nbBons: r.nbBons || 0,
          derniereBonDate: r.derniereBonDate,
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
    console.error('GET /api/logistique/clients-debiteurs error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.COMPTABLE,
]);
