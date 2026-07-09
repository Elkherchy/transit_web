import type mongoose from 'mongoose';
import { Transit, Transaction, Caisse } from '@/models';
import { TransactionType } from '@/types';

export interface DesignationAdjustment {
  designationId: string;
  nom: string;
  target: number;
  netAvant: number;
  delta: number;
  caisseId: string;
}

/**
 * Ré-ajuste la caisse payeur quand le montant d'une désignation DÉJÀ PAYÉE a été
 * modifié après coup (ex. « Bon de livret » corrigé directement en base).
 *
 * Le paiement d'une désignation crée un DÉBIT sur la caisse du payeur
 * (`reference = transit-<tid>-des-<did>`, cf. operations-validation). Si le
 * montant de la désignation change ensuite, ce débit reste figé et le solde du
 * payeur ne suit plus. Pour chaque désignation payée du transit, on compare le
 * net déjà débité (débit initial + ajustements précédents) au montant courant,
 * et on poste une écriture d'ajustement pour combler l'écart, en ajustant le
 * solde de la caisse.
 *
 * - delta > 0 : la désignation a augmenté → DÉBIT complémentaire (le payeur doit
 *   plus), solde −= delta.
 * - delta < 0 : la désignation a baissé → CRÉDIT (remboursement), solde += |delta|.
 *
 * Idempotent : si le net débité correspond déjà au montant, aucune écriture.
 * N'agit QUE sur les désignations ayant un débit initial (donc déjà payées).
 *
 * @returns la liste des ajustements réellement appliqués.
 */
export async function reconcileTransitPaidDesignations(
  transitId: string,
  userId: string
): Promise<DesignationAdjustment[]> {
  const applied: DesignationAdjustment[] = [];
  const transit = await Transit.findById(transitId).lean();
  if (!transit) return applied;
  const tid = String((transit as { _id: unknown })._id);
  const designations =
    (transit as { designations?: Array<Record<string, unknown>> }).designations ||
    [];

  for (const d of designations) {
    const did = String(d._id);
    const ref = `transit-${tid}-des-${did}`;

    // Débit initial du paiement : preuve que la désignation a été réglée.
    const orig = await Transaction.findOne({
      reference: ref,
      type: TransactionType.DEBIT,
      sourcePaiementId: ref,
    })
      .select('_id caisseId')
      .lean();
    if (!orig) continue;

    const caisseId = (orig as { caisseId: mongoose.Types.ObjectId }).caisseId;

    // Net déjà débité pour cette désignation (débit initial + ajustements).
    const group = await Transaction.find({ reference: ref, caisseId })
      .select('type montant')
      .lean();
    let net = 0;
    for (const g of group) {
      const m = Number((g as { montant?: number }).montant) || 0;
      net += (g as { type?: string }).type === TransactionType.DEBIT ? m : -m;
    }

    const target = Number(d.montant) || 0;
    const delta = target - net;
    if (Math.abs(delta) < 0.005) continue;

    await Transaction.create({
      caisseId,
      type: delta > 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
      montant: Math.abs(delta),
      description: `Ajustement désignation "${String(
        d.nom ?? ''
      )}" (montant corrigé) — Transit ${tid}`,
      date: new Date(),
      reference: ref,
      userId,
      sourcePaiementId: `adj:${ref}`,
    });
    await Caisse.findByIdAndUpdate(caisseId, { $inc: { solde: -delta } });

    applied.push({
      designationId: did,
      nom: String(d.nom ?? ''),
      target,
      netAvant: net,
      delta,
      caisseId: String(caisseId),
    });
  }

  return applied;
}
