import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Voyage, BonCommande, FichierLogistique } from '@/models';
import {
  ApiResponse,
  FichierLogistiqueStatus,
  IVoyage,
  PaginatedResponse,
  UserRole,
  VoyageStatus,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import mongoose from 'mongoose';

/**
 * GET /api/logistique/voyages
 * Listing simple des voyages — utilisé par la page Véhicules, la création
 * de bons de commande, et la page "Liste BL".
 *
 * Query :
 *   - search?           : matricule | bl | ntc | ntcs[]
 *   - page?             : numéro de page (1-based, défaut 1)
 *   - limit?            : taille de page (max 500, défaut 20)
 *   - excludeUsedInBon? : '1' → exclut voyages déjà référencés par un BonCommande
 *   - onlyWithBL?       : '1' → uniquement les voyages avec un BL non vide
 *   - statut?           : filtre exact sur statutVoyage (CREE/RESERVE/EN_COURS/RETOURNE/VALIDE)
 *   - validated?        : 'true' = VALIDE seul ; 'false' = !VALIDE (compat "Liste BL Validées" / "Non Valide")
 *
 * Auth : COMPTABLE+
 */
async function listVoyages(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IVoyage>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '20',
      search,
      clientSource,
      excludeUsedInBon,
      onlyWithBL,
      statut,
      validated,
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (typeof search === 'string' && search.trim()) {
      const s = search.trim();
      query.$or = [
        { matricule: { $regex: s, $options: 'i' } },
        { bl: { $regex: s, $options: 'i' } },
        { ntc: { $regex: s, $options: 'i' } },
        { ntcs: { $regex: s, $options: 'i' } },
      ];
    }

    if (typeof clientSource === 'string' && clientSource.trim()) {
      query.clientSource = { $regex: clientSource.trim(), $options: 'i' };
    }

    if (onlyWithBL === '1' || onlyWithBL === 'true') {
      query.bl = { $exists: true, $ne: null, $not: /^$/ };
    }

    if (
      typeof statut === 'string' &&
      Object.values(VoyageStatus).includes(statut as VoyageStatus)
    ) {
      query.statutVoyage = statut;
    } else if (validated === 'true') {
      query.statutVoyage = VoyageStatus.VALIDE;
    } else if (validated === 'false') {
      query.statutVoyage = { $ne: VoyageStatus.VALIDE };
    }

    if (excludeUsedInBon === '1' || excludeUsedInBon === 'true') {
      const usedAgg = await BonCommande.aggregate([
        { $unwind: '$lignes' },
        { $group: { _id: null, voyageIds: { $addToSet: '$lignes.voyageId' } } },
      ]);
      const usedIds = (usedAgg[0]?.voyageIds || []) as mongoose.Types.ObjectId[];
      if (usedIds.length > 0) {
        query._id = { $nin: usedIds };
      }
    }

    // Tant que l'agent réception n'a pas validé/soumis le dossier (OUVERT), les
    // BL associés ne doivent pas remonter côté Transit/Comptable.
    const role = req.user!.role;
    if (
      role === UserRole.AGENT_TRANSIT ||
      role === UserRole.COMPTABLE
    ) {
      const openFichiers = await FichierLogistique.find({
        statut: FichierLogistiqueStatus.OUVERT,
      })
        .select('_id')
        .lean();
      if (openFichiers.length > 0) {
        const openIds = openFichiers.map((f) => String(f._id));
        query.$and = [
          ...(Array.isArray(query.$and) ? (query.$and as object[]) : []),
          {
            $or: [
              { fichierLogistiqueId: { $exists: false } },
              { fichierLogistiqueId: null },
              { fichierLogistiqueId: { $nin: openIds } },
            ],
          },
        ];
      }
    }

    const [voyages, total] = await Promise.all([
      Voyage.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Voyage.countDocuments(query),
    ]);

    // Enrichit chaque voyage avec la référence du fichier logistique parent
    // pour permettre l'affichage / le lien direct dans la page Liste BL.
    const fichierIds = Array.from(
      new Set(
        voyages
          .map((v) => (v.fichierLogistiqueId ? String(v.fichierLogistiqueId) : ''))
          .filter(Boolean)
      )
    );
    const fichiers = fichierIds.length
      ? await FichierLogistique.find({ _id: { $in: fichierIds } })
          .select('reference')
          .lean()
      : [];
    const fichierMap = new Map(
      fichiers.map((f) => [String(f._id), String(f.reference)])
    );

    const enriched = voyages.map((v) => ({
      ...v,
      fichierReference: v.fichierLogistiqueId
        ? fichierMap.get(String(v.fichierLogistiqueId))
        : undefined,
    }));

    return res.status(200).json({
      success: true,
      data: {
        data: enriched as unknown as IVoyage[],
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List voyages error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listVoyages)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
