import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit, Facture, Paiement, User } from '@/models';
import {
  ApiResponse,
  IFacture,
  FactureStatus,
  TransitStatus,
  UserRole,
  PaiementStatus,
} from '@/types';
import { serializeFacture } from '@/lib/serializeFacture';
import { withAuth, AuthenticatedRequest, withAgentTransit, withComptable } from '@/middleware/auth';
import mongoose from 'mongoose';

// GET /api/transit/factures/[id] - Get single facture
async function getFacture(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IFacture & { paiements?: any[] }>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const facture = await Facture.findById(id)
      .populate('payeurId', 'nom email')
      .lean();

    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture non trouvée' });
    }

    if (req.user!.role === UserRole.USER_PAYEUR) {
      const pid = (facture as { payeurId?: { _id?: unknown } | string }).payeurId;
      const payeurIdStr =
        pid && typeof pid === 'object' && '_id' in pid
          ? String(pid._id)
          : String(pid || '');
      if (payeurIdStr !== req.user!.userId) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }
    }

    const paiements = await Paiement.find({ factureId: String(id) }).lean();
    const transit = await Transit.findById(facture.transitId)
      .select('client bl objet')
      .lean();

    const base = serializeFacture(facture as Record<string, unknown>);
    const payeurModifiable = !paiements.some(
      (p) => (p as { statut: PaiementStatus }).statut !== PaiementStatus.REJETE
    );

    return res.status(200).json({
      success: true,
      data: {
        ...base,
        bl: base.bl || transit?.bl,
        transitClient: transit?.client,
        transitObjet: transit?.objet,
        paiements,
        payeurModifiable,
      } as IFacture & { paiements?: any[]; payeurModifiable: boolean },
    });
  } catch (error) {
    console.error('Get facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// PUT /api/transit/factures/[id] - Update facture
async function updateFacture(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IFacture>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const facture = await Facture.findById(id);

    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture non trouvée' });
    }

    const { interet, statut, payeurId: payeurIdBody } = req.body;

    if (payeurIdBody !== undefined) {
      const paiementActif = await Paiement.exists({
        factureId: String(id),
        statut: { $nin: [PaiementStatus.REJETE] },
      });
      const nextPayeurIdStr =
        payeurIdBody === null || payeurIdBody === ''
          ? null
          : String(payeurIdBody);
      const currentPayeurIdStr = facture.payeurId
        ? String(facture.payeurId)
        : null;
      if (
        paiementActif &&
        nextPayeurIdStr !== currentPayeurIdStr
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Impossible de modifier le payeur désigné : un paiement est en cours ou validé pour cette facture.',
        });
      }

      if (payeurIdBody === null || payeurIdBody === '') {
        facture.set('payeurId', null);
      } else {
        if (!mongoose.isValidObjectId(payeurIdBody)) {
          return res.status(400).json({
            success: false,
            error: 'ID payeur invalide',
          });
        }
        const payeurUser = await User.findById(payeurIdBody).lean();
        if (!payeurUser || payeurUser.role !== UserRole.USER_PAYEUR) {
          return res.status(400).json({
            success: false,
            error: 'L’utilisateur désigné doit être un compte Payeur',
          });
        }
        facture.set(
          'payeurId',
          new mongoose.Types.ObjectId(payeurIdBody as string)
        );
      }
    }

    if (interet !== undefined) {
      const interetNum = Math.max(0, Number(interet) || 0);
      facture.interet = interetNum;
      facture.totalFinal = facture.totalOperations + interetNum;
    }

    // Update status if provided
    if (statut) {
      // Validate status transition
      if (statut === FactureStatus.EMIS && facture.statut !== FactureStatus.BROUILLON) {
        return res.status(400).json({ 
          success: false, 
          error: 'Transition de statut invalide' 
        });
      }

      facture.statut = statut;

      // Update transit status when facture is emitted
      if (statut === FactureStatus.EMIS) {
        facture.dateEmission = new Date();
        const transit = await Transit.findById(facture.transitId);
        if (transit) {
          transit.statut = TransitStatus.FACTURE_EMISE;
          await transit.save({ validateModifiedOnly: true });
        }
      }
    }

    await facture.save();

    const transit = await Transit.findById(facture.transitId);
    if (transit && interet !== undefined) {
      transit.interet = facture.interet;
      await transit.save({ validateModifiedOnly: true });
    }

    const updated = await Facture.findById(id)
      .populate('payeurId', 'nom email')
      .lean();

    const data = serializeFacture((updated ?? facture.toObject()) as Record<string, unknown>);

    return res.status(200).json({
      success: true,
      data,
      message: 'Facture mise à jour avec succès',
    });
  } catch (error) {
    console.error('Update facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// DELETE /api/transit/factures/[id] - Delete facture
async function deleteFacture(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<null>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const facture = await Facture.findById(id);

    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture non trouvée' });
    }

    // Only allow deletion if status is BROUILLON
    if (facture.statut !== FactureStatus.BROUILLON) {
      return res.status(400).json({ 
        success: false, 
        error: 'La suppression n\'est possible que pour les factures en brouillon' 
      });
    }

    // Revert transit status
    const transit = await Transit.findById(facture.transitId);
    if (transit) {
      transit.statut = TransitStatus.EN_COURS;
      await transit.save({ validateModifiedOnly: true });
    }

    await Facture.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Facture supprimée avec succès',
    });
  } catch (error) {
    console.error('Delete facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getFacture)(req, res);
    case 'PUT':
      return withAgentTransit(updateFacture)(req, res);
    case 'DELETE':
      return withAgentTransit(deleteFacture)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
