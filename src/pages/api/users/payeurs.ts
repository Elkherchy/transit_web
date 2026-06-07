import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { User } from '@/models';
import { ApiResponse, IUserResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withCaissierAccess } from '@/middleware/auth';

/**
 * GET /api/users/payeurs — Liste des utilisateurs USER_PAYEUR (désignation sur factures).
 * Accessible par: ADMIN, CAISSIER, COMPTABLE
 */
async function listPayeurs(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IUserResponse[]>>) {
  try {
    await connectDB();
    console.log('[API /users/payeurs] DB connectée, recherche des payeurs...');

    // Inclut USER_PAYEUR (paiement transit) ET AGENT_RECEPTION_LOGISTIQUE
    // (frais opérationnels) — tous deux peuvent être alimentés par le caissier.
    const users = await User.find({
      role: {
        $in: [UserRole.USER_PAYEUR, UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
      actif: true,
    })
      .select('nom email role telephone caisse actif')
      .sort({ nom: 1 })
      .lean();

    console.log(`[API /users/payeurs] ${users.length} payeurs trouvés`);

    const data: IUserResponse[] = users.map((u) => ({
      _id: u._id.toString(),
      nom: u.nom,
      email: u.email,
      role: u.role as UserRole,
      caisse: u.caisse,
      telephone: u.telephone,
      actif: u.actif,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[API /users/payeurs] Erreur:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  
  console.log('[API /users/payeurs] Requête reçue');
  
  // Utiliser withCaissierAccess qui permet ADMIN, CAISSIER et COMPTABLE
  return withCaissierAccess(listPayeurs)(req, res);
}
