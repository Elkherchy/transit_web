import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FactureManutention, Transit } from '@/models';
import {
  ApiResponse,
  FactureManutentionStatus,
  IFactureManutention,
  TransitStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { createTransitFromManutention } from '@/lib/manutention/createTransitFromManutention';

/**
 * POST /api/manutention/[id]/valider
 *
 * Validation par ADMIN_TRANSIT d'une facture manutention créée par un
 * AGENT_TRANSIT. Transitionne :
 *   - FactureManutention : BROUILLON / EN_ATTENTE_VALIDATION → EN_ATTENTE_PAIEMENT
 *   - Transit lié        : BROUILLON → EN_COURS (visible côté payeur)
 *
 * Auth : ADMIN, ADMIN_TRANSIT.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IFactureManutention>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const facture = await FactureManutention.findById(id);
    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture introuvable' });
    }

    const validablesStatuses: FactureManutentionStatus[] = [
      FactureManutentionStatus.BROUILLON,
      FactureManutentionStatus.EN_ATTENTE_VALIDATION,
    ];
    if (!validablesStatuses.includes(facture.statut as FactureManutentionStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture n\'est pas en attente de validation',
      });
    }

    facture.statut = FactureManutentionStatus.EN_ATTENTE_PAIEMENT;
    await facture.save();

    // Création / activation du dossier transit lié :
    //   - Si la facture n'a pas encore de transit (cas AGENT_TRANSIT qui crée
    //     un EN_ATTENTE_VALIDATION sans transit), on le crée maintenant.
    //   - Si un transit existe déjà (legacy BROUILLON), on l'active.
    if (!facture.transitId) {
      try {
        const result = await createTransitFromManutention({
          factureManutentionId: String(facture._id),
          client: facture.client || '',
          clientId: facture.clientId ? String(facture.clientId) : null,
          objet: facture.objet || '',
          bl: facture.bl,
          actorUserId: req.user!.userId,
          draft: false,
        });
        facture.transitId = result.transitId;
        await facture.save();
      } catch (e) {
        console.error('createTransitFromManutention on valider error:', e);
        return res.status(500).json({
          success: false,
          error:
            e instanceof Error
              ? e.message
              : 'Création du dossier transit échouée',
        });
      }
    } else {
      await Transit.findByIdAndUpdate(
        facture.transitId,
        { statut: TransitStatus.EN_COURS },
        { new: false }
      );
    }

    return res.status(200).json({
      success: true,
      data: facture.toObject() as unknown as IFactureManutention,
      message: 'Facture validée — visible côté payeur',
    });
  } catch (error) {
    console.error('POST /api/manutention/[id]/valider error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
