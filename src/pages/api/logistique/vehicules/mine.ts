import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Vehicule } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface MyVehiculeResult {
  _id: string;
  matricule: string;
  categorie?: string;
  actif: boolean;
}

/**
 * GET /api/logistique/vehicules/mine
 * Retourne le véhicule assigné au chauffeur connecté (le plus récent si
 * plusieurs). Utilisé par la page de réservation de voyage pour pré-remplir
 * automatiquement le matricule.
 *
 * Auth : CHAUFFEUR (et ADMIN pour tester).
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<MyVehiculeResult | null>>
) {
  if (req.method !== 'GET') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const uid = req.user!.userId;

    const vehicule = await Vehicule.findOne({
      chauffeurId: uid,
      actif: true,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select('_id matricule categorie actif')
      .lean();

    if (!vehicule) {
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: String(vehicule._id),
        matricule: String(vehicule.matricule || ''),
        categorie: vehicule.categorie,
        actif: Boolean(vehicule.actif),
      },
    });
  } catch (error) {
    console.error('GET /api/logistique/vehicules/mine error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.CHAUFFEUR, UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]);
