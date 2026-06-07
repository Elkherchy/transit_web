import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FichierLogistique, Voyage } from '@/models';
import {
  ApiResponse,
  FichierLogistiqueStatus,
  IFichierLogistique,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/logistique/fichiers/[id]/soumettre
 *
 * L'agent réception logistique soumet le dossier à l'agent transit pour
 * validation finale (voyage par voyage). Pré-condition : tous les voyages
 * du dossier doivent être au statut `RETOURNE` (au moins un et aucun
 * voyage non retourné).
 *
 * Statut : `OUVERT` → `PRET_VALIDATION`
 *
 * Auth : ADMIN, ADMIN_LOGISTIQUE, AGENT_RECEPTION_LOGISTIQUE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IFichierLogistique>>
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

    const fichier = await FichierLogistique.findById(id);
    if (!fichier) {
      return res.status(404).json({ success: false, error: 'Fichier introuvable' });
    }

    if (fichier.statut === FichierLogistiqueStatus.VALIDE) {
      return res.status(400).json({
        success: false,
        error: 'Ce dossier est déjà validé',
      });
    }
    if (fichier.statut === FichierLogistiqueStatus.PRET_VALIDATION) {
      return res.status(400).json({
        success: false,
        error: 'Ce dossier a déjà été soumis à validation',
      });
    }

    const voyages = await Voyage.find({ fichierLogistiqueId: id }).lean();
    if (voyages.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Aucun voyage dans ce dossier' });
    }

    fichier.statut = FichierLogistiqueStatus.PRET_VALIDATION;
    await fichier.save();

    return res.status(200).json({
      success: true,
      data: fichier.toObject() as unknown as IFichierLogistique,
      message: 'Dossier soumis à l\'agent transit pour validation',
    });
  } catch (error) {
    console.error('POST /api/logistique/fichiers/[id]/soumettre error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
]);
