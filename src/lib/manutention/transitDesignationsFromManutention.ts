import { DESIGNATIONS_DEFAULT } from '@/types';

/**
 * Dossier transit issu d’une facture manutention : même liste de désignations
 * que les dossiers transit standards ; seul « Bon de livret » reçoit le total
 * de la facture (`bonLivret`), les autres montants restent à 0.
 */
export function buildTransitDesignationsFromManutention(bonLivretTotal: number): {
  nom: string;
  montant: number;
}[] {
  const total = Math.max(0, Number(bonLivretTotal) || 0);
  return DESIGNATIONS_DEFAULT.map((nom) => ({
    nom,
    montant: nom === 'Bon de livret' ? total : 0,
  }));
}
