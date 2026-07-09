import { DesignationStatus, IDesignation, isDesignationAdminOnly } from '@/types';

/**
 * Force le statut `VALIDEE_ADMIN` sur toute désignation admin-only (voir
 * `DESIGNATIONS_ADMIN_ONLY`) qui n'est pas déjà validée.
 *
 * Justification métier : les désignations admin-only sont invisibles aux
 * USER_PAYEUR et ne suivent donc pas le circuit paiement → validation transit
 * → validation admin. Dès que l'admin les ajoute sur un BL, elles sont
 * considérées validées par l'admin (le dossier n'attend rien d'un payeur pour
 * elles). On renseigne `valideAdminBy` / `valideAdminAt` pour la traçabilité.
 *
 * Le tableau est muté en place ET renvoyé. Idempotent : une désignation déjà
 * `VALIDEE_ADMIN` est laissée intacte.
 *
 * @param designations  Lignes de désignation (objets bruts ou sous-docs Mongoose).
 * @param adminUserId   ID de l'utilisateur qui enregistre (traçabilité).
 * @param now           Horodatage de validation (injectable pour les tests).
 */
export function autoValidateAdminOnlyDesignations<
  T extends Pick<IDesignation, 'nom' | 'statutDesignation' | 'valideAdminBy' | 'valideAdminAt'>
>(designations: T[] | undefined | null, adminUserId: string, now: Date = new Date()): T[] {
  if (!Array.isArray(designations)) return designations ?? [];

  for (const d of designations) {
    if (!d || !isDesignationAdminOnly(d.nom)) continue;
    if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) continue;

    d.statutDesignation = DesignationStatus.VALIDEE_ADMIN;
    if (adminUserId) {
      d.valideAdminBy = adminUserId;
    }
    d.valideAdminAt = now;
  }

  return designations;
}

/**
 * Valide d'office (`VALIDEE_ADMIN`) toute désignation encore en attente sur un
 * BL DÉJÀ FINALISÉ (VALIDE / CLOTURE). À utiliser quand un ADMIN ajoute des
 * lignes sur un dossier déjà validé : le dossier a dépassé le stade paiement →
 * validation transit, donc une ligne ajoutée par l'admin est validée par
 * définition (sinon elle resterait `LIBRE` et fausserait le total facturé).
 *
 * Les désignations `REJETEE` (refusées) et déjà `VALIDEE_ADMIN` sont laissées
 * intactes. Mutation en place ET renvoi. Idempotent.
 */
export function autoValidatePendingDesignations<
  T extends Pick<IDesignation, 'nom' | 'statutDesignation' | 'valideAdminBy' | 'valideAdminAt'>
>(designations: T[] | undefined | null, adminUserId: string, now: Date = new Date()): T[] {
  if (!Array.isArray(designations)) return designations ?? [];

  for (const d of designations) {
    if (!d) continue;
    if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) continue;
    if (d.statutDesignation === DesignationStatus.REJETEE) continue;

    d.statutDesignation = DesignationStatus.VALIDEE_ADMIN;
    if (adminUserId) {
      d.valideAdminBy = adminUserId;
    }
    d.valideAdminAt = now;
  }

  return designations;
}
