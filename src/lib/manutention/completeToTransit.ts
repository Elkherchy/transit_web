import mongoose from 'mongoose';
import { Transit, FactureManutention, User } from '@/models';
import { TransitStatus, FactureManutentionStatus, UserRole, type ILigneEntreprise } from '@/types';
import { buildTransitDesignationsFromManutention } from '@/lib/manutention/transitDesignationsFromManutention';
import { storeTransitDocument } from '@/lib/transitDocumentStorage';

export interface CompleteManutentionToTransitInput {
  factureManutentionId: string;
  actorUserId: string;
}

export interface CompleteManutentionToTransitResult {
  success: boolean;
  transitId?: string;
  error?: string;
}

/**
 * Récupère le premier agent transit actif pour assignation du dossier.
 * Stratégie simple : premier trouvé. Peut être remplacée par round-robin ou équipe.
 */
async function getAgentTransitAssignee(): Promise<string | null> {
  const agent = await User.findOne({
    role: UserRole.AGENT_TRANSIT,
    actif: true,
  }).select('_id').lean();
  return agent ? String(agent._id) : null;
}

/**
 * Convertit une facture manutention en dossier transit une fois
 * les règles métier remplies (paiement complet + validation caissier).
 * 
 * Flux :
 * 1. Crée un dossier Transit avec statut EN_COURS
 * 2. Mappe les données manutention vers le dossier transit
 * 3. Génère le "bon livret" comme document PDF et l'attache au dossier
 * 4. Met à jour la facture manutention avec transitId + statut CLOTURE
 */
export async function completeManutentionToTransit(
  input: CompleteManutentionToTransitInput
): Promise<CompleteManutentionToTransitResult> {
  const session = await mongoose.startSession();
  
  try {
    const result = await session.withTransaction(async () => {
      // Récupérer la facture manutention
      const factureManutention = await FactureManutention.findById(input.factureManutentionId).session(session);
      
      if (!factureManutention) {
        return { success: false, error: 'Facture manutention introuvable' };
      }
      
      if (factureManutention.transitId) {
        return { success: false, error: 'Cette facture manutention a déjà été convertie en transit' };
      }
      
      if (factureManutention.statut !== FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION &&
          factureManutention.statut !== FactureManutentionStatus.CLOTURE) {
        return { success: false, error: 'La facture manutention doit être payée et validée avant conversion' };
      }
      
      // Déterminer l'agent assigné
      const agentAssigneeId = await getAgentTransitAssignee();
      if (!agentAssigneeId) {
        return { success: false, error: 'Aucun agent transit disponible pour assignation' };
      }
      
      const designations = buildTransitDesignationsFromManutention(
        factureManutention.bonLivret
      );
      
      // Créer le dossier transit
      const transit = await Transit.create([{
        client: '—',
        bl: factureManutention.bl,
        objet: '—',
        date: new Date(),
        designations,
        statut: TransitStatus.EN_COURS,
        createdBy: agentAssigneeId,
      }], { session });
      
      const transitId = transit[0]._id as mongoose.Types.ObjectId;
      
      // Générer et stocker le "bon livret" comme document PDF
      // Pour l'instant, on crée un document synthétique simple
      const bonLivretContent = generateBonLivretContent(factureManutention);
      const bonLivretBuffer = Buffer.from(bonLivretContent, 'utf-8');
      
      const storedDoc = await storeTransitDocument(String(transitId), {
        buffer: bonLivretBuffer,
        originalname: `bon-livret-${factureManutention.bl}.txt`,
        mimetype: 'text/plain',
        size: bonLivretBuffer.length,
      });
      
      // Mettre à jour le transit avec le document
      await Transit.findByIdAndUpdate(
        transitId,
        {
          $push: {
            documents: {
              key: storedDoc.key,
              name: storedDoc.name,
              size: storedDoc.size,
              uploadedAt: new Date(),
            },
          },
        },
        { session }
      );
      
      // Mettre à jour la facture manutention
      await FactureManutention.findByIdAndUpdate(
        factureManutention._id,
        {
          transitId: String(transitId),
          statut: FactureManutentionStatus.CLOTURE,
        },
        { session }
      );
      
      return { success: true, transitId: String(transitId) };
    });
    
    return result;
  } catch (error) {
    console.error('completeManutentionToTransit error:', error);
    return { success: false, error: 'Erreur lors de la conversion en transit' };
  } finally {
    await session.endSession();
  }
}

/**
 * Génère le contenu du bon livret (version simple texte).
 * À remplacer par génération PDF quand la spec est finalisée.
 */
function generateBonLivretContent(factureManutention: { bl: string; lignesEntreprise: { nomEntreprise: string; bl: string; montant: number }[]; bonLivret: number }): string {
  const lignes = factureManutention.lignesEntreprise.map(l => 
    `- ${l.nomEntreprise}: ${l.montant.toFixed(2)} MRU (BL: ${l.bl})`
  ).join('\n');
  
  return `BON LIVRET — MANUTENTION
============================
BL Principal: ${factureManutention.bl}
Date: ${new Date().toLocaleDateString('fr-FR')}

Lignes entreprise:
${lignes}

Total: ${factureManutention.bonLivret.toFixed(2)} MRU

Document généré automatiquement depuis la facture manutention.
`;
}
