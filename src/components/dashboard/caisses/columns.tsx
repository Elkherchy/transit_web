import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CaisseKind, CompteType, ICaisseListItem } from '@/types';
import { MoreHorizontal } from 'lucide-react';

export interface CaissesTableActions {
  t: TFunction;
  openQuick: (row: ICaisseListItem, mode: 'solde' | 'mouvement') => void;
  onRename: (row: ICaisseListItem) => void;
  onDeactivate: (row: ICaisseListItem) => void;
}

function compteTypeLabel(type: CompteType, t: TFunction): string {
  switch (type) {
    case CompteType.GENERAL:
      return t('dashboard.caisses.type.general');
    case CompteType.BANQUE:
      return t('dashboard.caisses.type.banque');
    case CompteType.CAISSE:
    default:
      return t('dashboard.caisses.type.caisse');
  }
}

export function createCaissesColumns(
  actions: CaissesTableActions
): ColumnDef<ICaisseListItem>[] {
  const { t, openQuick, onRename, onDeactivate } = actions;

  return [
    {
      accessorKey: 'nom',
      header: () => t('dashboard.caisses.columns.nom'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === CaisseKind.CLIENT && r.clientId) {
          return (
            <Link
              href={`/dashboard/admin/clients/${r.clientId}`}
              className="font-medium text-primary hover:underline"
            >
              {r.nom}
            </Link>
          );
        }
        return <span className="font-medium">{r.nom}</span>;
      },
    },
    {
      id: 'type',
      header: () => t('dashboard.caisses.columns.type'),
      cell: ({ row }) => compteTypeLabel(row.original.type, t),
    },
    {
      id: 'payeur',
      header: () => t('dashboard.caisses.columns.payeur'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.payeur
            ? `${row.original.payeur.nom} · ${row.original.payeur.email}`
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'solde',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('dashboard.caisses.columns.solde'),
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">
          {row.original.solde.toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('common.actions'),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`${t('common.actions')} — ${r.nom}`}
              >
                <span className="sr-only">{t('common.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {r.kind === CaisseKind.CLIENT && r.clientId && (
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/admin/clients/${r.clientId}`}>Voir client</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                  <Link href={`/dashboard/caisses/${r._id}`}>{t('dashboard.caisses.columns.operations')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuick(r, 'solde')}>
                  {t('dashboard.caisses.columns.addSolde')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openQuick(r, 'mouvement')}>
                  {t('dashboard.caisses.columns.saisirMouvement')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onRename(r)}>
                  {t('dashboard.caisses.columns.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDeactivate(r)}
                >
                  {t('dashboard.caisses.columns.desactiver')}
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}