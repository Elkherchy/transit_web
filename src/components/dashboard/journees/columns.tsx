import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { type IJourneeCaisse, JourneeCaisseStatus } from '@/types';
import { Eye } from 'lucide-react';

const STATUT_CLASS: Record<JourneeCaisseStatus, string> = {
  [JourneeCaisseStatus.OUVERTE]: 'bg-blue-500 text-white hover:bg-blue-500',
  [JourneeCaisseStatus.CLOTUREE]: 'bg-amber-500 text-white hover:bg-amber-500',
  [JourneeCaisseStatus.VALIDEE_TRANSIT]:
    'bg-violet-600 text-white hover:bg-violet-600',
  [JourneeCaisseStatus.VALIDEE_ADMIN]:
    'bg-green-600 text-white hover:bg-green-600',
};

export function statutJourneeBadge(s: JourneeCaisseStatus, t: TFunction) {
  const labels: Record<JourneeCaisseStatus, string> = {
    [JourneeCaisseStatus.OUVERTE]: t('dashboard.journees.status.ouverte'),
    [JourneeCaisseStatus.CLOTUREE]: t('dashboard.journees.status.aValider'),
    [JourneeCaisseStatus.VALIDEE_TRANSIT]: t('dashboard.journees.status.enAttenteAdmin'),
    [JourneeCaisseStatus.VALIDEE_ADMIN]: t('dashboard.journees.status.validee'),
  };
  return (
    <Badge className={`${STATUT_CLASS[s] ?? ''} text-xs`}>
      {labels[s] ?? s}
    </Badge>
  );
}

export interface JourneesTableActions {
  t: TFunction;
  detailLinkBase: string;
}

export function createJourneesColumns(
  actions: JourneesTableActions
): ColumnDef<IJourneeCaisse>[] {
  const { t, detailLinkBase } = actions;

  return [
    {
      accessorKey: 'date',
      header: () => t('dashboard.journees.columns.date'),
      cell: ({ row }) => (
        <span className="font-medium">
          {new Date(row.original.date).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      id: 'transits',
      header: () => t('dashboard.journees.columns.dossiers'),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.transitsTraitesIds?.length ?? 0} {t('dashboard.journees.columns.dossierPluriel')}
        </span>
      ),
    },
    {
      id: 'alimentations',
      header: () => t('dashboard.journees.columns.alimentations'),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.alimentationsPayeurs?.length ?? 0} {t('dashboard.journees.columns.operationPluriel')}
        </span>
      ),
    },
    {
      id: 'soldes',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('dashboard.journees.columns.soldeFin'),
      cell: ({ row }) => {
        const fin = row.original.soldeGeneralFin;
        return (
          <span className="font-semibold tabular-nums">
            {fin !== undefined && fin !== null
              ? Number(fin).toLocaleString('fr-FR', { minimumFractionDigits: 2 })
              : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'statut',
      header: () => t('dashboard.journees.columns.statut'),
      cell: ({ row }) => statutJourneeBadge(row.original.statut, t),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('common.actions'),
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm">
          <Link href={`${detailLinkBase}/${row.original._id}`}>
            <Eye className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2 rtl:rotate-180" />
            {t('dashboard.journees.columns.detail')}
          </Link>
        </Button>
      ),
    },
  ];
}