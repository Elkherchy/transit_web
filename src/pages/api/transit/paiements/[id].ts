import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Paiement, Transit, Facture, User } from '@/models';
import {
  ApiResponse,
  IPaiement,
  PaiementStatus,
  TransitStatus,
  FactureStatus,
  UserRole,
} from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { recordPaiementValidatedToCaisse } from '@/lib/caisse';
import mongoose from 'mongoose';

// GET /api/transit/paiements/[id] - Get single paiement
async function getPaiement(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IPaiement>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const paiement = await Paiement.findById(id).lean();

    if (!paiement) {
      return res.status(404).json({ success: false, error: 'Paiement non trouvé' });
    }

    // User payeur can only see their own paiements
    if (req.user!.role === UserRole.USER_PAYEUR && paiement.payeurId !== req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    const facture = await Facture.findById(paiement.factureId)
      .select('_id numero transitId')
      .lean();

    if (req.user!.role === UserRole.AGENT_TRANSIT) {
      if (!facture) {
        return res.status(404).json({ success: false, error: 'Facture liée introuvable' });
      }
      const transit = await Transit.findById(facture.transitId).select('createdBy').lean();
      if (!transit || String(transit.createdBy) !== req.user!.userId) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...(paiement as IPaiement),
        factureNumero: facture?.numero || undefined,
      },
    });
  } catch (error) {
    console.error('Get paiement error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// PUT /api/transit/paiements/[id] - Update paiement (validation)
async function updatePaiement(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IPaiement>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const paiement = await Paiement.findById(id);

    if (!paiement) {
      return res.status(404).json({ success: false, error: 'Paiement non trouvé' });
    }

    const { statut, recuUrl, recuFilename, commentaire } = req.body;

    // Update receipt if provided (user payeur)
    if (req.user!.role === 'USER_PAYEUR') {
      if (paiement.payeurId !== req.user!.userId) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }
      
      if (recuUrl) paiement.recuUrl = recuUrl;
      if (recuFilename) paiement.recuFilename = recuFilename;
    }

    // Valider / rejeter : comptable uniquement (pas l’admin)
    if (statut) {
      if (req.user!.role !== UserRole.COMPTABLE) {
        return res.status(403).json({
          success: false,
          error: 'Seul un comptable peut valider ou rejeter un paiement',
        });
      }

      if (statut === PaiementStatus.VALIDE) {
        const facture = await Facture.findById(paiement.factureId);
        if (facture) {
          const prevFactureStatut = facture.statut;
          const transit = await Transit.findById(facture.transitId);
          const prevTransitStatut = transit?.statut;

          try {
            facture.statut = FactureStatus.PAYE;
            await facture.save();
            if (transit) {
              transit.statut = TransitStatus.VALIDE;
              await transit.save();
            }

            const payeurUser = await User.findById(paiement.payeurId)
              .select('nom email')
              .lean();
            const payeurNom =
              payeurUser?.nom || payeurUser?.email || 'Payeur';

            await recordPaiementValidatedToCaisse({
              paiementId: String(paiement._id),
              payeurId: String(paiement.payeurId),
              montant: paiement.montant,
              date: new Date(),
              actorUserId: req.user!.userId,
              factureNumero: facture.numero,
              transitId: String(facture.transitId),
              bl: transit?.bl ?? '—',
              payeurNom,
            });

            paiement.validePar = req.user!.userId;
            paiement.dateValidation = new Date();
          } catch (caisseErr) {
            facture.statut = prevFactureStatut;
            await facture.save();
            if (transit && prevTransitStatut !== undefined) {
              transit.statut = prevTransitStatut;
              await transit.save();
            }
            console.error('Caisse paiement validé:', caisseErr);
            return res.status(500).json({
              success: false,
              error:
                'Impossible d’enregistrer les mouvements en caisse (débit payeur / crédit caisse générale). Réessayez ou vérifiez la configuration.',
            });
          }
        } else {
          paiement.validePar = req.user!.userId;
          paiement.dateValidation = new Date();
        }
      } else if (statut === PaiementStatus.REJETE) {
        const facture = await Facture.findById(paiement.factureId);
        if (facture) {
          facture.statut = FactureStatus.EMIS;
          await facture.save();
          const transit = await Transit.findById(facture.transitId);
          if (transit) {
            transit.statut = TransitStatus.FACTURE_EMISE;
            await transit.save();
          }
        }
      }

      paiement.statut = statut;
    }

    if (commentaire !== undefined && req.user!.role === UserRole.COMPTABLE) {
      paiement.commentaire = commentaire;
    }

    await paiement.save();

    return res.status(200).json({
      success: true,
      data: paiement as IPaiement,
      message: 'Paiement mis à jour avec succès',
    });
  } catch (error) {
    console.error('Update paiement error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getPaiement)(req, res);
    case 'PUT':
      return withAuth(updatePaiement)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
