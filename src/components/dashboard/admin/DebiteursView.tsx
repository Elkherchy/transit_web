import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  SearchInput,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DataTable,
  type DataTableColumnMeta,
} from '@/components/ui/data-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { UserRole } from '@/types';
import { AlertCircle, RefreshCcw, Users } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

export interface DebiteurRow {
  /** Identifiant logique (clientId pour transit, nom pour logistique). */
  key: string;
  clientNom: string;
  totalFacture: number;
  totalPaye: number;
  soldeDu: number;
  nbDocs: number;
  derniereDate?: Date | string;
}

interface Props {
  endpoint: string;
  allowedRoles: UserRole[];
  titleKey: string;
  subtitleKey: string;
  /** Libellé colonne "Total facturé" → varie selon domaine (factures vs bons). */
  totalColKey: string;
  /** Libellé colonne nb documents (factures / bons). */
  countColKey: string;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function DebiteursView({
  endpoint,
  allowedRoles,
  titleKey,
  subtitleKey,
  totalColKey,
  countColKey,
}: Props) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && allowedRoles.includes(user.role as UserRole);

  const [rows, setRows] = useState<DebiteurRow[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (search.trim()) params.set('search', search.trim());
      if (includeZero) params.set('includeZero', '1');
      const url = `${endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      if (data.success) {
        // Normalise les 2 formes (transit vs logistique) en DebiteurRow.
        const raw = (data.data || []) as Array<Record<string, unknown>>;
        const normalized: DebiteurRow[] = raw.map((d) => ({
          key:
            (d.clientId as string) ||
            (d.clientNom as string) ||
            String(d._id || ''),
          clientNom: String(d.clientNom || '—'),
          totalFacture: Number(d.totalFacture ?? d.totalBons ?? 0),
          totalPaye: Number(d.totalPaye || 0),
          soldeDu: Number(d.soldeDu || 0),
          nbDocs: Number(d.nbFactures ?? d.nbBons ?? 0),
          derniereDate: (d.derniereFactureDate ||
            d.derniereBonDate) as Date | string | undefined,
        }));
        setRows(normalized);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [isAllowed, endpoint, search, includeZero, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalDu = useMemo(
    () => rows.reduce((s, r) => s + (r.soldeDu || 0), 0),
    [rows]
  );

  const columns = useMemo<ColumnDef<DebiteurRow>[]>(
    () => [
      {
        id: 'client',
        header: t('dashboard.debiteurs.colClient'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.clientNom}</span>
        ),
      },
      {
        id: 'totalFacture',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t(totalColKey),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmt(row.original.totalFacture)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'totalPaye',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.debiteurs.colTotalPaye'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-emerald-700">
            {fmt(row.original.totalPaye)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'soldeDu',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.debiteurs.colSoldeDu'),
        cell: ({ row }) => (
          <span
            className={
              row.original.soldeDu > 0
                ? 'text-sm font-semibold tabular-nums text-red-700'
                : 'text-sm tabular-nums text-muted-foreground'
            }
          >
            {fmt(row.original.soldeDu)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'nbDocs',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t(countColKey),
        cell: ({ row }) => (
          <Badge variant="secondary" className="tabular-nums">
            {row.original.nbDocs}
          </Badge>
        ),
      },
      {
        id: 'derniereDate',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.debiteurs.colDerniereDate'),
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.derniereDate
              ? new Date(row.original.derniereDate).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
    ],
    [t, totalColKey, countColKey]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t(titleKey)} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t(titleKey)}
        subtitle={t(subtitleKey)}
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

        {/* KPI : total dû global */}
        <Card className="mb-4 border-red-200 bg-red-50/40 dark:bg-red-950/20">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              {t('dashboard.debiteurs.totalDuLabel')}
            </span>
            <span className="text-2xl font-bold tabular-nums text-red-700">
              {fmt(totalDu)} {t('common.mru')}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              placeholder={t('dashboard.debiteurs.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onSearch={(v) => setSearch(v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput);
              }}
              className="w-full sm:max-w-sm"
            />
            <div className="flex items-center gap-2">
              <Switch
                id="includeZero"
                checked={includeZero}
                onCheckedChange={setIncludeZero}
              />
              <Label htmlFor="includeZero" className="text-sm cursor-pointer">
                {t('dashboard.debiteurs.includeZeroLabel')}
              </Label>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {rows.length === 0 ? (
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title={t('dashboard.debiteurs.empty')}
                description={t('dashboard.debiteurs.emptyDescription')}
              />
            ) : (
              <ResponsiveTableArea
                table={<DataTable columns={columns} data={rows} />}
                mobileList={
                  <div className="space-y-3">
                    {rows.map((r) => (
                      <MobileEntityCard
                        key={r.key}
                        title={r.clientNom}
                        subtitle={`${fmt(r.soldeDu)} ${t('common.mru')}`}
                        fields={[
                          {
                            label: t(totalColKey),
                            value: `${fmt(r.totalFacture)} ${t('common.mru')}`,
                          },
                          {
                            label: t('dashboard.debiteurs.colTotalPaye'),
                            value: `${fmt(r.totalPaye)} ${t('common.mru')}`,
                          },
                          {
                            label: t('dashboard.debiteurs.colSoldeDu'),
                            value: `${fmt(r.soldeDu)} ${t('common.mru')}`,
                          },
                          {
                            label: t(countColKey),
                            value: String(r.nbDocs),
                          },
                        ]}
                      />
                    ))}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
