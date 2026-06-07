import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { DepenseCategorie } from '@/models';
import {
  DepenseCategorieStatus,
  type IDepenseCategorie,
} from '@/models/DepenseCategorie';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * GET /api/depenses/categories
 *
 * Liste les catégories de dépense. Par défaut, masque les catégories
 * EN_ATTENTE aux non-admins (sauf au créateur AGENT_TRANSIT pour son suivi).
 *
 * Query :
 *   ?statut=EN_ATTENTE|VALIDE  → filtre explicite
 *   ?onlyValide=1              → uniquement les VALIDE (utilisé par le caissier
 *                                lors de la création d'une dépense)
 */
async function listCategories(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IDepenseCategorie[]>>
) {
  try {
    await connectDB();
    const { statut, onlyValide } = req.query;
    const filter: Record<string, unknown> = { actif: true };
    const role = req.user!.role;

    if (onlyValide === '1' || onlyValide === 'true') {
      filter.statut = DepenseCategorieStatus.VALIDE;
    } else if (
      typeof statut === 'string' &&
      Object.values(DepenseCategorieStatus).includes(
        statut as DepenseCategorieStatus
      )
    ) {
      filter.statut = statut;
    } else if (
      role !== UserRole.ADMIN &&
      role !== UserRole.ADMIN_TRANSIT
    ) {
      if (role === UserRole.AGENT_TRANSIT) {
        filter.$or = [
          { statut: DepenseCategorieStatus.VALIDE },
          {
            statut: DepenseCategorieStatus.EN_ATTENTE,
            createdBy: req.user!.userId,
          },
        ];
      } else {
        filter.statut = DepenseCategorieStatus.VALIDE;
      }
    }

    const rows = await DepenseCategorie.find(filter)
      .sort({ nom: 1 })
      .lean();
    return res
      .status(200)
      .json({ success: true, data: rows as unknown as IDepenseCategorie[] });
  } catch (error) {
    console.error('GET /api/depenses/categories error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST /api/depenses/categories
 *
 * AGENT_TRANSIT crée une catégorie en EN_ATTENTE.
 * ADMIN_TRANSIT crée directement en VALIDE.
 *
 * Body : { nom: string, description?: string }
 */
async function createCategorie(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IDepenseCategorie>>
) {
  try {
    await connectDB();
    const { nom, description } = (req.body || {}) as {
      nom?: string;
      description?: string;
    };
    if (!nom || !String(nom).trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'Le nom de la catégorie est requis' });
    }

    const isAgent = req.user!.role === UserRole.AGENT_TRANSIT;
    const doc = await DepenseCategorie.create({
      nom: String(nom).trim(),
      description: description ? String(description).trim() : null,
      statut: isAgent
        ? DepenseCategorieStatus.EN_ATTENTE
        : DepenseCategorieStatus.VALIDE,
      actif: true,
      createdBy: req.user!.userId,
      valideBy: isAgent ? null : req.user!.userId,
      valideAt: isAgent ? null : new Date(),
    });

    return res.status(201).json({
      success: true,
      data: doc.toObject() as unknown as IDepenseCategorie,
      message: isAgent
        ? 'Catégorie créée — en attente de validation admin'
        : 'Catégorie créée',
    });
  } catch (error) {
    console.error('POST /api/depenses/categories error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return withAuth(listCategories, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(createCategorie, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    default:
      return res
        .status(405)
        .json({ success: false, error: 'Méthode non autorisée' });
  }
}
