import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, OperationValidation, Transaction, Transit } from '@/models';
import {
  OperationType,
  OperationValidationStatus,
  type IOperationValidation,
} from '@/models/OperationValidation';
import {
  ApiResponse,
  DesignationStatus,
  TransactionType,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { findOpenJourneeForCaissier } from '@/lib/journee/journeeHelpers';
import { ensurePayeurUserCaisse } from '@/lib/caisse';

interface SubmitItem {
  opType: OperationType;
  opId: string;
  snapshot?: {
    libelle?: string;
    montant?: number;
    contrepartie?: string;
    date?: string | Date;
  };
}

/**
 * GET /api/operations-validation?statut=EN_ATTENTE_AGENT
 * Liste les opérations à valider (admin/agent transit).
 */
async function list(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IOperationValidation[]>>
) {
  try {
    await connectDB();
    const { statut, opType, limit = '200' } = req.query;
    const filter: Record<string, unknown> = {};
    if (
      typeof statut === 'string' &&
      Object.values(OperationValidationStatus).includes(
        statut as OperationValidationStatus
      )
    ) {
      filter.statut = statut;
    } else {
      filter.statut = OperationValidationStatus.EN_ATTENTE_AGENT;
    }
    if (
      typeof opType === 'string' &&
      Object.values(OperationType).includes(opType as OperationType)
    ) {
      filter.opType = opType;
    }
    const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 200));
    const rows = await OperationValidation.find(filter)
      .sort({ submittedAt: -1 })
      .limit(lim)
      .lean();
    return res
      .status(200)
      .json({ success: true, data: rows as unknown as IOperationValidation[] });
  } catch (error) {
    console.error('GET /api/operations-validation:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST /api/operations-validation
 * Body : { items: SubmitItem[] }
 * Caissier soumet une ou plusieurs opérations de sa journée à l'agent transit.
 * Idempotent : ignorer les doublons EN_ATTENTE_AGENT existants.
 */
async function submit(
  req: AuthenticatedRequest,
  res: NextApiResponse<
    ApiResponse<{ created: number; skipped: number; ids: string[] }>
  >
) {
  try {
    await connectDB();
    const { items } = (req.body || {}) as { items?: SubmitItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items requis' });
    }

    // Journée ouverte du caissier — pour rattachement.
    let journeeId: string | null = null;
    if (req.user!.role === UserRole.CAISSIER) {
      const j = await findOpenJourneeForCaissier(req.user!.userId);
      if (j) journeeId = String(j._id);
    }

    const ids: string[] = [];
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;
    for (const it of items) {
      if (
        !it?.opType ||
        !Object.values(OperationType).includes(it.opType) ||
        !it?.opId
      ) {
        skipped += 1;
        continue;
      }
      const dup = await OperationValidation.findOne({
        opType: it.opType,
        opId: it.opId,
        statut: OperationValidationStatus.EN_ATTENTE_AGENT,
      })
        .select('_id')
        .lean();
      if (dup) {
        skipped += 1;
        ids.push(String((dup as { _id: unknown })._id));
        continue;
      }

      // Cas spécial PAYEUR_PAIEMENT : c'est le caissier qui « valide » →
      // c'est ICI qu'on effectue réellement la sortie de la caisse payeur
      // (DEBIT). On vérifie d'abord que le solde du payeur couvre le
      // montant. Si KO, on n'enregistre pas la validation.
      if (it.opType === OperationType.PAYEUR_PAIEMENT) {
        if (!mongoose.isValidObjectId(String(it.opId))) {
          skipped += 1;
          errors.push(`Désignation invalide`);
          continue;
        }
        // Trouve le transit contenant cette désignation.
        const transit = await Transit.findOne({
          'designations._id': new mongoose.Types.ObjectId(String(it.opId)),
        });
        if (!transit) {
          skipped += 1;
          errors.push(`Transit introuvable pour la désignation`);
          continue;
        }
        const desig = transit.designations.id(String(it.opId));
        if (!desig || !desig.payeurId) {
          skipped += 1;
          errors.push(`Désignation ou payeur introuvable`);
          continue;
        }
        if (desig.statutDesignation !== DesignationStatus.PAYEE) {
          skipped += 1;
          errors.push(
            `La désignation « ${desig.nom} » n'est pas en attente de validation`
          );
          continue;
        }
        const montant = Number(desig.montant) || 0;
        if (montant <= 0) {
          skipped += 1;
          errors.push(`Montant invalide pour « ${desig.nom} »`);
          continue;
        }
        const payeurCaisseId = await ensurePayeurUserCaisse(
          String(desig.payeurId)
        );
        const payeurCaisse = await Caisse.findById(payeurCaisseId).lean();
        const solde = Number(payeurCaisse?.solde) || 0;
        if (solde < montant) {
          skipped += 1;
          errors.push(
            `Solde insuffisant sur la caisse de ${
              it.snapshot?.contrepartie || 'ce payeur'
            } (${solde.toFixed(2)} MRU) pour « ${desig.nom} »`
          );
          continue;
        }

        // Idempotence : si la transaction DEBIT existe déjà pour cette
        // désignation, on ne la duplique pas (cas de re-soumission).
        const reference = `transit-${String(transit._id)}-des-${String(
          desig._id
        )}`;
        const existing = await Transaction.findOne({
          sourcePaiementId: reference,
        })
          .select('_id')
          .lean();
        if (!existing) {
          await Transaction.create({
            caisseId: payeurCaisseId,
            type: TransactionType.DEBIT,
            montant,
            description: `Paiement désignation "${desig.nom}" — Transit ${String(
              transit._id
            )}`,
            date: new Date(),
            reference,
            userId: String(desig.payeurId),
            sourcePaiementId: reference,
          });
          await Caisse.findByIdAndUpdate(payeurCaisseId, {
            $inc: { solde: -montant },
          });
        }
      }

      const doc = await OperationValidation.create({
        opType: it.opType,
        opId: String(it.opId),
        snapshot: {
          libelle: it.snapshot?.libelle ?? null,
          montant:
            typeof it.snapshot?.montant === 'number'
              ? it.snapshot.montant
              : null,
          contrepartie: it.snapshot?.contrepartie ?? null,
          date: it.snapshot?.date ? new Date(it.snapshot.date) : null,
        },
        statut: OperationValidationStatus.EN_ATTENTE_AGENT,
        journeeId,
        submittedBy: req.user!.userId,
        submittedAt: new Date(),
      });
      created += 1;
      ids.push(String(doc._id));
    }

    return res.status(201).json({
      success: true,
      data: { created, skipped, ids },
      message:
        errors.length > 0
          ? `${created} validée(s) — ${skipped} ignorée(s) : ${errors.join('; ')}`
          : `${created} opération(s) envoyée(s) à l'agent transit`,
    });
  } catch (error) {
    console.error('POST /api/operations-validation:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return withAuth(list, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(submit, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.CAISSIER,
      ])(req, res);
    default:
      return res
        .status(405)
        .json({ success: false, error: 'Méthode non autorisée' });
  }
}
