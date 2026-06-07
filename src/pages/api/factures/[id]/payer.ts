import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Facture, Caisse, Paiement, JourneeCaisse, Client } from '@/models';
import {
  ApiResponse,
  IFacture,
  FactureStatus,
  UserRole,
  CompteType,
  PaiementStatus,
  JourneeCaisseStatus,
  JourneeClientPaiementStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';

// POST /api/factures/[id]/payer - Payer une facture client
async function payerFacture(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IFacture>>) {
  try {
    await connectDB();
    
    const { id } = req.query;
    const { banqueId, montant, reference } = req.body;

    if (
      req.user?.role !== UserRole.CAISSIER &&
      req.user?.role !== UserRole.ADMIN &&
      req.user?.role !== UserRole.ADMIN_TRANSIT
    ) {
      return res.status(403).json({
        success: false,
        error: 'Seul un caissier peut saisir un paiement client',
      });
    }
    
    if (!banqueId || !montant || montant <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Le compte bancaire et le montant sont requis',
      });
    }
    
    // Récupérer la facture
    const facture = await Facture.findById(id);
    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture introuvable',
      });
    }
    
    // Vérifier que la facture n'est pas déjà payée
    if (facture.statut === FactureStatus.PAYE) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture est déjà payée',
      });
    }

    if (!facture.clientId) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture n’a pas de client rattaché',
      });
    }

    const clientDoc = await Client.findById(String(facture.clientId))
      .select('nom')
      .lean();

    // Récupérer le compte : uniquement banque active (comptes créés côté admin)
    const compte = await Caisse.findById(banqueId);
    if (!compte || !compte.actif || compte.type !== CompteType.BANQUE) {
      return res.status(404).json({
        success: false,
        error: 'Compte bancaire introuvable, inactif ou type invalide',
      });
    }
    
    // Calculer le montant restant à payer
    const montantDejaPaye = facture.montantPaye || 0;
    const montantRestant = facture.totalFinal - montantDejaPaye;
    
    if (montant > montantRestant) {
      return res.status(400).json({
        success: false,
        error: `Le montant ne peut pas dépasser le reste dû (${montantRestant.toFixed(2)} MRU)`,
      });
    }
    
    const journee = await getOrCreateOpenJournee(req.user!.userId);
    if (journee.statut !== JourneeCaisseStatus.OUVERTE) {
      return res.status(400).json({
        success: false,
        error: 'Votre journée est déjà clôturée. Saisie de paiement impossible.',
      });
    }

    const pending = await Paiement.findOne({
      factureId: String(facture._id),
      statut: { $in: [PaiementStatus.EN_ATTENTE, PaiementStatus.EN_VALIDATION] },
    })
      .select('_id')
      .lean();
    if (pending) {
      return res.status(400).json({
        success: false,
        error: 'Un paiement est déjà en attente de validation pour cette facture',
      });
    }

    const paiement = await Paiement.create({
      factureId: String(facture._id),
      montant,
      datePaiement: new Date(),
      statut: PaiementStatus.EN_VALIDATION,
      payeurId: req.user!.userId,
      commentaire:
        reference ||
        `Paiement caisse saisi (attente validation transit) — ${facture.numero}`,
    });

    facture.statut = FactureStatus.EN_VALIDATION;
    await facture.save();

    const update: {
      $push: {
        clientPaiements: {
          paiementId: string;
          factureId: string;
          transitId?: string;
          clientId?: string;
          clientNom?: string;
          factureNumero: string;
          banqueId: string;
          banqueNom: string;
          montant: number;
          date: Date;
          reference?: string;
          statut: JourneeClientPaiementStatus;
        };
      };
      $addToSet?: { transitsTraitesIds: string };
    } = {
      $push: {
        clientPaiements: {
          paiementId: String(paiement._id),
          factureId: String(facture._id),
          transitId: facture.transitId ? String(facture.transitId) : undefined,
          clientId: facture.clientId ? String(facture.clientId) : undefined,
          clientNom: clientDoc?.nom || undefined,
          factureNumero: facture.numero,
          banqueId: String(compte._id),
          banqueNom: compte.nom,
          montant,
          date: new Date(),
          reference: reference || undefined,
          statut: JourneeClientPaiementStatus.EN_VALIDATION,
        },
      },
    };

    if (facture.transitId) {
      update.$addToSet = { transitsTraitesIds: String(facture.transitId) };
    }

    await JourneeCaisse.findByIdAndUpdate(journee._id, update);
    
    return res.status(200).json({
      success: true,
      data: facture as IFacture,
      message: `Paiement de ${montant.toFixed(2)} MRU saisi (en validation transit)`,
    });
    
  } catch (error) {
    console.error('Payer facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return withAuth(payerFacture, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.CAISSIER,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
