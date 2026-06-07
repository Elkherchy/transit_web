import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { TFunction } from 'i18next';
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
import {
  type IFichierLogistique,
  FichierLogistiqueStatus,
} from '@/types';
import { Eye, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react';

export interface FichierRow extends IFichierLogistique {
  nbVoyages: number;
  nbReserves: number;
  nbRetournes: number;
  nbValides: number;
  totalPrixTransport: number;
}

const STATUT_CLASS: Record<FichierLogistiqueStatus, string> = {
  [FichierLogistiqueStatus.OUVERT]: 'bg-blue-500 text-white hover:bg-blue-500',
  [FichierLogistiqueStatus.PRET_VALIDATION]:
    'bg-amber-500 text-white hover:bg-amber-500',
  [FichierLogistiqueStatus.VALIDE]:
    'bg-green-600 text-white hover:bg-green-600',
};

export function fichierStatutBadge(s: FichierLogistiqueStatus, t: TFunction) {
  return (
    <Badge className={`${STATUT_CLASS[s] ?? ''} text-xs`}>
      {t(`dashboard.logistique.statuses.fichier.${s}`)}
    </Badge>
  );
}

export interface FichierColumnsOptions {
  t: TFunction;
  detailLinkBase?: string;
  /** Si true, masque les actions Modifier/Supprimer (lecture seule). */
  readOnly?: boolean;
  onDelete?: (row: FichierRow) => void;
  /** Action "Soumettre à validation transit" — visible si le rôle agent
   *  réception logistique (ou admin) ET le fichier est OUVERT avec tous
   *  les voyages retournés. */
  onSoumettre?: (row: FichierRow) => void;
}

export function createFichierColumns(
  options: FichierColumnsOptions
): ColumnDef<FichierRow>[] {
  const {
    t,
    detailLinkBase = '/dashboard/logistique/fichiers',
    readOnly = false,
    onDelete,
    onSoumettre,
  } = options;
  return [
    {
      accessorKey: 'reference',
      header: t('dashboard.logistique.fichier.fieldReference'),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.reference}</span>
      ),
    },
    {
      id: 'date',
      header: t('dashboard.logistique.fichier.fieldDate'),
      cell: ({ row }) => (
        <span className="text-sm">
          {new Date(row.original.date).toLocaleDateString('fr-FR')}
        </span>
      ),
    },
    {
      id: 'voyages',
      header: t('dashboard.logistique.fichier.fieldVoyages'),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="space-y-0.5 text-sm">
            <div className="font-medium">
              {t('dashboard.logistique.bonsCommande.newVoyagesCount', { count: r.nbVoyages })}
            </div>
            <div className="text-xs text-muted-foreground">
              {r.nbReserves} {t('dashboard.logistique.statuses.voyage.EN_COURS').toLowerCase()} ·{' '}
              {r.nbRetournes} {t('dashboard.logistique.statuses.voyage.RETOURNE').toLowerCase()} ·{' '}
              {r.nbValides} {t('dashboard.logistique.statuses.voyage.VALIDE').toLowerCase()}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'statut',
      header: t('dashboard.logistique.vehicule.colStatut'),
      cell: ({ row }) => fichierStatutBadge(row.original.statut, t),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: t('dashboard.logistique.actions.label'),
      cell: ({ row }) => {
        const r = row.original;
        const isEngaged =
          r.nbReserves > 0 || r.nbRetournes > 0 || r.nbValides > 0;
        const isLocked =
          isEngaged || r.statut === FichierLogistiqueStatus.VALIDE;
        const canMutate = !readOnly && !isLocked;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={t('dashboard.logistique.actions.ariaActionsRef', { reference: r.reference })}
              >
                <span className="sr-only">{t('dashboard.logistique.actions.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t('dashboard.logistique.actions.label')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`${detailLinkBase}/${r._id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t('dashboard.logistique.actions.details')}
                </Link>
              </DropdownMenuItem>
              {/* Valider et envoyer au transit : agent réception logistique
                  peut valider/envoyer son dossier à tout moment tant que le
                  statut est OUVERT (au moins un voyage présent). */}
              {onSoumettre &&
                r.statut === FichierLogistiqueStatus.OUVERT &&
                r.nbVoyages > 0 && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onSoumettre(r);
                    }}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t('dashboard.logistique.actions.soumettre')}
                  </DropdownMenuItem>
                )}
              {canMutate && (
                <DropdownMenuItem asChild>
                  <Link href={`${detailLinkBase}/${r._id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('dashboard.logistique.actions.edit')}
                  </Link>
                </DropdownMenuItem>
              )}
              {canMutate && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onDelete(r);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('dashboard.logistique.actions.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
