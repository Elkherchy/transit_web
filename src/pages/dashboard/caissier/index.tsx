import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { MetricCard, type MetricCardProps } from '@/components/dashboard/MetricCard';
import {
  UserRole,
  type ICaisseListItem,
  type IJourneeCaisse,
  JourneeCaisseStatus,
} from '@/types';
import {
  Banknote,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users as UsersIcon,
  FileText,
  ArrowRightLeft,
  Lock,
} from 'lucide-react';

if (typeof Highcharts === 'object') {
  Highcharts.setOptions({
    lang: { decimalPoint: ',', thousandsSep: ' ' },
    credits: { enabled: false },
  });
}

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

interface DashboardData {
  caisseGenerale: ICaisseListItem | null;
  journee: IJourneeCaisse | null;
  recentJournees: IJourneeCaisse[];
}

export default function CaissierDashboardPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const isCaissier =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  const [data, setData] = useState<DashboardData>({
    caisseGenerale: null,
    journee: null,
    recentJournees: [],
  });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [caisseRes, journeeRes, journeesRes] = await Promise.all([
        fetch('/api/caisse/caisses', { credentials: 'include' }).then((r) =>
          r.json()
        ),
        fetch('/api/journee/current', { credentials: 'include' }).then((r) =>
          r.json()
        ),
        fetch('/api/journee?limit=14', { credentials: 'include' }).then((r) =>
          r.json()
        ),
      ]);
      setData({
        caisseGenerale: caisseRes.success
          ? (caisseRes.data || [])[0] || null
          : null,
        journee: journeeRes.success ? journeeRes.data : null,
        recentJournees: journeesRes.success
          ? (journeesRes.data || []).slice(0, 14)
          : [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCaissier) void reload();
  }, [isCaissier, reload]);

  const totalAlimentationsJour = (data.journee?.alimentationsPayeurs || []).reduce(
    (s, a) => s + (a.montant || 0),
    0
  );
  const totalDepotsJour = (data.journee?.alimentationsAdmin || []).reduce(
    (s, a) => s + (a.montant || 0),
    0
  );
  const nbPayeursAlimentes = useMemo(() => {
    const set = new Set<string>(
      (data.journee?.alimentationsPayeurs || []).map((a) => String(a.payeurId))
    );
    return set.size;
  }, [data.journee]);

  // Tendance 7 derniers jours (alimentations payeurs / dépôts admin).
  const trendChartOptions = useMemo<Highcharts.Options>(() => {
    const days: { key: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
        }),
      });
    }
    const aliments = days.map((day) => {
      const j = data.recentJournees.find(
        (x) => new Date(x.date).toISOString().slice(0, 10) === day.key
      );
      if (!j) return 0;
      return (j.alimentationsPayeurs || []).reduce(
        (s, a) => s + (a.montant || 0),
        0
      );
    });
    const depots = days.map((day) => {
      const j = data.recentJournees.find(
        (x) => new Date(x.date).toISOString().slice(0, 10) === day.key
      );
      if (!j) return 0;
      return (j.alimentationsAdmin || []).reduce(
        (s, a) => s + (a.montant || 0),
        0
      );
    });

    return {
      chart: {
        type: 'column',
        height: 280,
        backgroundColor: 'transparent',
        style: { fontFamily: 'inherit' },
      },
      title: { text: undefined },
      xAxis: {
        categories: days.map((d) => d.label),
        labels: { style: { fontSize: '11px' } },
      },
      yAxis: {
        title: { text: 'MRU' },
        labels: {
          formatter() {
            return Number(this.value).toLocaleString('fr-FR');
          },
        },
      },
      legend: { itemStyle: { fontSize: '12px' } },
      plotOptions: {
        column: { borderWidth: 0, borderRadius: 4, pointPadding: 0.05 },
      },
      tooltip: {
        shared: true,
        valueDecimals: 2,
        valueSuffix: ' MRU',
      },
      series: [
        {
          type: 'column',
          name: t('dashboard.caissier.charts.depotsAdmin'),
          data: depots,
          color: '#16a34a',
        },
        {
          type: 'column',
          name: t('dashboard.caissier.charts.alimentationsPayeurs'),
          data: aliments,
          color: '#dc2626',
        },
      ],
    };
  }, [data.recentJournees, t]);

  // Donut : répartition des alimentations payeurs du jour par payeur.
  const donutChartOptions = useMemo<Highcharts.Options>(() => {
    const map = new Map<string, number>();
    for (const a of data.journee?.alimentationsPayeurs || []) {
      const k = String(a.payeurId);
      map.set(k, (map.get(k) || 0) + (a.montant || 0));
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    const dataPoints =
      total > 0
        ? Array.from(map.entries()).map(([k, v]) => ({
            name: `${t('dashboard.caissier.charts.payeurLabel')} ${k.slice(-6)}`,
            y: v,
          }))
        : [{ name: t('dashboard.caissier.charts.noneLabel'), y: 1, color: '#e8ecf1' }];

    return {
      chart: {
        type: 'pie',
        height: 280,
        backgroundColor: 'transparent',
        style: { fontFamily: 'inherit' },
      },
      title: { text: undefined },
      tooltip: {
        enabled: total > 0,
        valueDecimals: 2,
        valueSuffix: ' MRU',
      },
      plotOptions: {
        pie: {
          innerSize: '60%',
          dataLabels: {
            enabled: total > 0,
            format: '{point.name}<br/><b>{point.percentage:.1f}%</b>',
            style: { fontSize: '11px' },
          },
          showInLegend: false,
        },
      },
      series: [
        {
          type: 'pie',
          name: t('dashboard.caissier.kpi.alimentations'),
          data: dataPoints,
        },
      ],
    };
  }, [data.journee, t]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isCaissier) {
    void router.replace('/dashboard');
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.title')} />
        <PageContent>
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        </PageContent>
      </DashboardLayout>
    );
  }

  const isClosed =
    data.journee?.statut &&
    data.journee.statut !== JourneeCaisseStatus.OUVERTE;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.title')}
        subtitle={
          data.journee
            ? `${t('dashboard.journees.detailTitle', { date: new Date(data.journee.date).toLocaleDateString('fr-FR') })} · ${data.journee.statut}`
            : t('dashboard.caissier.subtitle')
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<Banknote className="h-5 w-5 text-blue-600" />}
              label={t('dashboard.caissier.kpi.soldeGenerale')}
              value={`${fmt(Number(data.caisseGenerale?.solde ?? 0))} MRU`}
              subline={data.caisseGenerale?.nom || '—'}
              tone="neutral"
            />
            <KpiCard
              icon={<ArrowDownToLine className="h-5 w-5 text-green-600" />}
              label={t('dashboard.caissier.kpi.depotsAdmin')}
              value={`+${fmt(totalDepotsJour)} MRU`}
              subline={t('dashboard.caissier.kpi.depotsCount', {
                count: (data.journee?.alimentationsAdmin || []).length,
              })}
              tone="pos"
            />
            <KpiCard
              icon={<ArrowUpFromLine className="h-5 w-5 text-red-600" />}
              label={t('dashboard.caissier.kpi.alimentations')}
              value={`−${fmt(totalAlimentationsJour)} MRU`}
              subline={t('dashboard.caissier.kpi.alimentationsCount', {
                count: (data.journee?.alimentationsPayeurs || []).length,
              })}
              tone="neg"
            />
            <KpiCard
              icon={<UsersIcon className="h-5 w-5 text-violet-600" />}
              label={t('dashboard.caissier.kpi.payeursAlimentes')}
              value={String(nbPayeursAlimentes)}
              subline={t('dashboard.caissier.kpi.dossiersActifs', {
                count: data.journee?.transitsTraitesIds?.length ?? 0,
              })}
              tone="neutral"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg bg-white p-4 border shadow-sm lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {t('dashboard.caissier.charts.activity7d')}
              </h3>
              <HighchartsReact
                highcharts={Highcharts}
                options={trendChartOptions}
              />
            </div>
            <div className="rounded-lg bg-white p-4 border shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                {t('dashboard.caissier.charts.repartitionPayeur')}
              </h3>
              <HighchartsReact
                highcharts={Highcharts}
                options={donutChartOptions}
              />
            </div>
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subline: string;
  tone: 'pos' | 'neg' | 'neutral';
}

function KpiCard({ icon, label, value, subline, tone }: KpiCardProps) {
  const toneCls =
    tone === 'pos'
      ? 'text-green-700'
      : tone === 'neg'
        ? 'text-red-700'
        : 'text-foreground';
  return (
    <div className="rounded-lg bg-white p-4 border shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneCls}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{subline}</div>
    </div>
  );
}
