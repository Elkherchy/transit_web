import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { ManutentionPaiement, FactureManutention, User } from '@/models';
import {
  ApiResponse,
  IManutentionPaiement,
  ManutentionPaiementStatus,
  FactureManutentionStatus,
} from '@/types';
import { AuthenticatedRequest, withCaissier } from '@/middleware/auth';
import { recordManutentionPaiementValidatedToCaisse } from '@/lib/caisse';

// PUT /api/manutention/paiements/[id] - Valider ou rejeter un paiement
async function updatePaiementManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IManutentionPaiement>>
) {
  try {
    await connectDB();

    const { id } = req.query;
    const { statut, commentaire } = req.body;

    if (!statut || ![ManutentionPaiementStatus.VALIDE, ManutentionPaiementStatus.REJETE].includes(statut)) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide (doit être VALIDE ou REJETE)',
      });
    }

    const paiement = await ManutentionPaiement.findById(id);

    if (!paiement) {
      return res.status(404).json({
        success: false,
        error: 'Paiement introuvable',
      });
    }

    // Vérifier que le paiement est en attente de validation
    if (paiement.statut !== ManutentionPaiementStatus.EN_VALIDATION) {
      return res.status(400).json({
        success: false,
        error: 'Ce paiement n\'est pas en attente de validation',
      });
    }

    // Mettre à jour le paiement
    paiement.statut = statut;
    paiement.validePar = req.user!.userId;
    paiement.dateValidation = new Date();
    if (commentaire) {
      paiement.commentaire = commentaire;
    }

    await paiement.save();

    // Récupérer la facture manutention
    const facture = await FactureManutention.findById(paiement.factureManutentionId);

    if (facture) {
      if (statut === ManutentionPaiementStatus.VALIDE) {
        // Mettre à jour le statut de la facture
        await FactureManutention.findByIdAndUpdate(facture._id, {
          statut: FactureManutentionStatus.CLOTURE,
        });

        // Enregistrer en caisse
        const payeur = await User.findById(paiement.payeurId);
        if (payeur) {
          await recordManutentionPaiementValidatedToCaisse({
            manutentionPaiementId: String(paiement._id),
            montant: paiement.montant,
            date: paiement.datePaiement,
            actorUserId: req.user!.userId,
            factureCreatedByUserId: facture.createdBy,
            factureManutentionBl: facture.bl,
          });
        }
      } else {
        // Si rejeté, remettre la facture en attente de paiement
        await FactureManutention.findByIdAndUpdate(facture._id, {
          statut: FactureManutentionStatus.EN_ATTENTE_PAIEMENT,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: paiement as IManutentionPaiement,
      message: statut === ManutentionPaiementStatus.VALIDE
        ? 'Paiement validé avec succès'
        : 'Paiement rejeté',
    });
  } catch (error) {
    console.error('Update paiement manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// GET /api/manutention/paiements/[id] - Get single paiement
async function getPaiementManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IManutentionPaiement>>
) {
  try {
    await connectDB();

    const { id } = req.query;

    const paiement = await ManutentionPaiement.findById(id).lean();

    if (!paiement) {
      return res.status(404).json({
        success: false,
        error: 'Paiement introuvable',
      });
    }

    // Fetch facture and users manually (fields stored as String, not ObjectId ref)
    const [facture, payeurUser, valideParUser] = await Promise.all([
      paiement.factureManutentionId
        ? FactureManutention.findById(paiement.factureManutentionId).select('bl').lean()
        : null,
      paiement.payeurId
        ? User.findById(paiement.payeurId).select('nom email').lean()
        : null,
      paiement.validePar
        ? User.findById(paiement.validePar).select('nom').lean()
        : null,
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...paiement,
        factureManutentionId: facture
          ? { _id: String(facture._id), bl: facture.bl }
          : paiement.factureManutentionId,
        payeurId: payeurUser
          ? { _id: String(payeurUser._id), nom: payeurUser.nom, email: payeurUser.email }
          : paiement.payeurId,
        validePar: valideParUser
          ? { _id: String(valideParUser._id), nom: valideParUser.nom }
          : paiement.validePar,
      } as IManutentionPaiement,
    });
  } catch (error) {
    console.error('Get paiement manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withCaissier(getPaiementManutention)(req, res);
    case 'PUT':
      return withCaissier(updatePaiementManutention)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
