import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
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
import { CaisseType, IUserResponse, UserRole } from '@/types';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

export const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.ADMIN_TRANSIT]: 'Admin transit',
  [UserRole.AGENT_TRANSIT]: 'Agent transit',
  [UserRole.USER_PAYEUR]: 'Payeur',
  [UserRole.COMPTABLE]: 'Comptable',
  [UserRole.CAISSIER]: 'Caissier',
};

export interface UtilisateursTableActions {
  t: TFunction;
  currentUserId: string | undefined;
  onEdit: (u: IUserResponse) => void;
  onDeleteRequest: (u: IUserResponse) => void;
}

export function createUtilisateursColumns(
  actions: UtilisateursTableActions
): ColumnDef<IUserResponse>[] {
  const { t, currentUserId, onEdit, onDeleteRequest } = actions;

  const roleLabel = (role: UserRole) => t(`roles.${role}`);

  return [
    {
      accessorKey: 'nom',
      header: () => t('dashboard.utilisateurs.columns.nom'),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.nom}</span>
      ),
    },
    {
      accessorKey: 'email',
      header: () => t('dashboard.utilisateurs.columns.email'),
    },
    {
      accessorKey: 'role',
      header: () => t('dashboard.utilisateurs.columns.role'),
      cell: ({ row }) => (
        <Badge variant="outline">{roleLabel(row.original.role)}</Badge>
      ),
    },
    {
      id: 'caisse',
      header: () => t('dashboard.utilisateurs.columns.caisse'),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.role === UserRole.CAISSIER
            ? row.original.caisseCompteId
              ? t('dashboard.utilisateurs.columns.compteAffecte')
              : '—'
            : row.original.caisse === CaisseType.TRANSIT
            ? t('dashboard.utilisateurs.columns.transit')
            : '—'}
        </span>
      ),
    },
    {
      id: 'actif',
      header: () => t('dashboard.utilisateurs.columns.statut'),
      cell: ({ row }) =>
        row.original.actif ? (
          <Badge className="bg-emerald-600">{t('dashboard.utilisateurs.columns.actif')}</Badge>
        ) : (
          <Badge variant="secondary">{t('dashboard.utilisateurs.columns.inactif')}</Badge>
        ),
    },
    {
      id: 'actions',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: () => t('common.actions'),
      cell: ({ row }) => {
        const u = row.original;
        const self = u._id === currentUserId;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label={`${t('common.actions')} — ${u.nom}`}
              >
                <span className="sr-only">{t('common.openMenu')}</span>
                <MoreHorizontal className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit(u)}>
                <Pencil className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={self}
                title={
                  self
                    ? t('dashboard.utilisateurs.columns.cannotDeleteOwnAccount')
                    : undefined
                }
                onClick={() => onDeleteRequest(u)}
              >
                <Trash2 className="mr-2 h-4 w-4 rtl:sm:ml-0 rtl:sm:mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}