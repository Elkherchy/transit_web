import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChauffeurFactureStatut, type IChauffeurFacture } from '@/types';
import { Check, CreditCard, FileText, MoreHorizontal } from 'lucide-react';

export interface FacturesChauffeursTableActions {
  t: TFunction;
  busyId: string | null;
  onConfirm: (factureId: string) => void;
  onPay: (facture: IChauffeurFacture) => void;
  onView?: (facture: IChauffeurFacture) => void;
}

function formatMRU(amount: number): string {
  return (
    new Intl.NumberFormat('fr-MR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount) + ' MRU'
  );
}

function getStatusBadge(statut: ChauffeurFactureStatut, t: TFunction) {
  const variants: Record<
    ChauffeurFactureStatut,
    'default' | 'secondary' | 'outline' | 'destructive'
  > = {
    [ChauffeurFactureStatut.BROUILLON]: 'secondary',
    [ChauffeurFactureStatut.CONFIRME]: 'default',
    [ChauffeurFactureStatut.PAYE]: 'outline',
  };

  const labels: Record<ChauffeurFactureStatut, string> = {
    [ChauffeurFactureStatut.BROUILLON]: t('dashboard.logistique.paiementsChauffeurs.status.brouillon'),
    [ChauffeurFactureStatut.CONFIRME]: t('dashboard.logistique.paiementsChauffeurs.status.confirmee'),
    [ChauffeurFactureStatut.PAYE]: t('dashboard.logistique.paiementsChauffeurs.status.payee'),
  };

  return <Badge variant={variants[statut]}>{labels[statut]}</Badge>;
}

export function createFacturesChauffeursColumns(
  actions: FacturesChauffeursTableActions
): ColumnDef<IChauffeurFacture>[] {
  const { t, busyId, onConfirm, onPay, onView } = actions;

  return [
    {
      accessorKey: 'reference',
      header: () => t('dashboard.logistique.paiementsChauffeurs.columns.reference'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          <div>
            <div className="font-medium">{row.original.reference}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.weekStart} → {row.original.weekEnd}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'chauffeurNom',
      header: () => t('dashboard.logistique.paiementsChauffeurs.columns.chauffeur'),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.chauffeurNom}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.nombreCharges} {row.original.nombreCharges > 1 ? t('dashboard.logistique.paiementsChauffeurs.columns.missionsPluriel') : t('dashboard.logistique.paiementsChauffeurs.columns.missionSingulier')}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'montantCharge',
      header: () => t('dashboard.logistique.paiementsChauffeurs.columns.montantParMission'),
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      cell: ({ row }) => <span className="tabular-nums">{formatMRU(row.original.montantCharge)}</span>,
    },
    {
      accessorKey: 'total',
      header: () => t('dashboard.logistique.paiementsChauffeurs.columns.total'),
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      cell: ({ row }) => <span className="font-semibold tabular-nums">{formatMRU(row.original.total)}</span>,
    },
    {
      accessorKey: 'statut',
      header: () => t('dashboard.logistique.paiementsChauffeurs.columns.statut'),
      cell: ({ row }) => getStatusBadge(row.original.statut, t),
    },
    {
      id: 'actions',
      header: () => t('common.actions'),
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      cell: ({ row }) => {
        const facture = row.original;
        const isConfirming = busyId === `confirm-${facture._id}`;
        const isPaying = busyId === `pay-${facture._id}`;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`${t('common.actions')} - ${facture.reference}`}
              >
                <span className="sr-only">{t('common.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <FileText className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                {facture.reference}
              </DropdownMenuItem>
              {onView ? (
                <DropdownMenuItem onClick={() => onView(facture)}>
                  <FileText className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                  {t('dashboard.logistique.paiementsChauffeurs.columns.viewDetails')}
                </DropdownMenuItem>
              ) : null}
              {facture.statut === ChauffeurFactureStatut.BROUILLON ? (
                <DropdownMenuItem onClick={() => onConfirm(facture._id)} disabled={isConfirming}>
                  <Check className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                  {isConfirming ? t('dashboard.logistique.paiementsChauffeurs.columns.confirming') : t('dashboard.logistique.paiementsChauffeurs.columns.confirm')}
                </DropdownMenuItem>
              ) : null}
              {facture.statut === ChauffeurFactureStatut.CONFIRME ? (
                <DropdownMenuItem onClick={() => onPay(facture)} disabled={isPaying}>
                  <CreditCard className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                  {isPaying ? t('dashboard.logistique.paiementsChauffeurs.columns.paying') : t('dashboard.logistique.paiementsChauffeurs.columns.pay')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}