import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, JourneeCaisse, Transaction, Transit } from '@/models';
import {
  ApiResponse,
  IJourneeCaisse,
  JourneeCaisseStatus,
  DesignationStatus,
  TransactionType,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import {
  ensureDefaultGeneralCaisse,
  getSoldeMapForCaisseIds,
} from '@/lib/caisse';
import { findOpenJourneeForCaissier } from '@/lib/journee/journeeHelpers';
import { computeJourneeKpisForDate } from '@/lib/journee/computeJourneeKpis';

/**
 * POST /api/journee/cloturer
 * Le caissier clôture sa journée. Snapshot du solde caisse générale.
 * Met à jour `transitsTraitesIds` à partir des transits ayant au moins une
 * désignation PAYEE/RESERVEE rattachée à cette journée.
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

    const journee = await findOpenJourneeForCaissier(req.user!.userId);
    if (!journee) {
      return res.status(400).json({
        success: false,
        error: 'Aucune journée ouverte à clôturer',
      });
    }

    // Snapshot solde général.
    const general = await ensureDefaultGeneralCaisse();

    // Transfert des montants des factures clients du jour : la somme encaissée
    // pendant la journée sort de la caisse générale et entre dans le compte
    // bancaire choisi à la facturation (BMP, BMI, Espèces, etc.).
    // Idempotent via `sourcePaiementId` = `journee-{id}-facture-{factureId}`.
    if (general && Array.isArray(journee.clientFactures) && journee.clientFactures.length > 0) {
      const transfersByBanque = new Map<string, number>();
      for (const f of journee.clientFactures) {
        if (!f.banqueId || !mongoose.isValidObjectId(String(f.banqueId))) continue;
        const montant = Number(f.montant) || 0;
        if (montant <= 0) continue;

        const sourcePaiementId = `journee-${String(journee._id)}-facture-${String(f.factureId)}`;
        const dup = await Transaction.findOne({ sourcePaiementId });
        if (dup) continue;

        const now = new Date();
        const desc = `Encaissement facture ${f.factureNumero || ''}${
          f.clientNom ? ` — ${f.clientNom}` : ''
        }`.trim();

        // DEBIT caisse générale.
        const debit = await Transaction.create({
          caisseId: general._id,
          type: TransactionType.DEBIT,
          montant,
          description: `${desc} → ${f.banqueNom || 'banque'}`,
          date: now,
          reference: String(f.factureId),
          userId: req.user!.userId,
          sourcePaiementId,
        });

        // CREDIT compte banque/cash choisi.
        try {
          await Transaction.create({
            caisseId: f.banqueId,
            type: TransactionType.CREDIT,
            montant,
            description: desc,
            date: now,
            reference: String(f.factureId),
            userId: req.user!.userId,
            sourcePaiementId: `${sourcePaiementId}-credit`,
            mirrorSourceId: debit._id,
          });
        } catch (e) {
          await Transaction.findByIdAndDelete(debit._id).catch(() => null);
          throw e;
        }

        transfersByBanque.set(
          String(f.banqueId),
          (transfersByBanque.get(String(f.banqueId)) || 0) + montant
        );
      }

      // Mise à jour atomique des soldes (1 update par compte).
      if (transfersByBanque.size > 0) {
        let totalDebit = 0;
        const ops: Promise<unknown>[] = [];
        for (const [banqueId, sum] of transfersByBanque.entries()) {
          ops.push(
            Caisse.findByIdAndUpdate(banqueId, { $inc: { solde: sum } })
          );
          totalDebit += sum;
        }
        ops.push(
          Caisse.findByIdAndUpdate(general._id, { $inc: { solde: -totalDebit } })
        );
        await Promise.all(ops);
      }
    }

    let soldeFin = 0;
    if (general) {
      const soldeMap = await getSoldeMapForCaisseIds([
        general._id as mongoose.Types.ObjectId,
      ]);
      soldeFin = soldeMap.get(String(general._id)) ?? general.solde ?? 0;
    }

    // Collecter les transits ayant des désignations PAYEE/RESERVEE qui n'ont
    // pas encore de journeeId — on les rattache à cette journée.
    const transitsAvecActivite = await Transit.find({
      'designations.statutDesignation': {
        $in: [DesignationStatus.PAYEE, DesignationStatus.RESERVEE],
      },
      $or: [{ journeeId: null }, { journeeId: { $exists: false } }],
    })
      .select('_id')
      .lean();

    const transitIds = transitsAvecActivite.map((t) => String(t._id));
    if (transitIds.length > 0) {
      await Transit.updateMany(
        { _id: { $in: transitIds } },
        { $set: { journeeId: String(journee._id) } }
      );
    }

    // Snapshot KPI : on fige les totaux calculés depuis les transactions au
    // moment de la clôture pour conserver l'historique exact (chaque KPI row
    // que la page affiche est désormais persisté en DB).
    const kpis = await computeJourneeKpisForDate(journee.date);

    const updated = await JourneeCaisse.findByIdAndUpdate(
      journee._id,
      {
        statut: JourneeCaisseStatus.CLOTUREE,
        soldeGeneralFin: soldeFin,
        closedAt: new Date(),
        depotsAdminTotal: kpis.depotsAdminTotal,
        depotsAdminCount: kpis.depotsAdminCount,
        alimentationsTotalReal: kpis.alimentationsTotalReal,
        alimentationsCountReal: kpis.alimentationsCountReal,
        $addToSet: { transitsTraitesIds: { $each: transitIds } },
      },
      { new: true }
    ).lean();

    return res.status(200).json({
      success: true,
      data: updated as unknown as IJourneeCaisse,
      message: 'Journée clôturée — agent transit peut valider',
    });
  } catch (error) {
    console.error('Cloturer journée error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
