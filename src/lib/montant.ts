/**
 * Helpers de montants (MRU) — affichage et saisie en chiffres latins.
 *
 * Contexte : l'app tourne en interface arabe (`document.lang="ar"`) et la locale
 * OS des utilisateurs est souvent `ar-MR` (Mauritanie), dont le système de
 * numérotation par défaut est arabo-indien (١٢٣). Deux pièges :
 *  1. `Number.toLocaleString()` SANS locale explicite rend alors « ١٥٠٠ ».
 *     → toujours formater avec `fmtMontant` (locale `fr-FR`, chiffres latins).
 *  2. `<input type="number">` : Chrome (surtout mobile) rend la valeur avec les
 *     chiffres de la locale OS en IGNORANT l'attribut `lang`. → utiliser
 *     `type="text"` + `inputMode="decimal"` + `dir="ltr"`, et parser la saisie
 *     avec `parseMontant` (qui reconvertit d'éventuels chiffres arabes tapés).
 */

/** Formate un montant en chiffres latins (fr-FR). `decimals` = nb de décimales. */
export function fmtMontant(n: number, decimals = 2): string {
  return Number(n || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Parse une saisie montant (champ texte) en nombre.
 * Reconvertit les chiffres arabo-indiens (٠-٩ / ۰-۹) et perses en chiffres
 * latins, mappe les séparateurs arabes (décimal U+066B, milliers U+066C) et la
 * virgule vers le point, puis nettoie. Retourne 0 pour une saisie invalide.
 */
export function parseMontant(raw: string | number | null | undefined): number {
  const latin = String(raw ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.') // séparateur décimal arabe (U+066B)
    .replace(/٬/g, '') // séparateur de milliers arabe (U+066C)
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  const n = parseFloat(latin);
  return Number.isFinite(n) ? n : 0;
}
