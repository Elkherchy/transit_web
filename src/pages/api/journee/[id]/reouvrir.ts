import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
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
 * POST /api/journee/[id]/reouvrir
 *
 * Permet au caissier (ou admin) de **réouvrir** une journée clôturée par
 * erreur, tant qu'elle n'a pas été validée par l'agent transit.
 *
 * Conditions :
 *   - statut === CLOTUREE (uniquement)
 *   - le caissier doit être le propriétaire de la journée (sauf admin)
 *
 * Effets : statut → OUVERTE, `soldeGeneralFin` et `closedAt` réinitialisés.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IJourneeCaisse>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const journee = await JourneeCaisse.findById(id);
    if (!journee) {
      return res.status(404).json({ success: false, error: 'Journée introuvable' });
    }

    const role = req.user!.role;
    const isAdmin = role === UserRole.ADMIN;
    const isOwner = String(journee.caissierId) === String(req.user!.userId);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: "Vous n'êtes pas le caissier de cette journée",
      });
    }

    if (journee.statut !== JourneeCaisseStatus.CLOTUREE) {
      const message =
        journee.statut === JourneeCaisseStatus.OUVERTE
          ? 'La journée est déjà ouverte'
          : 'La journée a déjà été validée — impossible de la réouvrir';
      return res.status(400).json({ success: false, error: message });
    }

    journee.statut = JourneeCaisseStatus.OUVERTE;
    journee.set('soldeGeneralFin', null);
    journee.set('closedAt', null);
    // Réinitialise le snapshot KPI : il sera recalculé à la prochaine clôture.
    journee.set('depotsAdminTotal', null);
    journee.set('depotsAdminCount', null);
    journee.set('alimentationsTotalReal', null);
    journee.set('alimentationsCountReal', null);
    await journee.save();

    return res.status(200).json({
      success: true,
      data: journee.toObject() as unknown as IJourneeCaisse,
      message: 'Journée réouverte',
    });
  } catch (error) {
    console.error('reouvrir journee error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
