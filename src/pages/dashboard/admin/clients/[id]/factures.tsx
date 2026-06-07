import React, { useEffect, useMemo } from 'react';
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
import { CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { ClientSubNav } from '@/components/dashboard/admin/clients/ClientSubNav';
import { useClientDetail } from '@/components/dashboard/admin/clients/useClientDetail';
import { type IFacture, FactureStatus, UserRole } from '@/types';
import { isAdminTransit } from '@/lib/roles';
import { ArrowLeft, RefreshCcw } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

function factureBadge(s: FactureStatus, t: (key: string) => string) {
  const map: Record<FactureStatus, { label: string; className: string }> = {
    [FactureStatus.BROUILLON]: { label: t('dashboard.clients.factures.statusBrouillon'), className: 'bg-gray-500 text-white' },
    [FactureStatus.EMIS]: { label: t('dashboard.clients.factures.statusEmise'), className: 'bg-blue-500 text-white' },
    [FactureStatus.EN_VALIDATION]: { label: t('dashboard.clients.factures.statusEnValidation'), className: 'bg-amber-500 text-white' },
    [FactureStatus.EN_PAYE]: { label: t('dashboard.clients.factures.statusPaiementPartiel'), className: 'bg-violet-500 text-white' },
    [FactureStatus.PAYE]: { label: t('dashboard.clients.factures.statusPayee'), className: 'bg-green-600 text-white' },
  };
  const m = map[s] || { label: s, className: '' };
  return <Badge className={`${m.className} text-xs`}>{m.label}</Badge>;
}

export default function AdminClientFactures() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAdmin =
    isAdminTransit(user?.role) || user?.role === UserRole.AGENT_TRANSIT;
  const id = String(router.query.id || '');

  useEffect(() => {
    if (status !== 'loading' && user && !isAdmin) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAdmin, router]);

  const { data, loading, error, reload } = useClientDetail(id, isAdmin);

  const columns = useMemo<ColumnDef<IFacture>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: t('dashboard.clients.factures.colNumero'),
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.numero}</span>
        ),
      },
      {
        accessorKey: 'bl',
        header: t('dashboard.clients.factures.colBl'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.bl || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'totalFinal',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.clients.factures.colTotal'),
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {fmt(row.original.totalFinal)}
          </span>
        ),
      },
      {
        accessorKey: 'statut',
        header: t('dashboard.clients.factures.colStatut'),
        cell: ({ row }) => factureBadge(row.original.statut, t),
      },
      {
        id: 'date',
        header: t('dashboard.clients.factures.colEmission'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.dateEmission
              ? new Date(row.original.dateEmission).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.clients.facturesLoading')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.clients.facturesLoading')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin/clients">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.transit.list')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error || t('dashboard.clients.factures.errorFallback')}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.clients.facturesTitle', { name: data.client.nom })}
        subtitle={t('dashboard.clients.facturesCount', { count: data.factures.length })}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/admin/clients/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.details')}
            </Link>
          </Button>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          <ClientSubNav clientId={id} />

          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <CardHeader className="text-base font-semibold text-primary p-0">
              {t('dashboard.clients.facturesCount', { count: data.factures.length })}
            </CardHeader>
            <DataTable
              columns={columns}
              data={data.factures}
              emptyMessage={t('dashboard.clients.facturesEmpty')}
            />
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
