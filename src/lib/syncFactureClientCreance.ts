import type mongoose from 'mongoose';
import { Caisse, Facture, Transaction } from '@/models';
import { TransactionType } from '@/types';

/**
 * Extrait l'_id de facture porté par le `sourcePaiementId` d'une transaction de
 * créance, ou `null` si la transaction n'est pas une créance de facture client.
 *
 * Selon le chemin d'émission, la créance porte `sourcePaiementId` = `<factureId>`
 * (create-facture-client / finalizeTransit) ou `facture-<factureId>`
 * (transit/factures / journee valider-admin). Les débits de paiement client
 * utilisent `client-payment-<id>` et ne sont donc pas confondus.
 */
export function creanceFactureIdFromSource(
  sourcePaiementId: unknown
): string | null {
  const src = String(sourcePaiementId ?? '');
  if (/^[a-f0-9]{24}$/i.test(src)) return src;
  if (src.startsWith('facture-')) {
    const id = src.slice('facture-'.length);
    return /^[a-f0-9]{24}$/i.test(id) ? id : null;
  }
  return null;
}

/**
 * Resynchronise la transaction de créance (DÉBIT de la caisse client) d'une
 * facture client avec son `totalFinal` courant.
 *
 * Quand l'admin ajoute des désignations ou modifie l'intérêt, `facture.totalFinal`
 * change, mais la transaction de créance créée à l'émission garde son montant
 * d'origine. Le mouvement de caisse et le solde affichés deviennent alors
 * incohérents avec la facture. Cette fonction remet le montant de la créance à
 * jour et ajuste le solde de la caisse client du delta correspondant.
 *
 * Idempotent : si le montant est déjà à jour (ou s'il n'existe pas de créance),
 * aucune écriture n'est effectuée.
 *
 * @returns le delta appliqué (nouveau montant − ancien montant), 0 si rien à faire.
 */
export async function syncFactureClientCreance(
  factureId: string,
  totalFinal?: number
): Promise<number> {
  const fid = String(factureId);

  // La créance est identifiée par `sourcePaiementId` (jamais par `reference`
  // seul : les débits de paiement client portent aussi `reference = factureId`).
  const tx = await Transaction.findOne({
    type: TransactionType.DEBIT,
    sourcePaiementId: { $in: [fid, `facture-${fid}`] },
  });
  if (!tx) return 0;

  let target = totalFinal;
  if (target === undefined) {
    const facture = await Facture.findById(fid).select('totalFinal').lean();
    if (!facture) return 0;
    target = Number((facture as { totalFinal?: number }).totalFinal) || 0;
  }
  target = Math.max(0, Number(target) || 0);

  const current = Number(tx.montant) || 0;
  const delta = target - current;
  if (delta === 0) return 0;

  tx.montant = target;
  await tx.save();

  // Le débit réduit le solde : passer de `current` à `target` ajuste de `-delta`.
  await Caisse.findByIdAndUpdate(tx.caisseId, { $inc: { solde: -delta } });

  return delta;
}

/**
 * Auto-répare toutes les créances (DÉBITS caisse client) portées par les caisses
 * données : remet chaque montant au `totalFinal` courant de sa facture et ajuste
 * le solde des caisses concernées. Idempotent.
 *
 * @returns true si au moins une transaction a été corrigée.
 */
export async function reconcileClientCreances(
  caisseIds: mongoose.Types.ObjectId[]
): Promise<boolean> {
  if (!caisseIds || caisseIds.length === 0) return false;

  const debits = await Transaction.find({
    caisseId: caisseIds.length === 1 ? caisseIds[0] : { $in: caisseIds },
    type: TransactionType.DEBIT,
  })
    .select('_id montant sourcePaiementId caisseId')
    .lean();

  const creances = debits
    .map((tx) => ({
      tx,
      factureId: creanceFactureIdFromSource(
        (tx as { sourcePaiementId?: unknown }).sourcePaiementId
      ),
    }))
    .filter((c): c is { tx: (typeof debits)[number]; factureId: string } =>
      Boolean(c.factureId)
    );
  if (creances.length === 0) return false;

  const factureIds = [...new Set(creances.map((c) => c.factureId))];
  const factures = await Facture.find({ _id: { $in: factureIds } })
    .select('_id totalFinal')
    .lean();
  const totalMap = new Map(
    factures.map((f) => [String(f._id), Number(f.totalFinal) || 0])
  );

  let changed = false;
  for (const { tx, factureId } of creances) {
    const target = totalMap.get(factureId);
    if (target === undefined) continue; // sourcePaiementId non lié à une facture
    const current = Number((tx as { montant?: number }).montant) || 0;
    const delta = target - current;
    if (delta === 0) continue;
    await Transaction.updateOne(
      { _id: (tx as { _id: unknown })._id },
      { $set: { montant: target } }
    );
    await Caisse.updateOne(
      { _id: (tx as { caisseId: unknown }).caisseId },
      { $inc: { solde: -delta } }
    );
    changed = true;
  }
  return changed;
}
