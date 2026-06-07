import { FactureManutention, Transit } from '@/models';
import {
  DesignationStatus,
  FactureManutentionStatus,
} from '@/types';

/**
 * Recalcule le statut de la FactureManutention liée à un transit en fonction
 * de l'état actuel des désignations du transit. Idempotent.
 *
 * Règles :
 *   - Toutes désignations VALIDEE_ADMIN              → CLOTURE
 *   - Aucune LIBRE / RESERVEE / REJETEE restante,
 *     et au moins une payée                          → PAYE_EN_ATTENTE_VALIDATION
 *   - Au moins une payée mais d'autres encore libres → PAIEMENT_PARTIEL
 *   - Aucune désignation payée                       → EN_ATTENTE_PAIEMENT
 *
 * Si le transit n'a pas de FactureManutention liée (legacy / dossier libre),
 * la fonction ne fait rien.
 */
export async function syncFactureManutentionStatusFromTransit(
  transitId: string
): Promise<void> {
  const transit = await Transit.findById(transitId)
    .select('factureManutentionId designations')
    .lean();
  if (!transit) return;
  const fmId = (transit as { factureManutentionId?: unknown })
    .factureManutentionId;
  if (!fmId) return;

  const designations = ((transit as {
    designations?: { nom?: string; montant?: number; statutDesignation?: string }[];
  }).designations || []);
  if (designations.length === 0) return;

  let paid = 0;
  let validatedAdmin = 0;
  let openOrReserved = 0;
  let bonLivretTotal = 0;

  for (const d of designations) {
    const s = d.statutDesignation;
    if (s === DesignationStatus.VALIDEE_ADMIN) {
      validatedAdmin += 1;
      paid += 1;
    } else if (
      s === DesignationStatus.PAYEE ||
      s === DesignationStatus.VALIDEE_TRANSIT
    ) {
      paid += 1;
    } else if (
      s === DesignationStatus.LIBRE ||
      s === DesignationStatus.RESERVEE ||
      s === DesignationStatus.REJETEE ||
      !s
    ) {
      openOrReserved += 1;
    }

    // Le `bonLivret` de la facture suit la (ou les) désignation(s) « Bon de livret » :
    // tant que personne n'a payé, le montant reste 0 ; dès qu'un payeur paye, le
    // montant saisi se reflète automatiquement dans la facture.
    if ((d.nom || '').trim().toLowerCase() === 'bon de livret') {
      bonLivretTotal += Number(d.montant) || 0;
    }
  }

  let next: FactureManutentionStatus;
  if (validatedAdmin === designations.length) {
    next = FactureManutentionStatus.CLOTURE;
  } else if (paid > 0 && openOrReserved === 0) {
    next = FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION;
  } else if (paid > 0) {
    next = FactureManutentionStatus.PAIEMENT_PARTIEL;
  } else {
    next = FactureManutentionStatus.EN_ATTENTE_PAIEMENT;
  }

  // Ne JAMAIS écraser EN_ATTENTE_VALIDATION (workflow agent → admin) : tant
  // que l'admin n'a pas validé, le statut reste EN_ATTENTE_VALIDATION même
  // si un transit fictif existe.
  const current = await FactureManutention.findById(String(fmId))
    .select('statut')
    .lean();
  if (
    current &&
    (current as { statut?: FactureManutentionStatus }).statut ===
      FactureManutentionStatus.EN_ATTENTE_VALIDATION
  ) {
    return;
  }

  await FactureManutention.findByIdAndUpdate(String(fmId), {
    statut: next,
    bonLivret: bonLivretTotal,
  });
}
