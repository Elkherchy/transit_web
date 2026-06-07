import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Montant MRU pour affichage (ex. fiche imprimée). */
export function formatCurrency(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  let s = `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MRU`
  // fr-FR utilise souvent U+202F (espace fine insécable) comme séparateur de milliers ;
  // en PDF (React-PDF / Cairo) ce caractère peut s’afficher comme « / » ou un glyphe incorrect.
  s = s.replace(/\u202f/g, " ").replace(/\u00a0/g, " ")
  return s
}

/** Date courte locale (papier). */
export function formatDate(value: Date | string | undefined | null): string {
  if (value == null || value === "") return ""
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR")
}
