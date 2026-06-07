import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageContent, PageHeader, PageSkeleton } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ApiResponse,
  ICaisseListItem,
  ITransaction,
  IFacture,
  FactureStatus,
  PaginatedResponse,
  TransactionType,
} from '@/types';
import { isAnyAdmin } from '@/lib/roles';
import {
  Bell,
  Home,
  Moon,
  Plus,
  Wallet,
} from 'lucide-react';

type DashboardData = {
  caisses: ICaisseListItem[];
  transactions: ITransaction[];
  factures: IFacture[];
};

function formatMRU(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: Date | string): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR');
}

function isOpenFacture(statut: FactureStatus): boolean {
  return (
    statut === FactureStatus.BROUILLON ||
    statut === FactureStatus.EMIS ||
    statut === FactureStatus.EN_VALIDATION ||
    statut === FactureStatus.EN_PAYE
  );
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>({
    caisses: [],
    transactions: [],
    factures: [],
  });

  const isAdmin = isAnyAdmin(user?.role);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const caissesRes = await fetch('/api/caisse/caisses', { credentials: 'include' });
      const caissesJson = (await caissesRes.json()) as ApiResponse<ICaisseListItem[]>;

      if (!caissesRes.ok || !caissesJson.success || !caissesJson.data) {
        throw new Error(caissesJson.error || t('common.error'));
      }

      const caisses = caissesJson.data;
      const primaryCaisse = caisses.find((caisse) => caisse.isDefaultGeneral) || caisses[0];

      const txPromise = primaryCaisse
        ? fetch(
            `/api/caisse/transactions?caisseId=${encodeURIComponent(primaryCaisse._id)}&page=1&limit=4`,
            { credentials: 'include' }
          )
        : Promise.resolve(null);

      const [txRes, facturesRes] = await Promise.all([
        txPromise,
        fetch('/api/transit/factures?page=1&limit=6', { credentials: 'include' }),
      ]);

      const txJson = txRes
        ? ((await txRes.json()) as ApiResponse<PaginatedResponse<ITransaction>>)
        : null;
      const facturesJson = (await facturesRes.json()) as ApiResponse<PaginatedResponse<IFacture>>;

      const transactions = txJson?.success ? txJson.data?.data || [] : [];
      const allFactures = facturesJson.success ? facturesJson.data?.data || [] : [];
      const facturesOpen = allFactures.filter((facture) => isOpenFacture(facture.statut)).slice(0, 4);

      setData({
        caisses,
        transactions,
        factures: facturesOpen,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.errorNetwork'));
      setData({
        caisses: [],
        transactions: [],
        factures: [],
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (status === 'authenticated' && !isAdmin) {
      void router.replace('/dashboard');
      return;
    }
    if (status === 'authenticated' && isAdmin) {
      void loadData();
    }
  }, [isAdmin, loadData, router, status]);

  const totalBalance = useMemo(
    () => data.caisses.reduce((sum, caisse) => sum + Number(caisse.solde || 0), 0),
    [data.caisses]
  );

  const metrics = useMemo(() => {
    return [
      {
        i18nKey: 'transitOuverts',
        statusKey: 'enBonneVoie',
        current: 0,
        target: 20,
      },
      {
        i18nKey: 'facturesEnCours',
        statusKey: 'enRetard',
        current: data.factures.length,
        target: Math.max(1, data.factures.length + 10),
      },
      {
        i18nKey: 'caissesActives',
        statusKey: 'enAvance',
        current: data.caisses.length,
        target: Math.max(1, data.caisses.length + 5),
      },
    ];
  }, [data.factures.length, data.caisses.length]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 9} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.admin.subtitle')}
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>
          <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            <section className="h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-primary">
                  {t('dashboard.admin.compteApercu')}
                </h2>
                <Wallet className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-3 break-words text-sm font-bold leading-tight text-slate-900 sm:text-xl">{formatMRU(totalBalance)} MRU</p>
              <p className="mt-1 text-sm text-slate-500">{t('dashboard.admin.soldeTotal')}</p>

              <div className="mt-5 space-y-2">
                {data.caisses.slice(0, 3).map((caisse) => (
                  <div key={caisse._id} className="flex items-center justify-between gap-3 text-sm sm:text-base">
                    <span className="min-w-0 truncate text-slate-700">{caisse.nom}</span>
                    <span className="shrink-0 text-right font-semibold text-slate-900">{formatMRU(caisse.solde || 0)} MRU</span>
                  </div>
                ))}
                {data.caisses.length === 0 && (
                  <p className="text-sm text-slate-500">{t('dashboard.admin.noCaisses')}</p>
                )}
              </div>

              <div className="mt-5 w-full rounded-xl bg-slate-50 p-3 sm:p-4">
                <div className="grid w-full min-w-0 grid-cols-1 gap-3">
                  <Button asChild className="h-11 w-full min-w-0 justify-center bg-[#0b1223] px-4 text-sm font-medium ">
                    <Link href="/dashboard/caisses" className="flex w-full min-w-0  items-center justify-center gap-2 text-center">
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('dashboard.admin.ajouter')}</span>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 w-full min-w-0 justify-center border-slate-300 px-4 text-sm font-medium">
                    <Link href="/dashboard/transit" className="flex w-full min-w-0 items-center justify-center gap-2 text-center">
                      <span className="truncate">{t('dashboard.admin.plus')}</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </section>

            <section className="h-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-6">
              <h2 className="text-lg font-semibold text-primary">
                {t('dashboard.admin.transactionsRecentes')}
              </h2>
              <div className="mt-5 space-y-4">
                {data.transactions.map((tx) => {
                  const outgoing = tx.type === TransactionType.DEBIT;
                  return (
                    <div key={tx._id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 sm:text-base">{tx.description}</p>
                        <p className="text-sm text-slate-500">{formatDate(tx.date)}</p>
                      </div>
                      <p className={outgoing ? 'shrink-0 text-sm font-semibold text-red-600 sm:text-base' : 'shrink-0 text-sm font-semibold text-emerald-600 sm:text-base'}>
                        {outgoing ? '-' : '+'}{formatMRU(tx.montant)} MRU
                      </p>
                    </div>
                  );
                })}
                {data.transactions.length === 0 && (
                  <p className="text-sm text-slate-500">{t('dashboard.admin.noTransactions')}</p>
                )}
              </div>
              <Button asChild variant="outline" className="mt-5 w-full border-slate-300">
                <Link href="/dashboard/caisses">{t('dashboard.admin.voirToutesTransactions')}</Link>
              </Button>
            </section>

            <section className="h-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-6 md:col-span-2 xl:col-span-1">
              <h2 className="text-lg font-semibold text-primary">
                {t('dashboard.admin.paiementRapide')}
              </h2>
              <div className="mt-5 space-y-4">
                {data.factures.map((facture) => (
                  <div key={facture._id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 sm:text-base">{facture.numero}</p>
                      <p className="text-sm text-slate-500">
                        {t('dashboard.admin.echeance')}: {formatDate(facture.dateEmission || facture.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <p className="shrink-0 text-sm font-semibold text-slate-900 sm:text-base">{formatMRU(facture.totalFinal || 0)} MRU</p>
                      <Button asChild size="sm" variant="outline" className="h-9 shrink-0 border-slate-300 px-4">
                        <Link href="/dashboard/factures">{t('dashboard.admin.payer')}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
                {data.factures.length === 0 && (
                  <p className="text-sm text-slate-500">{t('dashboard.admin.noFactures')}</p>
                )}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between py-4">
            <h2 className="text-lg md:text-xl font-semibold tracking-tight text-primary">
              {t('dashboard.admin.indicateurs')}
            </h2>
          </div>

          <div className="grid gap-5 grid-cols-1 xl:grid-cols-3">
            {metrics.map((metric) => {
              const pct = normalizeProgress((metric.current / metric.target) * 100);
              const badgeClass =
                metric.statusKey === 'enBonneVoie'
                  ? 'bg-emerald-100 text-emerald-700'
                  : metric.statusKey === 'enRetard'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700';
              return (
                <section key={metric.i18nKey} className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
                  <h3 className="text-base md:text-lg font-semibold text-primary line-clamp-2">
                    {t(`dashboard.admin.metrics.${metric.i18nKey}.title`)}
                  </h3>
                  <p className="mt-1 text-xs md:text-sm text-slate-500 line-clamp-2">
                    {t(`dashboard.admin.metrics.${metric.i18nKey}.hint`)}
                  </p>
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <Badge className={badgeClass}>
                      {t(`dashboard.admin.metricStatus.${metric.statusKey}`)}
                    </Badge>
                    <p className="text-xs md:text-sm text-slate-500 text-right">
                      {formatMRU(metric.current)} / {formatMRU(metric.target)}
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-[#0f172a]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs md:text-sm gap-2">
                    <span className="text-lg md:text-xl font-semibold text-slate-900 truncate">{formatMRU(metric.current)}</span>
                    <span className="text-slate-500 shrink-0">
                      {t('dashboard.admin.complete', { pct: pct.toFixed(0) })}
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
      </PageContent>
    </DashboardLayout>
  );
}
