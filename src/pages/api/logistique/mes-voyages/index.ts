import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Voyage, FichierLogistique } from '@/models';
import {
  ApiResponse,
  IVoyage,
  IFichierLogistique,
  VoyageStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface VoyageWithFichier extends IVoyage {
  fichier?: { _id: string; reference: string; date: Date; statut: string };
}

/**
 * GET /api/logistique/mes-voyages
 *
 * Renvoie au chauffeur connecté :
 *   - les voyages **CREE** (libres, n'importe quel chauffeur peut les prendre)
 *   - **ses propres voyages** (RESERVE / EN_COURS / RETOURNE / VALIDE)
 *
 * Les voyages pris par d'autres chauffeurs sont **masqués**.
 *
 * Auth : CHAUFFEUR (admin pour debug).
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<VoyageWithFichier[]>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const uid = req.user!.userId;

    const voyages = await Voyage.find({
      $or: [
        { statutVoyage: VoyageStatus.CREE },
        { chauffeurId: uid },
      ],
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .lean();

    // Joindre les fichiers logistique liés (pour la référence + statut).
    const fichierIds = Array.from(
      new Set(
        (voyages as { fichierLogistiqueId?: unknown }[])
          .map((v) => (v.fichierLogistiqueId ? String(v.fichierLogistiqueId) : ''))
          .filter(Boolean)
      )
    );
    const fichiers = await FichierLogistique.find({
      _id: { $in: fichierIds },
    })
      .select('_id reference date statut')
      .lean();
    const map = new Map<string, IFichierLogistique>();
    for (const f of fichiers as unknown as IFichierLogistique[]) {
      map.set(String(f._id), f);
    }

    const data: VoyageWithFichier[] = (voyages as unknown as IVoyage[]).map(
      (v) => {
        const fid = (v as { fichierLogistiqueId?: unknown }).fichierLogistiqueId;
        const f = fid ? map.get(String(fid)) : undefined;
        return {
          ...v,
          fichier: f
            ? {
                _id: String(f._id),
                reference: f.reference,
                date: f.date,
                statut: f.statut,
              }
            : undefined,
        };
      }
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('GET /api/logistique/mes-voyages error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.CHAUFFEUR, UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]);
