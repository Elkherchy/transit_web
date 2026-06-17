import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  UserRole,
  TransitStatus,
  isDesignationAdminOnly,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/transit/[id]/designation/[idx]/reserver
 * Verrouille une désignation pour le payeur connecté. First-come, first-served :
 * une seule réservation possible par désignation. Une fois RESERVEE, les autres
 * payeurs ne peuvent plus la prendre.
 *
 * `idx` peut être un index numérique (0..n-1) ou un `_id` Mongo de la désignation.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ transitId: string; designationId: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const transitId = String(req.query.id);
    const idxRaw = String(req.query.idx);
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit ID invalide' });
    }

    const transit = await Transit.findById(transitId);
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Transit introuvable' });
    }

    // Résoudre la désignation : par _id ou index numérique.
    // Le sous-document Mongoose hérite des champs enrichis (payeurId, reservedAt, etc.).
    let designation: mongoose.Types.Subdocument & {
      _id: mongoose.Types.ObjectId;
      statutDesignation?: string;
      payeurId?: unknown;
      reservedAt?: Date | null;
      nom: string;
      montant: number;
    } | null = null;
    if (mongoose.isValidObjectId(idxRaw)) {
      designation = transit.designations.id(idxRaw);
    } else {
      const numIdx = parseInt(idxRaw, 10);
      if (Number.isInteger(numIdx) && numIdx >= 0 && numIdx < transit.designations.length) {
        designation = transit.designations[numIdx];
      }
    }
    if (!designation) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }

    // Les désignations admin-only ne peuvent pas être réservées/payées par le payeur.
    if (
      req.user!.role === UserRole.USER_PAYEUR &&
      isDesignationAdminOnly(designation.nom)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Cette désignation est réservée à l\'administration',
      });
    }

    if (designation.statutDesignation && designation.statutDesignation !== DesignationStatus.LIBRE) {
      // Déjà réservée par quelqu'un (ou payée) → on bloque.
      return res.status(409).json({
        success: false,
        error: 'Désignation déjà prise par un autre payeur',
      });
    }

    designation.statutDesignation = DesignationStatus.RESERVEE;
    designation.payeurId = new mongoose.Types.ObjectId(req.user!.userId);
    designation.reservedAt = new Date();

    if (transit.statut === TransitStatus.EN_COURS) {
      // Démarre le cycle dès qu'une désignation est prise.
      transit.statut = TransitStatus.EN_VALIDATION;
    }

    await transit.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      data: {
        transitId: String(transit._id),
        designationId: String(designation._id),
      },
      message: 'Désignation réservée',
    });
  } catch (error) {
    console.error('Reserver désignation error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.USER_PAYEUR, UserRole.ADMIN]);
