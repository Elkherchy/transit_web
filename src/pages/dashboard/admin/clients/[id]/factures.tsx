import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { ClientSubNav } from '@/components/dashboard/admin/clients/ClientSubNav';
import { useClientDetail } from '@/components/dashboard/admin/clients/useClientDetail';
import { type IFacture, FactureStatus, UserRole } from '@/types';
import { isAdminTransit } from '@/lib/roles';
import { ArrowLeft, Printer, RefreshCcw } from 'lucide-react';

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

  const [printFacture, setPrintFacture] = useState<IFacture | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const w = window.open('', '_blank', 'width=600,height=500');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Facture</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #000; }
        h2 { font-size: 18px; margin-bottom: 24px; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        td, th { border: 1px solid #000; padding: 10px 14px; font-size: 14px; }
        th { background: #f0f0f0; font-weight: bold; }
        .total { font-size: 16px; font-weight: bold; }
        @media print { body { padding: 20px; } }
      </style></head><body>`);
    w.document.write(printRef.current.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

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
        meta: { hideInMobileList: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.dateEmission
              ? new Date(row.original.dateEmission).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: '',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={() => setPrintFacture(row.original)}
          >
            <Printer className="me-1.5 h-3.5 w-3.5" />
            {t('actions.print')}
          </Button>
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
      {/* ── Print dialog ── */}
      <Dialog open={!!printFacture} onOpenChange={(o) => { if (!o) setPrintFacture(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" />
              {t('dashboard.clients.factures.printTitle')}
            </DialogTitle>
          </DialogHeader>

          {/* Hidden printable content */}
          <div ref={printRef} className="hidden">
            <h2>
              {data?.client.nom} — {t('dashboard.clients.factures.printTitle')}
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>{t('dashboard.clients.factures.printColFichierId')}</th>
                  <th style={{ textAlign: 'left' }}>{t('dashboard.clients.factures.printColFactureId')}</th>
                  <th style={{ textAlign: 'left' }}>{t('dashboard.clients.factures.printColObjet')}</th>
                  <th style={{ textAlign: 'right' }}>{t('dashboard.clients.factures.printColTotal')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{printFacture?.bl || '—'}</td>
                  <td>{printFacture?.numero || '—'}</td>
                  <td>{printFacture?.transitObjet || printFacture?.bl || '—'}</td>
                  <td className="total" style={{ textAlign: 'right' }}>
                    {fmt(printFacture?.totalFinal ?? 0)} MRU
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Preview */}
          <div className="space-y-0 rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.clients.factures.printColFichierId')}
              </span>
              <span className="font-mono font-semibold">{printFacture?.bl || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.clients.factures.printColFactureId')}
              </span>
              <span className="font-mono font-semibold">{printFacture?.numero || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.clients.factures.printColObjet')}
              </span>
              <span className="font-semibold max-w-[60%] text-right">
                {printFacture?.transitObjet || printFacture?.bl || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('dashboard.clients.factures.printColTotal')}
              </span>
              <span className="font-bold text-lg tabular-nums text-primary">
                {fmt(printFacture?.totalFinal ?? 0)} MRU
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPrintFacture(null)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="me-2 h-4 w-4" />
              {t('actions.print')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
