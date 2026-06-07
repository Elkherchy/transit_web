import type { ColumnDef } from '@tanstack/react-table';
import type { NextRouter } from 'next/router';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
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
import {
  ITransit,
  ITransitPayeurFactureRow,
  TransitStatus,
} from '@/types';
import {
  CreditCard,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';

export type TransitRow = ITransit & { payeurFacture?: ITransitPayeurFactureRow };

export function transitStatusBadge(status: TransitStatus) {
  const statusColors: Record<TransitStatus, string> = {
    [TransitStatus.EN_COURS]: 'bg-primary',
    [TransitStatus.BROUILLON]: 'bg-gray-500',
    [TransitStatus.FACTURE_EMISE]: 'bg-yellow-500',
    [TransitStatus.EN_VALIDATION]: 'bg-orange-500',
    [TransitStatus.VALIDE_TRANSIT]: 'bg-emerald-500',
    [TransitStatus.VALIDE]: 'bg-green-500',
    [TransitStatus.CLOTURE]: 'bg-purple-500',
  };
  return (
    <Badge className={statusColors[status] || 'bg-gray-500'}>{status}</Badge>
  );
}

export interface TransitTableActions {
  router: NextRouter;
  isAgentOrAdmin: boolean;
  isPayeur: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
}

export function createTransitColumns(
  actions: TransitTableActions
): ColumnDef<TransitRow>[] {
  const { router, isAgentOrAdmin, isPayeur, deletingId, onDelete } = actions;

  return [
    {
      accessorKey: 'client',
      header: 'Client',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.client}</span>
      ),
    },
    {
      accessorKey: 'bl',
      header: 'BL',
    },
    {
      accessorKey: 'objet',
      header: 'Objet',
      cell: ({ row }) => (
        <span
          className="max-w-[200px] truncate block"
          title={row.original.objet}
        >
          {row.original.objet}
        </span>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) =>
        new Date(row.original.date).toLocaleDateString('fr-FR'),
    },
    {
      accessorKey: 'statut',
      header: 'Statut',
      cell: ({ row }) => transitStatusBadge(row.original.statut),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: 'Actions',
      cell: ({ row }) => {
        const transit = row.original;
        const showPayeurPaiement =
          isPayeur &&
          transit.payeurFacture?.soumettrePaiementDisponible &&
          transit.payeurFacture._id;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0"
                  aria-label={`Actions — ${transit.client}`}
                  disabled={deletingId === transit._id}
                >
                  {deletingId === transit._id ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  ) : (
                    <>
                      <span className="sr-only">Actions</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    void router.push({
                      pathname: '/dashboard/transit/details',
                      query: { id: transit._id },
                    })
                  }
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {isPayeur ? 'Voir le dossier' : 'Voir'}
                </DropdownMenuItem>
                {isAgentOrAdmin && (
                  <DropdownMenuItem
                    onClick={() =>
                      void router.push(`/dashboard/transit/edit/${transit._id}`)
                    }
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Modifier
                  </DropdownMenuItem>
                )}
                {showPayeurPaiement && (
                  <DropdownMenuItem
                    onClick={() => {
                      const fid = transit.payeurFacture?._id;
                      if (fid)
                        void router.push(
                          `/dashboard/factures/${fid}?paiement=1`
                        );
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Soumettre un paiement
                  </DropdownMenuItem>
                )}
                {isAgentOrAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void onDelete(transit._id)}
                      disabled={deletingId === transit._id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
