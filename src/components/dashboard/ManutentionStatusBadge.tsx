import type { TFunction } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { FactureManutentionStatus } from '@/types';

/**
 * Métadonnées d'affichage d'un statut de facture manutention / BL.
 * Chaque statut a une couleur distincte + une clé de traduction (fr/ar).
 * Clés i18n : dashboard.manutention.statutBadge.<key>
 */
const STATUS_META: Record<
  FactureManutentionStatus,
  { key: string; className: string }
> = {
  [FactureManutentionStatus.BROUILLON]: {
    key: 'brouillon',
    className: 'bg-slate-500 text-white hover:bg-slate-500',
  },
  [FactureManutentionStatus.EN_ATTENTE_VALIDATION]: {
    key: 'enAttenteValidation',
    className: 'bg-amber-500 text-white hover:bg-amber-500',
  },
  [FactureManutentionStatus.EN_ATTENTE_PAIEMENT]: {
    key: 'enAttentePaiement',
    className: 'bg-blue-500 text-white hover:bg-blue-500',
  },
  [FactureManutentionStatus.PAIEMENT_PARTIEL]: {
    key: 'paiementPartiel',
    className: 'bg-orange-500 text-white hover:bg-orange-500',
  },
  [FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION]: {
    key: 'payeEnAttenteValidation',
    className: 'bg-violet-500 text-white hover:bg-violet-500',
  },
  [FactureManutentionStatus.CLOTURE]: {
    key: 'cloture',
    className: 'bg-green-600 text-white hover:bg-green-600',
  },
};

export function manutentionStatusLabel(
  statut: FactureManutentionStatus | undefined,
  t: TFunction
): string {
  const meta = statut ? STATUS_META[statut] : undefined;
  if (!meta) return statut || '—';
  return t(`dashboard.manutention.statutBadge.${meta.key}`);
}

export function ManutentionStatusBadge({
  statut,
  t,
  className,
}: {
  statut: FactureManutentionStatus | undefined;
  t: TFunction;
  className?: string;
}) {
  const meta = statut ? STATUS_META[statut] : undefined;
  if (!meta) {
    return (
      <Badge variant="outline" className={`text-xs ${className || ''}`}>
        {statut || '—'}
      </Badge>
    );
  }
  return (
    <Badge className={`text-xs ${meta.className} ${className || ''}`}>
      {t(`dashboard.manutention.statutBadge.${meta.key}`)}
    </Badge>
  );
}
