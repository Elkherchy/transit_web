import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Facture, OperationValidation, Transaction, Transit } from '@/models';
import {
  OperationType,
  OperationValidationStatus,
} from '@/models/OperationValidation';
import { ApiResponse, FactureStatus, TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import {
  finalizeTransitIfAllValidated,
  markDesignationValideeAdmin,
} from '@/lib/transit/finalizeTransit';
import { finalizeJourneeIfAllValidated } from '@/lib/journee/finalizeJournee';
import { ensureClientCaisse } from '@/lib/caisse';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ id: string }>>
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    const op = await OperationValidation.findById(id);
    if (!op) {
      return res
        .status(404)
        .json({ success: false, error: 'Opération introuvable' });
    }

    // Workflow 2 étapes :
    //   EN_ATTENTE_AGENT  → (AGENT_TRANSIT valide)  → EN_ATTENTE_ADMIN
    //   EN_ATTENTE_ADMIN  → (ADMIN_TRANSIT valide)  → VALIDEE_ADMIN
    // ADMIN peut aussi valider directement depuis EN_ATTENTE_AGENT
    // (raccourci de validation finale).
    const role = req.user!.role;
    let next: OperationValidationStatus | null = null;
    let msg = 'Opération validée';
    if (op.statut === OperationValidationStatus.EN_ATTENTE_AGENT) {
      if (role === UserRole.AGENT_TRANSIT) {
        next = OperationValidationStatus.EN_ATTENTE_ADMIN;
        msg = 'Opération validée — en attente de validation admin transit';
      } else if (
        role === UserRole.ADMIN ||
        role === UserRole.ADMIN_TRANSIT
      ) {
        next = OperationValidationStatus.VALIDEE_ADMIN;
        msg = 'Opération validée (validation directe par admin)';
      }
    } else if (op.statut === OperationValidationStatus.EN_ATTENTE_ADMIN) {
      if (role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT) {
        next = OperationValidationStatus.VALIDEE_ADMIN;
        msg = 'Opération validée';
      } else if (role === UserRole.AGENT_TRANSIT) {
        return res.status(400).json({
          success: false,
          error: "Cette opération attend la validation de l'admin transit",
        });
      }
    }

    if (!next) {
      return res.status(400).json({
        success: false,
        error: "Cette opération n'est pas en attente de validation par votre rôle",
      });
    }

    const wasPendingAgent =
      op.statut === OperationValidationStatus.EN_ATTENTE_AGENT;
    op.statut = next;
    op.validatedBy = req.user!.userId;
    op.validatedAt = new Date();
    await op.save();

    // Validation agent transit d'un dépôt client créé par le caissier : à ce
    // moment SEULEMENT, on impacte les deux caisses —
    //   1) CREDIT de la banque cible (le montant « entre en caisse »)
    //   2) CREDIT de la caisse client (recette virtuelle du client)
    // Aucun mouvement caisse n'a eu lieu à la création. Idempotent via
    // sourcePaiementId distincts. On marque la facture PAYE.
    if (wasPendingAgent && op.opType === OperationType.CLIENT_FACTURE) {
      try {
        const facture = await Facture.findById(String(op.opId));
        const montant =
          Number(facture?.totalFinal ?? facture?.totalOperations) || 0;
        const clientId = facture?.clientId ? String(facture.clientId) : '';
        const banqueId = facture?.banqueId ? String(facture.banqueId) : '';

        if (facture && montant > 0) {
          // 1) CREDIT banque — le vrai encaissement.
          if (banqueId) {
            const bankSrc = `facture-${String(facture._id)}`;
            const dupBank = await Transaction.findOne({ sourcePaiementId: bankSrc });
            if (!dupBank) {
              await Transaction.create({
                caisseId: new mongoose.Types.ObjectId(banqueId),
                type: TransactionType.CREDIT,
                montant,
                description: `Dépôt client — Facture ${facture.numero} (validé agent transit)`,
                date: new Date(),
                reference: facture.numero,
                userId: req.user!.userId,
                sourcePaiementId: bankSrc,
              });
              await Caisse.findByIdAndUpdate(banqueId, {
                $inc: { solde: montant },
              });
            }
          }

          // 2) CREDIT caisse client — recette virtuelle.
          if (clientId) {
            const clientSrc = `facture-client-caisse-${String(facture._id)}`;
            const dupClient = await Transaction.findOne({
              sourcePaiementId: clientSrc,
            });
            if (!dupClient) {
              const clientCaisseId = await ensureClientCaisse(clientId);
              await Transaction.create({
                caisseId: clientCaisseId,
                type: TransactionType.CREDIT,
                montant,
                description: `Facture ${facture.numero} — dépôt client validé par agent transit`,
                date: new Date(),
                reference: facture.numero,
                userId: req.user!.userId,
                sourcePaiementId: clientSrc,
              });
              await Caisse.findByIdAndUpdate(clientCaisseId, {
                $inc: { solde: montant },
              });
            }
          }

          if (facture.statut !== FactureStatus.PAYE) {
            facture.statut = FactureStatus.PAYE;
            facture.montantPaye = montant;
            facture.dateEmission = facture.dateEmission || new Date();
            await facture.save();
          }
        }
      } catch (clientCaisseErr) {
        console.error(
          'CLIENT_FACTURE → CREDIT banque + caisse client après validation agent:',
          clientCaisseErr
        );
      }
    }

    // Si validation finale admin sur un paiement payeur : marquer la
    // désignation comme VALIDEE_ADMIN et tenter de clôturer le transit
    // si toutes ses désignations sont validées.
    if (
      next === OperationValidationStatus.VALIDEE_ADMIN &&
      op.opType === OperationType.PAYEUR_PAIEMENT
    ) {
      try {
        const transit = await Transit.findOne({
          'designations._id': new mongoose.Types.ObjectId(op.opId),
        })
          .select('_id journeeId')
          .lean();
        if (transit) {
          const transitId = String(
            (transit as { _id: unknown })._id
          );
          await markDesignationValideeAdmin(
            transitId,
            String(op.opId),
            req.user!.userId
          );
          await finalizeTransitIfAllValidated(transitId, req.user!.userId);

          // Si tous les transits de la journée liée sont validés, on valide
          // automatiquement la journée (VALIDEE_ADMIN).
          const journeeId = (transit as { journeeId?: unknown }).journeeId;
          if (journeeId) {
            await finalizeJourneeIfAllValidated(
              String(journeeId),
              req.user!.userId
            );
          }
        }
      } catch (e) {
        console.error('finalize transit after admin validation:', e);
      }
    }

    return res
      .status(200)
      .json({
        success: true,
        data: { id: String(op._id) },
        message: msg,
      });
  } catch (error) {
    console.error('POST /api/operations-validation/[id]/valider:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
]);
