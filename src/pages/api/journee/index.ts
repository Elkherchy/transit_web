import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { JourneeCaisse } from '@/models';
import {
  ApiResponse,
  IJourneeCaisse,
  JourneeCaisseStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * GET /api/journee?statut=CLOTUREE|OUVERTE|VALIDEE_TRANSIT|VALIDEE_ADMIN
 * Liste des journées caisse, filtrables par statut. Tri par date desc.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IJourneeCaisse[]>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const { statut, limit = '200' } = req.query;
    const query: Record<string, unknown> = {};
    if (statut && Object.values(JourneeCaisseStatus).includes(statut as JourneeCaisseStatus)) {
      query.statut = statut;
    }
    const lim = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 200));
    const list = await JourneeCaisse.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(lim)
      .lean();
    return res.status(200).json({
      success: true,
      data: list as unknown as IJourneeCaisse[],
    });
  } catch (error) {
    console.error('GET /api/journee error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
]);
