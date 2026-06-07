import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';


import {
  PageContent,
  PageHeader,
  PageSkeleton,
  EmptyState,
  ResponsiveTableArea,
  MobileEntityCard,
  MobilePagination,
  SearchInput,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  type DataTableColumnMeta,
} from '@/components/ui/data-table';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  FactureManutentionStatus,
  IFactureManutention,
  UserRole,
} from '@/types';

/** Étend IFactureManutention avec les totaux des factures client liées
 *  et le compteur des désignations du transit lié (= lignes entreprise réelles). */
interface BLTransitRow extends IFactureManutention {
  factureClientTotal: number;
  factureClientPaye: number;
  designationsCount: number;
  designationsTotal: number;
}
import type { TFunction } from 'i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, RefreshCcw } from 'lucide-react';

const ALLOWED: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
  UserRole.COMPTABLE,
];

const STATUS_OPTIONS: Array<{ value: string; key: string }> = [
  { value: 'ALL', key: 'all' },
  { value: 'VALIDATED', key: 'validated' },
  { value: 'NOT_VALIDATED', key: 'notValidated' },
  { value: FactureManutentionStatus.BROUILLON, key: 'brouillon' },
  { value: FactureManutentionStatus.EN_ATTENTE_PAIEMENT, key: 'enAttentePaiement' },
  { value: FactureManutentionStatus.PAIEMENT_PARTIEL, key: 'paiementPartiel' },
  { value: FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION, key: 'payeEnAttenteValidation' },
  { value: FactureManutentionStatus.CLOTURE, key: 'cloture' },
];

function statusBadge(s: FactureManutentionStatus | undefined, t: TFunction) {
  switch (s) {
    case FactureManutentionStatus.CLOTURE:
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600 text-xs">
          {t('dashboard.transit.bls.status.cloture')}
        </Badge>
      );
    case FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION:
      return (
        <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
          {t('dashboard.transit.bls.status.payeEnAttenteValidation')}
        </Badge>
      );
    case FactureManutentionStatus.PAIEMENT_PARTIEL:
      return (
        <Badge className="bg-orange-500 text-white hover:bg-orange-500 text-xs">
          {t('dashboard.transit.bls.status.paiementPartiel')}
        </Badge>
      );
    case FactureManutentionStatus.EN_ATTENTE_PAIEMENT:
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-500 text-xs">
          {t('dashboard.transit.bls.status.enAttentePaiement')}
        </Badge>
      );
    case FactureManutentionStatus.BROUILLON:
      return (
        <Badge variant="outline" className="text-xs">
          {t('dashboard.transit.bls.status.brouillon')}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {s || '—'}
        </Badge>
      );
  }
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export interface BLsTransitListPageProps {
  /** Verrouille le filtre admin-validation et masque le sélecteur statut.
   *  'true'  = uniquement les BL validés par l'admin (≠ EN_ATTENTE_VALIDATION)
   *  'false' = uniquement les BL EN_ATTENTE_VALIDATION
   *  undefined = page complète avec sélecteur libre (comportement original) */
  fixedAdminValidated?: 'true' | 'false';
}

export default function BLsTransitListPage({
  fixedAdminValidated,
}: BLsTransitListPageProps = {}) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && ALLOWED.includes(user.role as UserRole);

  const [rows, setRows] = useState<BLTransitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = isMobile ? 10 : 25;

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      // Filtre verrouillé prioritaire (pages /valides /non-valides).
      if (fixedAdminValidated) {
        params.set('adminValidated', fixedAdminValidated);
      } else if (statusFilter === 'VALIDATED')
        params.set('validated', 'true');
      else if (statusFilter === 'NOT_VALIDATED') params.set('validated', 'false');
      else if (statusFilter !== 'ALL') params.set('statut', statusFilter);

      const r = await fetch(`/api/transit/bls?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await r.json();
      if (data.success) {
        setRows((data.data?.data || []) as BLTransitRow[]);
        setTotal(data.data?.total || 0);
        setTotalPages(data.data?.totalPages || 1);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [isAllowed, page, limit, search, statusFilter, fixedAdminValidated, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns = useMemo<ColumnDef<BLTransitRow>[]>(
    () => [
      {
        id: 'bl',
        header: t('dashboard.transit.bls.colBl'),
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.bl || '—'}
          </span>
        ),
      },
      {
        id: 'client',
        header: t('dashboard.transit.bls.colClient'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.client || '—'}</span>
        ),
      },
      {
        id: 'objet',
        header: t('dashboard.transit.bls.colObjet'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.objet || '—'}
          </span>
        ),
      },
      {
        id: 'lignes',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.transit.bls.colNbLignes'),
        cell: ({ row }) => {
          // "Lignes entreprise" = désignations du transit lié.
          // Fallback : si pas de transit, on retombe sur lignesEntreprise
          // de la facture manutention (vue avant création du transit).
          const designationsCount = row.original.designationsCount || 0;
          const fallback = row.original.lignesEntreprise?.length || 0;
          const count = designationsCount > 0 ? designationsCount : fallback;
          return (
            <Badge variant="secondary" className="tabular-nums">
              {count}
            </Badge>
          );
        },
      },
      {
        id: 'montant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.transit.bls.colMontant'),
        cell: ({ row }) => {
          // Montant total = somme des factures client (Facture.totalFinal)
          // liées au transit créé à partir de ce dossier manutention.
          // Fallback : si pas de facture client encore générée, on retombe
          // sur la somme des lignes entreprise (estimation manutention).
          const totalClient = Number(row.original.factureClientTotal || 0);
          const totalLignes = (row.original.lignesEntreprise || []).reduce(
            (s, l) => s + (Number(l.montant) || 0),
            0
          );
          const total = totalClient > 0 ? totalClient : totalLignes;
          const paye = Number(row.original.factureClientPaye || 0);
          return (
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm tabular-nums font-semibold">
                {fmt(total)} {t('common.mru')}
              </span>
              {totalClient > 0 && paye > 0 && (
                <span className="text-[10px] tabular-nums text-emerald-700">
                  {t('dashboard.transit.bls.payeShort', 'payé')}{' '}
                  {fmt(paye)}
                </span>
              )}
              {totalClient === 0 && totalLignes > 0 && (
                <span className="text-[10px] text-muted-foreground italic">
                  {t('dashboard.transit.bls.estimation', 'estimation')}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'statut',
        header: t('dashboard.transit.bls.colStatut'),
        cell: ({ row }) => statusBadge(row.original.statut, t),
      },
      {
        id: 'date',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.transit.bls.colDate'),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.createdAt
              ? new Date(row.original.createdAt).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: '',
        cell: ({ row }) => {
          // Lien vers le détail facture manutention (admin) ou caissier selon
          // le rôle. Pour simplifier on pointe vers l'admin manutention.
          const href = `/dashboard/admin/manutention/${row.original._id}`;
          return (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
            >
              <Link href={href}>
                <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                {t('actions.view')}
              </Link>
            </Button>
          );
        },
      },
    ],
    [t]
  );

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.transit.bls.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={
          fixedAdminValidated === 'true'
            ? t('dashboard.blsTransitListes.titreValides')
            : fixedAdminValidated === 'false'
              ? t('dashboard.blsTransitListes.titreNonValides')
              : t('dashboard.transit.bls.title')
        }
        subtitle={
          fixedAdminValidated === 'true'
            ? t('dashboard.blsTransitListes.subtitleValides')
            : fixedAdminValidated === 'false'
              ? t('dashboard.blsTransitListes.subtitleNonValides')
              : t('dashboard.transit.bls.subtitle')
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {t('actions.refresh')}
            </span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <SearchInput
              placeholder={t('dashboard.transit.bls.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onSearch={(v) => setSearch(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput);
              }}
              className="w-full sm:max-w-sm"
            />
            {!fixedAdminValidated && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(`dashboard.transit.bls.status.${opt.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title={t('dashboard.transit.bls.empty')}
              />
            ) : (
              <>
                <ResponsiveTableArea
                  table={<DataTable columns={columns} data={rows} />}
                  mobileList={
                    <div className="space-y-3">
                      {rows.map((f) => {
                        const totalClient = Number(f.factureClientTotal || 0);
                        const totalLignes = (f.lignesEntreprise || []).reduce(
                          (s, l) => s + (Number(l.montant) || 0),
                          0
                        );
                        const total = totalClient > 0 ? totalClient : totalLignes;
                        return (
                          <MobileEntityCard
                            key={String(f._id)}
                            title={f.bl || '—'}
                            subtitle={f.client || f.objet || '—'}
                            fields={[
                              {
                                label: t('dashboard.transit.bls.colObjet'),
                                value: f.objet || '—',
                              },
                              {
                                label: t('dashboard.transit.bls.colNbLignes'),
                                value: String(
                                  f.designationsCount > 0
                                    ? f.designationsCount
                                    : f.lignesEntreprise?.length || 0
                                ),
                              },
                              {
                                label: t('dashboard.transit.bls.colMontant'),
                                value: `${fmt(total)} ${t('common.mru')}`,
                              },
                              {
                                label: t('dashboard.transit.bls.colDate'),
                                value: f.createdAt
                                  ? new Date(f.createdAt).toLocaleDateString(
                                      'fr-FR'
                                    )
                                  : '—',
                              },
                            ]}
                            actions={
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/dashboard/admin/manutention/${f._id}`}
                                >
                                  <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                                  {t('actions.view')}
                                </Link>
                              </Button>
                            }
                          />
                        );
                      })}
                    </div>
                  }
                />

                {totalPages > 1 && (
                  <div className="mt-4">
                    <MobilePagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      totalItems={total}
                      itemsPerPage={limit}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
