/**
 * Lecture du paramètre `limit` d'une requête de liste.
 *
 * Aucun plafond n'est imposé : la pagination (10 lignes par page, nombre de
 * pages illimité) est gérée par l'interface. Un `limit` absent prend
 * `fallback` (0 = toutes les lignes) ; `0`, une valeur négative ou non
 * numérique (ex. « all ») donnent aussi 0. Une valeur strictement positive
 * reste honorée (taille de page côté serveur).
 *
 * Le résultat se passe tel quel à `.limit()` de Mongoose : `.limit(0)` = sans limite.
 */
export function parseLimit(raw: unknown, fallback = 0): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Nombre de pages pour `total` lignes ; `limit` 0 (= tout) tient sur une seule page. */
export function countPages(total: number, limit: number): number {
  return limit > 0 ? Math.ceil(total / limit) : Math.min(total, 1);
}
