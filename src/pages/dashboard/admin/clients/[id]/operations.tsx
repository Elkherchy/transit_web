import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { ClientSubNav } from '@/components/dashboard/admin/clients/ClientSubNav';
import { useClientDetail } from '@/components/dashboard/admin/clients/useClientDetail';
import { type ITransaction, TransactionType, UserRole } from '@/types';
import { isAdminTransit } from '@/lib/roles';
import { ArrowLeft, Minus, RefreshCcw, Search, X as XIcon } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function AdminClientOperations() {
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

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');

  // Debit dialog
  const [showDebit, setShowDebit] = useState(false);
  const [debitMontant, setDebitMontant] = useState('');
  const [debitDesc, setDebitDesc] = useState('');
  const [debitLoading, setDebitLoading] = useState(false);
  const [debitError, setDebitError] = useState<string | null>(null);

  const isAdminOnly = user?.role === UserRole.ADMIN || user?.role === UserRole.ADMIN_TRANSIT;

  const handleDebit = async () => {
    setDebitError(null);
    const montant = Number(debitMontant);
    if (!montant || montant <= 0) { setDebitError(t('dashboard.clients.operations.debitErrMontant')); return; }
    if (!debitDesc.trim()) { setDebitError(t('dashboard.clients.operations.debitErrDesc')); return; }
    setDebitLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${id}/debit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant, description: debitDesc.trim() }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) { setDebitError(json.error ?? 'Erreur'); setDebitLoading(false); return; }
      setShowDebit(false);
      setDebitMontant('');
      setDebitDesc('');
      void reload();
    } catch {
      setDebitError(t('dashboard.clients.operations.debitErrNetwork'));
    } finally {
      setDebitLoading(false);
    }
  };

  const transactions = data?.transactions;
  const filtered = useMemo(() => {
    if (!transactions) return [] as ITransaction[];
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;
      if (!q) return true;
      return (
        t.description?.toLowerCase().includes(q) ||
        String(t.reference || '').toLowerCase().includes(q)
      );
    });
  }, [transactions, search, typeFilter]);

  const columns = useMemo<ColumnDef<ITransaction>[]>(
    () => [
      // First col = mobile card title
      {
        accessorKey: 'description',
        header: t('dashboard.clients.operations.colDescription'),
        cell: ({ row }) => {
          const tx = row.original;
          const isMouvement = String(tx.reference || '').startsWith('pending-');
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm">{tx.description}</span>
              {isMouvement && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px]">
                  Mouvement
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'montant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.clients.operations.colMontant'),
        cell: ({ row }) => (
          <span
            className={
              row.original.type === TransactionType.CREDIT
                ? 'font-semibold tabular-nums text-green-700'
                : 'font-semibold tabular-nums text-red-700'
            }
          >
            {row.original.type === TransactionType.CREDIT ? '+' : '−'}
            {fmt(row.original.montant)} MRU
          </span>
        ),
      },
      {
        accessorKey: 'date',
        header: t('dashboard.clients.operations.colDate'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {new Date(row.original.date).toLocaleString('fr-FR')}
          </span>
        ),
      },
      {
        accessorKey: 'type',
        header: t('dashboard.clients.operations.colType'),
        cell: ({ row }) => (
          <Badge
            className={`text-xs ${
              row.original.type === TransactionType.CREDIT
                ? 'bg-green-100 text-green-800 border-green-200'
                : 'bg-red-100 text-red-800 border-red-200'
            }`}
            variant="outline"
          >
            {row.original.type === TransactionType.CREDIT
              ? t('dashboard.clients.operations.typeCredit')
              : t('dashboard.clients.operations.typeDebit')}
          </Badge>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.clients.operationsLoading')} />
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
          title={t('dashboard.clients.operationsLoading')}
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
            <AlertDescription>{error || t('dashboard.clients.operations.errorFallback')}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.clients.operationsTitle', { name: data.client.nom })}
        subtitle={`${data.caisse?.nom || '—'} · ${fmt(data.caisse?.solde ?? 0)} MRU`}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/admin/clients/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.details')}
            </Link>
          </Button>
        }
        actions={
          <div className="flex items-center gap-2">
            {isAdminOnly && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { setDebitError(null); setShowDebit(true); }}
                className={isMobile ? 'h-10 px-3' : ''}
              >
                <Minus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('dashboard.clients.operations.debitBtn')}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actions.refresh')}</span>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          <ClientSubNav clientId={id} />

          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <CardHeader className="text-base font-semibold text-primary p-0">
              {t('dashboard.clients.operations.titleCount', { filtered: filtered.length, total: data.transactions.length })}
            </CardHeader>

            {/* Filtres */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('dashboard.clients.operations.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-9"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                    aria-label={t('dashboard.clients.operations.clearSearch')}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant={typeFilter === 'ALL' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTypeFilter('ALL')}
                  className="flex-1 sm:flex-none"
                >
                  {t('dashboard.clients.operations.filterAll')}
                </Button>
                <Button
                  variant={
                    typeFilter === TransactionType.CREDIT ? 'default' : 'ghost'
                  }
                  size="sm"
                  onClick={() => setTypeFilter(TransactionType.CREDIT)}
                  className="flex-1 sm:flex-none"
                >
                  {t('dashboard.clients.operations.filterCredits')}
                </Button>
                <Button
                  variant={
                    typeFilter === TransactionType.DEBIT ? 'default' : 'ghost'
                  }
                  size="sm"
                  onClick={() => setTypeFilter(TransactionType.DEBIT)}
                  className="flex-1 sm:flex-none"
                >
                  {t('dashboard.clients.operations.filterDebits')}
                </Button>
              </div>
            </div>

            <DataTable
              columns={columns}
              data={filtered}
              emptyMessage={t('dashboard.clients.operationsEmpty')}
            />
          </div>
        </div>
      </PageContent>
      {/* ── Debit dialog ── */}
      <Dialog open={showDebit} onOpenChange={(o) => { if (!debitLoading) setShowDebit(o); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-destructive" />
              {t('dashboard.clients.operations.debitTitle', { name: data?.client.nom })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="debit-montant">
                {t('dashboard.clients.operations.debitMontantLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="debit-montant"
                type="number"
                min="0.01"
                step="0.01"
                placeholder={t('dashboard.clients.operations.debitMontantPlaceholder')}
                value={debitMontant}
                onChange={(e) => setDebitMontant(e.target.value)}
                className="tabular-nums"
                disabled={debitLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debit-desc">
                {t('dashboard.clients.operations.debitDescLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="debit-desc"
                placeholder={t('dashboard.clients.operations.debitDescPlaceholder')}
                value={debitDesc}
                onChange={(e) => setDebitDesc(e.target.value)}
                disabled={debitLoading}
              />
            </div>
            {debitError && (
              <p className="text-sm text-destructive">{debitError}</p>
            )}
            {data?.caisse && (
              <p className="text-xs text-muted-foreground">
                {t('dashboard.clients.operations.debitSoldeActuel')}{' '}
                <span className="font-semibold tabular-nums">{fmt(data.caisse.solde)} MRU</span>
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDebit(false)} disabled={debitLoading}>
              {t('dashboard.clients.operations.debitCancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDebit()} disabled={debitLoading}>
              {debitLoading
                ? t('dashboard.clients.operations.debitLoading')
                : t('dashboard.clients.operations.debitConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
