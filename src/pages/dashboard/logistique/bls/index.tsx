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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { IVoyage, UserRole, VoyageStatus } from '@/types';
import type { TFunction } from 'i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileText, RefreshCcw } from 'lucide-react';

const ALLOWED: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
  UserRole.AGENT_TRANSIT,
  UserRole.COMPTABLE,
];

const STATUS_OPTIONS: Array<{ value: string; key: string }> = [
  { value: 'ALL', key: 'all' },
  { value: 'VALIDATED', key: 'validated' },
  { value: 'NOT_VALIDATED', key: 'notValidated' },
  { value: VoyageStatus.CREE, key: 'cree' },
  { value: VoyageStatus.RESERVE, key: 'reserve' },
  { value: VoyageStatus.EN_COURS, key: 'enCours' },
  { value: VoyageStatus.RETOURNE, key: 'retourne' },
  { value: VoyageStatus.VALIDE, key: 'valide' },
];

function statusBadge(s: VoyageStatus | undefined, t: TFunction) {
  switch (s) {
    case VoyageStatus.VALIDE:
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600 text-xs">
          {t('dashboard.logistique.statuses.voyage.VALIDE')}
        </Badge>
      );
    case VoyageStatus.RETOURNE:
      return (
        <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
          {t('dashboard.logistique.statuses.voyage.RETOURNE')}
        </Badge>
      );
    case VoyageStatus.EN_COURS:
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-500 text-xs">
          {t('dashboard.logistique.statuses.voyage.EN_COURS')}
        </Badge>
      );
    case VoyageStatus.RESERVE:
      return (
        <Badge className="bg-violet-500 text-white hover:bg-violet-500 text-xs">
          {t('dashboard.logistique.statuses.voyage.RESERVE')}
        </Badge>
      );
    case VoyageStatus.CREE:
      return (
        <Badge variant="outline" className="text-xs">
          {t('dashboard.logistique.statuses.voyage.CREE')}
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

export default function BLsListPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && ALLOWED.includes(user.role as UserRole);

  const [rows, setRows] = useState<IVoyage[]>([]);
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
      params.set('onlyWithBL', '1');
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter === 'VALIDATED') params.set('validated', 'true');
      else if (statusFilter === 'NOT_VALIDATED') params.set('validated', 'false');
      else if (statusFilter !== 'ALL') params.set('statut', statusFilter);

      const r = await fetch(`/api/logistique/voyages?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await r.json();
      if (data.success) {
        setRows((data.data?.data || []) as IVoyage[]);
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
  }, [isAllowed, page, limit, search, statusFilter, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reset page on filter change.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns = useMemo<ColumnDef<IVoyage>[]>(
    () => [
      {
        id: 'bl',
        header: t('dashboard.logistique.bls.colBl'),
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.bl || '—'}
          </span>
        ),
      },
      {
        id: 'ntcs',
        header: t('dashboard.logistique.bls.colNtcs'),
        cell: ({ row }) => {
          const ntcs =
            row.original.ntcs && row.original.ntcs.length > 0
              ? row.original.ntcs
              : row.original.ntc
                ? [row.original.ntc]
                : [];
          return (
            <span className="text-xs text-muted-foreground tabular-nums">
              {ntcs.length > 0 ? ntcs.join(', ') : '—'}
            </span>
          );
        },
      },
      {
        id: 'date',
        header: t('dashboard.logistique.bls.colDate'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {new Date(row.original.date).toLocaleDateString('fr-FR')}
          </span>
        ),
      },
      {
        id: 'client',
        header: t('dashboard.logistique.bls.colClient'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.clientSource || '—'}</span>
        ),
      },
      {
        id: 'matricule',
        header: t('dashboard.logistique.bls.colMatricule'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.matricule || (
              <span className="italic text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        id: 'statut',
        header: t('dashboard.logistique.bls.colStatut'),
        cell: ({ row }) => statusBadge(row.original.statutVoyage, t),
      },
      {
        id: 'fichier',
        header: t('dashboard.logistique.bls.colFichier'),
        cell: ({ row }) =>
          row.original.fichierLogistiqueId ? (
            <Link
              href={`/dashboard/logistique/fichiers/${row.original.fichierLogistiqueId}`}
              className="text-sm font-mono text-primary hover:underline"
            >
              {row.original.fichierReference || '—'}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: '',
        cell: ({ row }) => (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
          >
            <Link
              href={`/dashboard/logistique/fichiers/${row.original.fichierLogistiqueId}`}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
              {t('actions.view')}
            </Link>
          </Button>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.logistique.bls.title')} />
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
        title={t('dashboard.logistique.bls.title')}
        subtitle={t('dashboard.logistique.bls.subtitle')}
        actions={
          <Button
            variant="outline"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {t('dashboard.logistique.actions.refresh')}
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
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              placeholder={t('dashboard.logistique.bls.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onSearch={(v) => setSearch(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput);
              }}
              className="w-full sm:max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`dashboard.logistique.bls.status.${opt.key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title={t('dashboard.logistique.bls.empty')}
              />
            ) : (
              <>
                <ResponsiveTableArea
                  table={<DataTable columns={columns} data={rows} />}
                  mobileList={
                    <div className="space-y-3">
                      {rows.map((v) => {
                        const ntcs =
                          v.ntcs && v.ntcs.length > 0
                            ? v.ntcs
                            : v.ntc
                              ? [v.ntc]
                              : [];
                        return (
                          <MobileEntityCard
                            key={String(v._id)}
                            title={v.bl || '—'}
                            subtitle={
                              v.clientSource ||
                              v.matricule ||
                              t('dashboard.logistique.bls.subtitleNone')
                            }
                            fields={[
                              {
                                label: t('dashboard.logistique.bls.colNtcs'),
                                value: ntcs.length > 0 ? ntcs.join(', ') : '—',
                              },
                              {
                                label: t('dashboard.logistique.bls.colDate'),
                                value: new Date(v.date).toLocaleDateString('fr-FR'),
                              },
                              {
                                label: t('dashboard.logistique.bls.colMatricule'),
                                value: v.matricule || '—',
                              },
                              {
                                label: t('dashboard.logistique.bls.colFichier'),
                                value: v.fichierReference || '—',
                              },
                            ]}
                            actions={
                              v.fichierLogistiqueId && (
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/dashboard/logistique/fichiers/${v.fichierLogistiqueId}`}
                                  >
                                    <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                                    {t('actions.view')}
                                  </Link>
                                </Button>
                              )
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
