import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { TFunction } from 'i18next';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { IVehiculeResponse } from '@/types';
import { Fuel, History, MoreHorizontal, Pencil, Trash2, Wallet } from 'lucide-react';

export interface VehiculeTableActions {
  t: TFunction;
  deletingId: string | null;
  onEdit: (row: IVehiculeResponse) => void;
  onTrackFuel: (row: IVehiculeResponse) => void;
  onShowHistory: (row: IVehiculeResponse) => void;
  onDelete: (row: IVehiculeResponse) => void;
}

export function createVehiculeColumns(
  actions: VehiculeTableActions
): ColumnDef<IVehiculeResponse>[] {
  const { t, deletingId, onEdit, onTrackFuel, onShowHistory, onDelete } = actions;

  return [
    {
      accessorKey: 'matricule',
      header: t('dashboard.logistique.vehicule.colMatricule'),
      cell: ({ row }) => <span className="font-semibold">{row.original.matricule}</span>,
    },
    {
      accessorKey: 'categorie',
      header: t('dashboard.logistique.vehicule.colCategorie'),
      cell: ({ row }) => (
        row.original.categorie === 'CLIENT'
          ? <Badge variant="outline">{t('dashboard.logistique.vehicule.categorieClient')}</Badge>
          : <Badge className="bg-sky-600">{t('dashboard.logistique.vehicule.categorieInterne')}</Badge>
      ),
    },
    {
      accessorKey: 'chauffeurNom',
      header: t('dashboard.logistique.vehicule.colChauffeur'),
      cell: ({ row }) =>
        row.original.categorie === 'CLIENT'
          ? row.original.clientNom || t('dashboard.logistique.vehicule.categorieClient')
          : row.original.chauffeurNom || t('dashboard.logistique.vehicule.chauffeurNonAssigne'),
    },
    {
      accessorKey: 'carburant',
      header: t('dashboard.logistique.vehicule.colCarburant'),
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      cell: ({ row }) => Number(row.original.carburant || 0).toFixed(2),
    },
    {
      accessorKey: 'actif',
      header: t('dashboard.logistique.vehicule.colStatut'),
      cell: ({ row }) =>
        row.original.actif ? (
          <Badge className="bg-emerald-600">{t('dashboard.logistique.vehicule.actif')}</Badge>
        ) : (
          <Badge variant="secondary">{t('dashboard.logistique.vehicule.inactif')}</Badge>
        ),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: t('dashboard.logistique.vehicule.colActions'),
      cell: ({ row }) => {
        const vehicule = row.original;
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0"
                  aria-label={t('dashboard.logistique.actions.ariaActionsMatricule', { matricule: vehicule.matricule })}
                  disabled={deletingId === vehicule._id}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t('dashboard.logistique.actions.label')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(vehicule)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('dashboard.logistique.actions.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTrackFuel(vehicule)}>
                  <Fuel className="mr-2 h-4 w-4" />
                  {t('dashboard.logistique.actions.trackFuel')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onShowHistory(vehicule)}>
                  <History className="mr-2 h-4 w-4" />
                  {t('dashboard.logistique.actions.fuelHistory')}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/logistique/vehicule/${vehicule._id}/caisse-transactions`}>
                    <Wallet className="mr-2 h-4 w-4" />
                    {t('dashboard.logistique.actions.caisseTransactions')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(vehicule)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('dashboard.logistique.actions.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
