import mongoose from 'mongoose';
import { Caisse, Transaction } from '@/models';
import { TransactionType, CaisseKind } from '@/types';

export interface JourneeKpis {
  depotsAdminTotal: number;
  depotsAdminCount: number;
  alimentationsTotalReal: number;
  alimentationsCountReal: number;
}

/**
 * Calcule les KPI d'une journée à partir des transactions persistées sur la
 * caisse générale (source de vérité). Utilisé :
 *   - en lecture live pour `/api/journee/current` (journée OUVERTE)
 *   - figé à la clôture (`/api/journee/cloturer`) pour conserver l'historique
 *
 * Règles :
 *   - Dépôts admin = CREDIT direct (sans `mirrorSourceId`) sur caisse générale
 *   - Alimentations payeurs = DEBIT sur caisse générale
 */
export async function computeJourneeKpisForDate(
  date: Date | string
): Promise<JourneeKpis> {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const general = await Caisse.findOne({
    kind: CaisseKind.GENERAL,
    isDefaultGeneral: true,
    actif: true,
  })
    .select('_id')
    .lean();

  if (!general) {
    return {
      depotsAdminTotal: 0,
      depotsAdminCount: 0,
      alimentationsTotalReal: 0,
      alimentationsCountReal: 0,
    };
  }

  const generalId = general._id as mongoose.Types.ObjectId;
  const txs = await Transaction.find({
    caisseId: generalId,
    date: { $gte: dayStart, $lte: dayEnd },
  })
    .select('type montant mirrorSourceId sourcePaiementId')
    .lean();

  let depotsAdminTotal = 0;
  let depotsAdminCount = 0;
  let alimentationsTotalReal = 0;
  let alimentationsCountReal = 0;

  for (const t of txs) {
    // Les factures clients (sourcePaiementId préfixé `facture-`) sont déjà
    // comptabilisées dans `journee.clientFactures` côté Journée → on les
    // exclut du compteur "Dépôts admin" pour éviter le double-comptage.
    const isFactureClient =
      typeof t.sourcePaiementId === 'string' &&
      t.sourcePaiementId.startsWith('facture-');

    if (t.type === TransactionType.CREDIT) {
      if (!t.mirrorSourceId && !isFactureClient) {
        depotsAdminTotal += Number(t.montant) || 0;
        depotsAdminCount += 1;
      }
    } else if (t.type === TransactionType.DEBIT) {
      alimentationsTotalReal += Number(t.montant) || 0;
      alimentationsCountReal += 1;
    }
  }

  return {
    depotsAdminTotal,
    depotsAdminCount,
    alimentationsTotalReal,
    alimentationsCountReal,
  };
}
