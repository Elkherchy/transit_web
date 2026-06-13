import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  TransitStatus,
  UserRole,
  ITransit,
  isDesignationAdminOnly,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * GET /api/transit/disponibles
 * Renvoie les dossiers transit ayant au moins une désignation LIBRE,
 * ainsi que les désignations RESERVEE/PAYEE prises par le payeur connecté.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ITransit[]>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const uid = req.user!.userId;

    // Transit ayant au moins une désignation LIBRE OU une désignation active du payeur.
    // Exclus : BROUILLON (non validé par admin) et CLOTURE (manutention clôturée).
    // Pour le payeur, on n'affiche que les transits où il a au moins une désignation
    // non encore clôturée (pas VALIDEE_ADMIN) — évite l'affichage post-clôture.
    const ACTIVE_PAYEUR_STATUTS = [
      DesignationStatus.RESERVEE,
      DesignationStatus.PAYEE,
      DesignationStatus.VALIDEE_TRANSIT,
      DesignationStatus.REJETEE,
    ];
    const transits = await Transit.find({
      statut: { $nin: [TransitStatus.BROUILLON, TransitStatus.CLOTURE] },
      $or: [
        { 'designations.statutDesignation': DesignationStatus.LIBRE },
        {
          designations: {
            $elemMatch: {
              payeurId: uid,
              statutDesignation: { $in: ACTIVE_PAYEUR_STATUTS },
            },
          },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Les désignations admin-only ne sont jamais exposées au payeur — ni
    // dans la liste des disponibles, ni dans le détail transit.
    const filtered = (transits as unknown as ITransit[]).map((tr) => ({
      ...tr,
      designations: (tr.designations || []).filter(
        (d) => !isDesignationAdminOnly(d.nom)
      ),
    }));

    return res.status(200).json({
      success: true,
      data: filtered,
    });
  } catch (error) {
    console.error('GET /api/transit/disponibles error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.USER_PAYEUR, UserRole.ADMIN]);
