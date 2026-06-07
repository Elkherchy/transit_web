import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Facture, FactureManutention, Transit } from '@/models';
import {
  ApiResponse,
  FactureManutentionStatus,
  IFactureManutention,
  PaginatedResponse,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * Étend `IFactureManutention` avec :
 *   - le montant agrégé de la facture client (via le transit auto-créé)
 *   - le nombre et le total des désignations du transit lié (= les lignes
 *     entreprise réelles côté transit)
 */
export interface IFactureManutentionWithClient extends IFactureManutention {
  factureClientTotal: number;
  factureClientPaye: number;
  designationsCount: number;
  designationsTotal: number;
}

/**
 * GET /api/transit/bls
 * Liste des BL côté Transit, lus depuis les dossiers de manutention
 * (FactureManutention). Chaque facture porte un BL principal + des lignes
 * entreprise avec leurs propres BL.
 *
 * Query :
 *   - search?  : filtre BL principal OU nom entreprise OU client
 *   - statut?  : filtre exact sur FactureManutentionStatus
 *   - validated? : 'true' = CLOTURE seul ; 'false' = ≠ CLOTURE
 *   - page?, limit?
 *
 * Auth : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT, CAISSIER, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<
    ApiResponse<PaginatedResponse<IFactureManutentionWithClient>>
  >
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    const {
      page = '1',
      limit = '25',
      search,
      statut,
      validated,
      adminValidated,
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (typeof search === 'string' && search.trim()) {
      const s = search.trim();
      query.$or = [
        { bl: { $regex: s, $options: 'i' } },
        { 'lignesEntreprise.nomEntreprise': { $regex: s, $options: 'i' } },
        { 'lignesEntreprise.bl': { $regex: s, $options: 'i' } },
        { client: { $regex: s, $options: 'i' } },
      ];
    }

    if (
      typeof statut === 'string' &&
      Object.values(FactureManutentionStatus).includes(
        statut as FactureManutentionStatus
      )
    ) {
      query.statut = statut;
    } else if (validated === 'true') {
      query.statut = FactureManutentionStatus.CLOTURE;
    } else if (validated === 'false') {
      query.statut = { $ne: FactureManutentionStatus.CLOTURE };
    } else if (adminValidated === 'true') {
      // « Validé » : BL avec tous les paiements terminés et validés
      //   = statut CLOTURE.
      query.statut = FactureManutentionStatus.CLOTURE;
    } else if (adminValidated === 'false') {
      // « Non validé » : tous les BL pas encore clôturés (en attente
      // validation admin, en cours de paiement, partiel, etc.).
      query.statut = { $ne: FactureManutentionStatus.CLOTURE };
    }

    const [factures, total] = await Promise.all([
      FactureManutention.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      FactureManutention.countDocuments(query),
    ]);

    // Enrichit chaque manutention avec :
    //   - les factures client (Facture.totalFinal / montantPaye) du transit
    //     auto-créé (plusieurs factures par transit possibles → on somme)
    //   - les désignations (Transit.designations) — "Lignes entreprise" =
    //     les désignations du transit lié
    const transitIds = Array.from(
      new Set(
        factures
          .map((f) => (f.transitId ? String(f.transitId) : ''))
          .filter(Boolean)
      )
    );
    const transitObjectIds = transitIds.map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    });
    const validTransitOids = transitObjectIds.filter(
      (x): x is mongoose.Types.ObjectId => x !== null
    );

    // Désignations du transit (count + somme montants).
    const transitDocs = validTransitOids.length
      ? await Transit.find({ _id: { $in: validTransitOids } })
          .select('designations')
          .lean()
      : [];
    const designationsMap = new Map(
      transitDocs.map((tt) => {
        const designations = (tt.designations || []) as Array<{
          montant?: number;
        }>;
        return [
          String(tt._id),
          {
            count: designations.length,
            total: designations.reduce(
              (s, d) => s + (Number(d.montant) || 0),
              0
            ),
          },
        ];
      })
    );

    // Note importante : `Facture.transitId` est stocké en *String* alors que
    // `FactureManutention.transitId` est en *ObjectId*. On matche donc avec
    // les strings côté Facture pour éviter le mismatch de type qui causait
    // un total à 0.
    const factureAgg = transitIds.length
      ? await Facture.aggregate<{
          _id: string;
          totalFinal: number;
          montantPaye: number;
        }>([
          {
            $match: {
              transitId: { $in: transitIds },
            },
          },
          {
            $group: {
              _id: '$transitId',
              totalFinal: { $sum: { $ifNull: ['$totalFinal', 0] } },
              montantPaye: { $sum: { $ifNull: ['$montantPaye', 0] } },
            },
          },
        ])
      : [];
    const factureMap = new Map(
      factureAgg.map((r) => [
        String(r._id),
        { total: r.totalFinal || 0, paye: r.montantPaye || 0 },
      ])
    );

    const enriched: IFactureManutentionWithClient[] = factures.map((f) => {
      const tx = f.transitId
        ? factureMap.get(String(f.transitId))
        : undefined;
      const dx = f.transitId
        ? designationsMap.get(String(f.transitId))
        : undefined;
      return {
        ...(f as unknown as IFactureManutention),
        factureClientTotal: tx?.total ?? 0,
        factureClientPaye: tx?.paye ?? 0,
        designationsCount: dx?.count ?? 0,
        designationsTotal: dx?.total ?? 0,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        data: enriched,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error('GET /api/transit/bls error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
  UserRole.COMPTABLE,
]);
