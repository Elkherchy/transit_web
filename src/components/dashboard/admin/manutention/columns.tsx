import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { FactureManutentionStatus, type IFactureManutention } from '@/types';
import { Eye, MoreHorizontal, Pencil, ShieldCheck } from 'lucide-react';

export interface ManutentionRow extends IFactureManutention {
  transitId?: string;
}

export interface ManutentionColumnsOptions {
  t: TFunction;
  detailLinkBase?: string;
  /** Callback "Valider" affiché uniquement pour les factures BROUILLON
   *  (créées par AGENT_TRANSIT) — réservé aux ADMIN / ADMIN_TRANSIT. */
  onValider?: (row: ManutentionRow) => void;
}

export function createManutentionColumns(
  options: ManutentionColumnsOptions
): ColumnDef<ManutentionRow>[] {
  const { t, detailLinkBase, onValider } = options;
  return [
    {
      accessorKey: 'client',
      header: () => t('dashboard.admin.manutention.columns.client'),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.client || '—'}</span>
      ),
    },
    {
      accessorKey: 'bl',
      header: () => t('dashboard.admin.manutention.columns.bl'),
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{row.original.bl}</span>
      ),
    },
    {
      accessorKey: 'objet',
      header: () => t('dashboard.admin.manutention.columns.objet'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground line-clamp-2">
          {row.original.objet || '—'}
        </span>
      ),
    },
    {
      accessorKey: 'bonLivret',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('dashboard.admin.manutention.columns.bonLivret'),
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">
          {Number(row.original.bonLivret ?? 0).toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      accessorKey: 'statut',
      header: () => t('dashboard.admin.manutention.columns.statut'),
      cell: ({ row }) => {
        const s = row.original.statut;
        if (s === FactureManutentionStatus.BROUILLON) {
          return (
            <Badge className="bg-slate-500 text-white hover:bg-slate-500 text-xs">
              Brouillon
            </Badge>
          );
        }
        if (s === FactureManutentionStatus.EN_ATTENTE_VALIDATION) {
          return (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
              En attente validation
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-xs">
            {s}
          </Badge>
        );
      },
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
                aria-label={`${t('common.actions')} — ${r.bl}`}
              >
                <span className="sr-only">{t('common.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {detailLinkBase && (
                <DropdownMenuItem asChild>
                  <Link href={`${detailLinkBase}/${r._id}`}>
                    <Eye className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                    {t('dashboard.admin.manutention.columns.viewDetail')}
                  </Link>
                </DropdownMenuItem>
              )}
              {detailLinkBase && (
                <DropdownMenuItem asChild>
                  <Link href={`${detailLinkBase}/${r._id}?edit=1`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Modifier
                  </Link>
                </DropdownMenuItem>
              )}
              {onValider &&
                (r.statut === FactureManutentionStatus.BROUILLON ||
                  r.statut ===
                    FactureManutentionStatus.EN_ATTENTE_VALIDATION) && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onValider(r);
                    }}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Valider
                  </DropdownMenuItem>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}