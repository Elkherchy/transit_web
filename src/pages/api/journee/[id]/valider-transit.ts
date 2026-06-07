import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import {
  JourneeCaisse,
  Transit,
  Facture,
  Paiement,
  Caisse,
  Transaction,
} from '@/models';
import {
  ApiResponse,
  IClientPaiementJournee,
  IJourneeCaisse,
  JourneeCaisseStatus,
  DesignationStatus,
  TransitStatus,
  UserRole,
  JourneeClientPaiementStatus,
  PaiementStatus,
  FactureStatus,
  TransactionType,
  CompteType,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse, ensureDefaultGeneralCaisse } from '@/lib/caisse';

/**
 * POST /api/journee/[id]/valider-transit
 * Agent transit confirme la validation globale d'une journée CLOTUREE :
 * vérifie que toutes les désignations PAYEE de la journée ont été soit
 * VALIDEE_TRANSIT soit REJETEE (LIBRE), puis passe la journée en VALIDEE_TRANSIT.
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
    if (journee.statut !== JourneeCaisseStatus.CLOTUREE) {
      return res.status(400).json({
        success: false,
        error: 'La journée doit être CLOTUREE pour être validée par l’agent transit',
      });
    }

    const transitIds = journee.transitsTraitesIds || [];
    const transits = await Transit.find({ _id: { $in: transitIds } });
    for (const t of transits) {
      const reste = t.designations.find(
        (d: { statutDesignation?: string }) => d.statutDesignation === DesignationStatus.PAYEE
      );
      if (reste) {
        return res.status(400).json({
          success: false,
          error: `Transit ${String(t._id)} : il reste des désignations PAYEE non validées/rejetées`,
        });
      }
      // Si toutes les désignations sont VALIDEE_TRANSIT (ou LIBRE/REJETEE), on
      // peut faire avancer le statut du transit.
      const allValideOrIgnored = t.designations.every(
        (d: { statutDesignation?: string; montant: number }) =>
          d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT ||
          d.statutDesignation === DesignationStatus.VALIDEE_ADMIN ||
          d.statutDesignation === DesignationStatus.LIBRE ||
          d.statutDesignation === DesignationStatus.REJETEE
      );
      const hasValidee = t.designations.some(
        (d: { statutDesignation?: string }) =>
          d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT
      );
      if (allValideOrIgnored && hasValidee) {
        t.statut = TransitStatus.VALIDE_TRANSIT;
        t.valideTransitBy = new mongoose.Types.ObjectId(req.user!.userId) as unknown as string;
        t.valideTransitAt = new Date();
        await t.save();

        // Créer automatiquement une facture client pour ce transit
        if (!t.clientId || !t.dossierNumber) {
          continue; // Pas de client, skip
        }

        const existingFacture = await Facture.findOne({
          transitId: t._id,
          clientId: t.clientId,
          bl: '', // Créées sans BL
        }).lean();

        if (!existingFacture) {
          // Calculer le montant total validé pour ce transit
          const totalValidated = t.designations
            .filter(
              (d: { statutDesignation?: string; montant: number }) =>
                d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT ||
                d.statutDesignation === DesignationStatus.VALIDEE_ADMIN
            )
            .reduce((sum: number, d: { montant: number }) => sum + (d.montant || 0), 0);

          if (totalValidated > 0) {
            try {
              await Facture.create({
                clientId: t.clientId,
                transitClient: t.libelleClient || 'Inconnu',
                bl: '', // Pas obligatoire
                objet: `Facture automatique — Transit ${t.dossierNumber}`,
                statut: FactureStatus.EMIS,
                designations: [],
                montantInteretTotal: 0,
                totalFinal: totalValidated,
                montantPaye: 0,
                transitId: t._id,
                createdBy: req.user!.userId,
                createdAt: new Date(),
              });
            } catch (factErr) {
              console.warn(`Erreur création facture auto pour transit ${String(t._id)}:`, factErr);
            }
          }
        }
      }
    }

    const pendingClientPaiements: IClientPaiementJournee[] = (
      journee.clientPaiements || []
    ).filter(
      (p: IClientPaiementJournee) =>
        p.statut === JourneeClientPaiementStatus.EN_VALIDATION
    );

    if (pendingClientPaiements.length > 0) {
      const general = await ensureDefaultGeneralCaisse();
      if (!general?._id) {
        return res.status(500).json({
          success: false,
          error: 'Caisse générale introuvable',
        });
      }

      for (const p of pendingClientPaiements) {
        const paiement = await Paiement.findById(p.paiementId);
        if (!paiement) {
          return res.status(400).json({
            success: false,
            error: `Paiement introuvable (${p.paiementId})`,
          });
        }
        if (paiement.statut !== PaiementStatus.EN_VALIDATION) {
          const alreadyValidated = (journee.clientPaiements || []).find(
            (row: IClientPaiementJournee) => row.paiementId === p.paiementId
          );
          if (alreadyValidated && paiement.statut === PaiementStatus.VALIDE) {
            alreadyValidated.statut = JourneeClientPaiementStatus.VALIDE_TRANSIT;
            alreadyValidated.valideTransitBy =
              paiement.validePar || req.user!.userId;
            alreadyValidated.valideTransitAt =
              paiement.dateValidation || new Date();
          }
          continue;
        }

        const facture = await Facture.findById(p.factureId);
        if (!facture) {
          return res.status(400).json({
            success: false,
            error: `Facture introuvable (${p.factureId})`,
          });
        }

        const banque = await Caisse.findById(p.banqueId);
        if (!banque || !banque.actif || banque.type !== CompteType.BANQUE) {
          return res.status(400).json({
            success: false,
            error: `Compte banque invalide pour paiement ${p.paiementId}`,
          });
        }

        const clientId = p.clientId || (facture.clientId ? String(facture.clientId) : '');
        if (!clientId) {
          return res.status(400).json({
            success: false,
            error: `Client manquant pour facture ${String(facture._id)}`,
          });
        }

        const clientCaisseId = await ensureClientCaisse(clientId, p.clientNom || undefined);
        const sourcePaiementId = `client-payment-${p.paiementId}`;
        const dup = await Transaction.findOne({ sourcePaiementId }).lean();

        if (!dup) {
          const txDate = p.date ? new Date(p.date) : new Date();
          const description = `Paiement client ${facture.numero}${p.reference ? ` — ${p.reference}` : ''}`;

          const debitClient = await Transaction.create({
            caisseId: clientCaisseId,
            type: TransactionType.DEBIT,
            montant: p.montant,
            description,
            date: txDate,
            reference: String(facture._id),
            userId: req.user!.userId,
            sourcePaiementId,
          });

          await Transaction.create({
            caisseId: banque._id,
            type: TransactionType.CREDIT,
            montant: p.montant,
            description,
            date: txDate,
            reference: String(facture._id),
            userId: req.user!.userId,
            mirrorSourceId: debitClient._id,
            sourcePaiementId,
          });

          await Transaction.create({
            caisseId: general._id,
            type: TransactionType.CREDIT,
            montant: p.montant,
            description: `[Client] ${description}`,
            date: txDate,
            reference: String(facture._id),
            userId: req.user!.userId,
            mirrorSourceId: debitClient._id,
            sourcePaiementId,
          });

          await Promise.all([
            Caisse.findByIdAndUpdate(clientCaisseId, { $inc: { solde: -p.montant } }),
            Caisse.findByIdAndUpdate(banque._id, { $inc: { solde: p.montant } }),
            Caisse.findByIdAndUpdate(general._id, { $inc: { solde: p.montant } }),
          ]);
        }

        const nouveauMontantPaye = Number(facture.montantPaye || 0) + Number(p.montant || 0);
        facture.montantPaye = nouveauMontantPaye;
        facture.statut =
          nouveauMontantPaye >= Number(facture.totalFinal || 0)
            ? FactureStatus.PAYE
            : FactureStatus.EN_PAYE;
        await facture.save();

        if (
          facture.statut === FactureStatus.PAYE &&
          facture.transitId &&
          mongoose.isValidObjectId(String(facture.transitId))
        ) {
          await Transit.findByIdAndUpdate(facture.transitId, {
            statut: TransitStatus.CLOTURE,
          });
        }

        paiement.statut = PaiementStatus.VALIDE;
        paiement.validePar = req.user!.userId;
        paiement.dateValidation = new Date();
        if (!paiement.commentaire?.includes('Validation transit')) {
          paiement.commentaire = `${paiement.commentaire || ''} Validation transit journée ${String(journee._id)}`.trim();
        }
        await paiement.save();

        const target = (journee.clientPaiements || []).find(
          (row: IClientPaiementJournee) => row.paiementId === p.paiementId
        );
        if (target) {
          target.statut = JourneeClientPaiementStatus.VALIDE_TRANSIT;
          target.valideTransitBy = req.user!.userId;
          target.valideTransitAt = new Date();
        }
      }
    }

    // Factures client créées en caisse durant la journée:
    // à la validation transit, elles sont considérées validées et soldées.
    const journeeClientFactures = journee.clientFactures || [];
    for (const f of journeeClientFactures) {
      const facture = await Facture.findById(f.factureId);
      if (!facture) continue;

      if (facture.statut !== FactureStatus.PAYE) {
        const totalFinal = Number(facture.totalFinal || 0);
        facture.montantPaye = totalFinal;
        facture.statut = FactureStatus.PAYE;
        await facture.save();
      }

      if (
        facture.transitId &&
        mongoose.isValidObjectId(String(facture.transitId))
      ) {
        await Transit.findByIdAndUpdate(facture.transitId, {
          statut: TransitStatus.CLOTURE,
        });
      }
    }

    journee.statut = JourneeCaisseStatus.VALIDEE_TRANSIT;
    journee.valideTransitBy = req.user!.userId;
    journee.valideTransitAt = new Date();
    await journee.save();

    return res.status(200).json({
      success: true,
      data: journee.toObject() as unknown as IJourneeCaisse,
      message: 'Journée validée par l’agent transit — en attente admin',
    });
  } catch (error) {
    console.error('valider-transit journee error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
]);
