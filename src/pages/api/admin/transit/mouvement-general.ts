import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { ApiResponse, CaisseType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import {
  computeMouvementGeneral,
  type MouvementGeneral,
} from '@/lib/mouvementGeneral';

/**
 * GET /api/admin/transit/mouvement-general
 * KPI consolidés du compte général Transit : Solde · Charges · Bénéfices ·
 * Crédit Client. Période optionnelle (défaut : mois en cours).
 *
 * Query : ?dateDebut=ISO&dateFin=ISO
 * Auth  : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<MouvementGeneral>>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const debut = req.query.dateDebut
      ? new Date(String(req.query.dateDebut))
      : undefined;
    const fin = req.query.dateFin
      ? new Date(String(req.query.dateFin))
      : undefined;
    const data = await computeMouvementGeneral(CaisseType.TRANSIT, debut, fin);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('GET mouvement-general transit error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.COMPTABLE,
]);
