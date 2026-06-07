import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { UserRole } from '@/types';
import { Eye, MoreHorizontal, History, RefreshCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChauffeurPaiementRow {
  chauffeurId: string;
  nom: string;
  email: string;
  telephone?: string;
  caisseId?: string;
  soldeCaisse: number;
  nbVoyagesAPayer: number;
  totalAPayer: number;
  totalDejaPaye: number;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function PaiementsChauffeursList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;

  const [rows, setRows] = useState<ChauffeurPaiementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/logistique/paiements-chauffeurs', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows(r.data || []);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const columns = useMemo<ColumnDef<ChauffeurPaiementRow>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: t('dashboard.paiementsChauffeurs.colChauffeur'),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{row.original.nom}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.email}
            </div>
          </div>
        ),
      },
      {
        id: 'voyages',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colVoyagesAPayer'),
        cell: ({ row }) => {
          const n = row.original.nbVoyagesAPayer;
          return (
            <div className="flex items-center justify-end gap-2">
              <Badge
                className={
                  n > 0
                    ? 'bg-amber-500 text-white hover:bg-amber-500'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-200'
                }
              >
                {t('dashboard.paiementsChauffeurs.voyagesCount', { count: n })}
              </Badge>
            </div>
          );
        },
      },
      {
        id: 'total',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colMontantAPayer'),
        cell: ({ row }) => (
          <span
            className={
              row.original.totalAPayer > 0
                ? 'text-sm font-semibold tabular-nums text-amber-700'
                : 'text-sm tabular-nums text-muted-foreground'
            }
          >
            {fmt(row.original.totalAPayer)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'solde',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colSoldeCaisse'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {fmt(row.original.soldeCaisse)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'paye',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colDejaPaye'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmt(row.original.totalDejaPaye)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colActions'),
        cell: ({ row }) => {
          const cid = row.original.chauffeurId;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">
                    {t('dashboard.paiementsChauffeurs.colActions')}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>
                  {t('dashboard.paiementsChauffeurs.colActions')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/logistique/paiements-chauffeurs/${cid}`}>
                    <Eye className="mr-2 h-4 w-4 rtl:rotate-180" />
                    {row.original.nbVoyagesAPayer > 0
                      ? t('dashboard.paiementsChauffeurs.actionPayer')
                      : t('dashboard.paiementsChauffeurs.actionDetail')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={`/dashboard/logistique/paiements-chauffeurs/${cid}/historique`}
                  >
                    <History className="mr-2 h-4 w-4 rtl:rotate-180" />
                    {t('dashboard.paiementsChauffeurs.actionHistorique')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.paiementsChauffeurs.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const totalAPayerGlobal = rows.reduce((s, r) => s + r.totalAPayer, 0);
  const nbActifs = rows.filter((r) => r.nbVoyagesAPayer > 0).length;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.paiementsChauffeurs.title')}
        subtitle={t('dashboard.paiementsChauffeurs.subtitleSummary', { nbActifs, total: fmt(totalAPayerGlobal) })}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2 rtl:sm:ml-2 rtl:sm:mr-0" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 max-w-7xl mx-auto rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CardHeader className="text-base font-semibold text-primary p-0">
            {t('dashboard.paiementsChauffeurs.cardTitle', { count: rows.length })}
          </CardHeader>
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage={t('dashboard.paiementsChauffeurs.empty')}
          />
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
