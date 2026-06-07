import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { User, Vehicule } from '@/models';
import {
  ApiResponse,
  IVehiculeResponse,
  PaginatedResponse,
  UserRole,
  VehiculeCategorie,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

async function listVehicules(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IVehiculeResponse>>>
) {
  try {
    await connectDB();

    const { page = '1', limit = '20', search, categorie } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const andClauses: Record<string, unknown>[] = [];
    if (typeof search === 'string' && search.trim()) {
      andClauses.push({
        $or: [
          { matricule: { $regex: search.trim(), $options: 'i' } },
          { clientNom: { $regex: search.trim(), $options: 'i' } },
        ],
      });
    }
    if (typeof categorie === 'string' && Object.values(VehiculeCategorie).includes(categorie as VehiculeCategorie)) {
      if (categorie === VehiculeCategorie.INTERNE) {
        // Compatibilite historique: certains anciens documents n'ont pas encore la categorie.
        andClauses.push({
          $or: [
            { categorie: VehiculeCategorie.INTERNE },
            { categorie: { $exists: false } },
            { categorie: null },
            { categorie: '' },
          ],
        });
      } else {
        andClauses.push({ categorie });
      }
    }

    const query: Record<string, unknown> =
      andClauses.length > 0 ? { $and: andClauses } : {};

    const [vehicules, total] = await Promise.all([
      Vehicule.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Vehicule.countDocuments(query),
    ]);

    const chauffeurIds = vehicules
      .map((row) => String(row.chauffeurId || ''))
      .filter((id) => id.length > 0);

    const chauffeurs = await User.find({
      _id: { $in: chauffeurIds },
      role: UserRole.CHAUFFEUR,
    })
      .select('nom')
      .lean();

    const chauffeurById = new Map(chauffeurs.map((c) => [String(c._id), c.nom]));

    const data: IVehiculeResponse[] = vehicules.map((row) => ({
      _id: String(row._id),
      matricule: String(row.matricule),
      categorie: (row.categorie as VehiculeCategorie) || VehiculeCategorie.INTERNE,
      chauffeurId: row.chauffeurId ? String(row.chauffeurId) : undefined,
      clientNom: row.clientNom ? String(row.clientNom) : undefined,
      chauffeurNom:
        row.chauffeurId
          ? chauffeurById.get(String(row.chauffeurId)) || 'Chauffeur introuvable'
          : undefined,
      carburant: Number(row.carburant || 0),
      actif: Boolean(row.actif),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List vehicules error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createVehicule(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IVehiculeResponse>>
) {
  try {
    await connectDB();

    const { matricule, chauffeurId, actif, carburant, categorie, clientNom } = req.body as {
      matricule?: string;
      chauffeurId?: string;
      actif?: boolean;
      carburant?: number;
      categorie?: VehiculeCategorie;
      clientNom?: string;
    };

    const normalizedMatricule = String(matricule || '').trim().toUpperCase();
    const normalizedChauffeurId = String(chauffeurId || '').trim();
    const normalizedClientNom = String(clientNom || '').trim();
    const normalizedCategorie =
      categorie && Object.values(VehiculeCategorie).includes(categorie)
        ? categorie
        : VehiculeCategorie.INTERNE;

    if (!normalizedMatricule) {
      return res.status(400).json({
        success: false,
        error: 'Matricule requis',
      });
    }

    let chauffeurNom: string | undefined;
    if (normalizedCategorie === VehiculeCategorie.INTERNE) {
      if (!normalizedChauffeurId) {
        return res.status(400).json({
          success: false,
          error: 'Chauffeur requis pour un vehicule interne',
        });
      }
      const chauffeur = await User.findOne({
        _id: normalizedChauffeurId,
        role: UserRole.CHAUFFEUR,
        actif: true,
      })
        .select('nom')
        .lean();

      if (!chauffeur) {
        return res.status(400).json({
          success: false,
          error: 'Chauffeur invalide ou inactif',
        });
      }
      chauffeurNom = String(chauffeur.nom || '');
    }

    if (normalizedCategorie === VehiculeCategorie.CLIENT && !normalizedClientNom) {
      return res.status(400).json({
        success: false,
        error: 'Nom client requis pour un vehicule client',
      });
    }

    const exists = await Vehicule.findOne({ matricule: normalizedMatricule }).lean();
    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'Ce matricule existe deja',
      });
    }

    const vehicule = await Vehicule.create({
      matricule: normalizedMatricule,
      categorie: normalizedCategorie,
      chauffeurId: normalizedCategorie === VehiculeCategorie.INTERNE ? normalizedChauffeurId : undefined,
      clientNom: normalizedCategorie === VehiculeCategorie.CLIENT ? normalizedClientNom : undefined,
      carburant: Math.max(0, Number(carburant || 0)),
      actif: actif !== false,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: String(vehicule._id),
        matricule: vehicule.matricule,
        categorie: (vehicule.categorie as VehiculeCategorie) || VehiculeCategorie.INTERNE,
        chauffeurId: vehicule.chauffeurId || undefined,
        chauffeurNom,
        clientNom: vehicule.clientNom || undefined,
        carburant: Number(vehicule.carburant || 0),
        actif: vehicule.actif,
        createdAt: vehicule.createdAt,
        updatedAt: vehicule.updatedAt,
      },
      message: 'Vehicule cree',
    });
  } catch (error) {
    console.error('Create vehicule error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listVehicules)(req, res);
    case 'POST':
      return withLogistique(createVehicule)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
