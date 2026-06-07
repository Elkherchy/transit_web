import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { FactureManutention, ManutentionPaiement, Transit } from '@/models';
import { 
  ApiResponse, 
  IFactureManutention, 
  FactureManutentionStatus, 
  ManutentionPaiementStatus,
  TransitStatus,
} from '@/types';
import { AuthenticatedRequest, withCaissier } from '@/middleware/auth';
import { recordManutentionPaiementValidatedToCaisse } from '@/lib/caisse';
import { buildTransitDesignationsFromManutention } from '@/lib/manutention/transitDesignationsFromManutention';

// POST /api/manutention/valider-paiement - Valider un paiement et créer le transit
// Version sans transactions MongoDB (compatible avec MongoDB standalone)
async function validerPaiement(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ facture: IFactureManutention; transitId: string }>>
) {
  try {
    await connectDB();
    
    const { factureManutentionId } = req.body;
    
    if (!factureManutentionId) {
      return res.status(400).json({
        success: false,
        error: 'ID de la facture manutention requis',
      });
    }
    
    // Récupérer la facture
    const facture = await FactureManutention.findById(factureManutentionId);
    
    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture manutention introuvable',
      });
    }
    
    // Vérifier que la facture est en attente de validation
    if (facture.statut !== FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture n\'est pas en attente de validation',
      });
    }
    
    // Vérifier qu'un payeur est assigné
    if (!facture.payeurId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun payeur assigné à cette facture',
      });
    }
    
    // Récupérer les paiements validés
    const paiements = await ManutentionPaiement.find({
      factureManutentionId: factureManutentionId,
      statut: ManutentionPaiementStatus.EN_VALIDATION,
    });
    
    if (paiements.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucun paiement en attente de validation',
      });
    }
    
    const montantTotalPaye = paiements.reduce((sum, p) => sum + p.montant, 0);
    
    // Vérifier que le montant payé correspond au bon livret
    if (montantTotalPaye < facture.bonLivret) {
      return res.status(400).json({
        success: false,
        error: `Le montant payé (${montantTotalPaye.toFixed(2)} MRU) est inférieur au montant dû (${facture.bonLivret.toFixed(2)} MRU)`,
      });
    }
    
    // 1. Valider les paiements
    await ManutentionPaiement.updateMany(
      { factureManutentionId: factureManutentionId, statut: ManutentionPaiementStatus.EN_VALIDATION },
      { 
        statut: ManutentionPaiementStatus.VALIDE,
        validePar: req.user!.userId,
        dateValidation: new Date(),
      }
    );
    
    // 2. Débiter la caisse liée au caissier pour chaque paiement validé
    for (const paiement of paiements) {
      await recordManutentionPaiementValidatedToCaisse({
        manutentionPaiementId: String(paiement._id),
        montant: paiement.montant,
        date: paiement.datePaiement,
        actorUserId: req.user!.userId,
        factureCreatedByUserId: facture.createdBy,
        factureManutentionBl: facture.bl,
      });
    }

    // 3. Créer le dossier transit
    const designations = buildTransitDesignationsFromManutention(facture.bonLivret);
    
    // Créer le transit
    const transit = await Transit.create({
      client: '—',
      bl: facture.bl,
      objet: '—',
      date: new Date(),
      designations: designations,
      statut: TransitStatus.EN_COURS,
      createdBy: req.user!.userId,
    });
    
    const transitId = transit._id.toString();
    
    // 4. Mettre à jour la facture manutention
    await FactureManutention.findByIdAndUpdate(
      factureManutentionId,
      {
        transitId: transitId,
        statut: FactureManutentionStatus.CLOTURE,
      }
    );
    
    // 5. Copier les documents de la facture vers le transit
    if (facture.documents && facture.documents.length > 0) {
      await Transit.findByIdAndUpdate(
        transitId,
        { $push: { documents: { $each: facture.documents } } }
      );
    }
    
    // Récupérer la facture mise à jour
    const factureUpdated = await FactureManutention.findById(factureManutentionId);
    
    return res.status(200).json({
      success: true,
      data: {
        facture: factureUpdated as IFactureManutention,
        transitId: transitId,
      },
      message: 'Paiement validé et dossier transit créé avec succès',
    });
    
  } catch (error) {
    console.error('Valider paiement error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return withCaissier(validerPaiement)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
