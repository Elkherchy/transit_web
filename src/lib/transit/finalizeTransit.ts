import mongoose from 'mongoose';
import { FactureManutention, Transit } from '@/models';
import {
  DesignationStatus,
  FactureManutentionStatus,
  TransitStatus,
} from '@/types';

/**
 * Marque une désignation comme VALIDEE_ADMIN. Idempotent.
 * Renvoie true si une mise à jour effective a été appliquée.
 */
export async function markDesignationValideeAdmin(
  transitId: string,
  designationId: string,
  userId: string
): Promise<boolean> {
  if (
    !mongoose.isValidObjectId(transitId) ||
    !mongoose.isValidObjectId(designationId)
  ) {
    return false;
  }
  const t = await Transit.findById(transitId);
  if (!t) return false;
  const d = t.designations.id(designationId);
  if (!d) return false;
  if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) return false;
  d.statutDesignation = DesignationStatus.VALIDEE_ADMIN;
  d.valideAdminBy = new mongoose.Types.ObjectId(userId);
  d.valideAdminAt = new Date();
  await t.save();
  return true;
}

/**
 * Si TOUTES les désignations actives d'un transit sont VALIDEE_ADMIN
 * (REJETEE ignorées) :
 *   - bascule transit.statut → VALIDE
 *   - clôture la FactureManutention liée (statut → CLOTURE)
 *
 * NE CRÉE PAS la facture client — celle-ci doit être créée manuellement
 * par l'admin depuis /dashboard/admin/manutention/[id] (bouton dédié).
 *
 * Idempotent.
 */
export async function finalizeTransitIfAllValidated(
  transitId: string,
  userId: string
): Promise<{ allValidated: boolean }> {
  if (!mongoose.isValidObjectId(transitId)) return { allValidated: false };
  const t = await Transit.findById(transitId);
  if (!t) return { allValidated: false };

  const designations = t.designations || [];
  if (designations.length === 0) return { allValidated: false };

  let hasUnfinalised = false;
  let validCount = 0;
  for (const d of designations) {
    if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) {
      validCount += 1;
    } else if (d.statutDesignation === DesignationStatus.REJETEE) {
      // ignore
    } else {
      hasUnfinalised = true;
      break;
    }
  }
  if (hasUnfinalised || validCount === 0) return { allValidated: false };

  if (t.statut !== TransitStatus.VALIDE) {
    t.statut = TransitStatus.VALIDE;
    t.valideAdminBy = String(userId);
    t.valideAdminAt = new Date();
    await t.save();
  }

  if (t.factureManutentionId) {
    try {
      await FactureManutention.findByIdAndUpdate(t.factureManutentionId, {
        statut: FactureManutentionStatus.CLOTURE,
      });
    } catch (e) {
      console.error('Clôture FactureManutention (finalizeTransit):', e);
    }
  }
  return { allValidated: true };
}
