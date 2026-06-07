import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fichierStatutBadge } from '@/components/dashboard/logistique/fichiers/columns';
import {
  UserRole,
  FichierLogistiqueStatus,
  type IFichierLogistique,
} from '@/types';
import {
  ArrowRight,
  ClipboardList,
  Plus,
  RefreshCcw,
  CheckCircle2,
  Hourglass,
  FileText,
  Truck,
} from 'lucide-react';

interface FichierRow extends IFichierLogistique {
  nbVoyages: number;
  nbReserves: number;
  nbRetournes: number;
  nbValides: number;
  totalPrixTransport: number;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function AgentReceptionLogistiqueDashboard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE ||
    user?.role === UserRole.ADMIN;

  const [rows, setRows] = useState<FichierRow[]>([]);
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
      const r = await fetch('/api/logistique/fichiers', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows(r.data || []);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const stats = useMemo(() => {
    const counts: Record<FichierLogistiqueStatus, number> = {
      [FichierLogistiqueStatus.OUVERT]: 0,
      [FichierLogistiqueStatus.PRET_VALIDATION]: 0,
      [FichierLogistiqueStatus.VALIDE]: 0,
    };
    let totalVoyages = 0;
    let totalRetournes = 0;
    let totalValides = 0;
    let totalPrix = 0;

    for (const r of rows) {
      counts[r.statut] = (counts[r.statut] || 0) + 1;
      totalVoyages += r.nbVoyages;
      totalRetournes += r.nbRetournes;
      totalValides += r.nbValides;
      totalPrix += r.totalPrixTransport;
    }

    return {
      ouverts: counts[FichierLogistiqueStatus.OUVERT],
      prets: counts[FichierLogistiqueStatus.PRET_VALIDATION],
      valides: counts[FichierLogistiqueStatus.VALIDE],
      totalVoyages,
      totalRetournes,
      totalValides,
      totalPrix,
    };
  }, [rows]);

  const recents = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 5),
    [rows]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.title')} />
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
        title={t('dashboard.greeting', { name: user?.name || '' })}
        subtitle={t('dashboard.agentReception.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actions.refresh')}</span>
            </Button>
            <Button asChild size="sm" className={isMobile ? 'h-10 px-3' : ''}>
              <Link href="/dashboard/logistique/fichiers/create">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  {t('dashboard.agentReception.newFichier')}
                </span>
                <span className="sm:hidden">{t('actions.create')}</span>
              </Link>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-4 max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* KPIs fichiers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label={t('dashboard.agentReception.kpi.ouverts')}
              value={String(stats.ouverts)}
              Icon={ClipboardList}
              accent="blue"
            />
            <Kpi
              label={t('dashboard.agentReception.kpi.aValider')}
              value={String(stats.prets)}
              Icon={Hourglass}
              accent="amber"
            />
            <Kpi
              label={t('dashboard.agentReception.kpi.valides')}
              value={String(stats.valides)}
              Icon={CheckCircle2}
              accent="green"
            />
            <Kpi
              label={t('dashboard.agentReception.kpi.totalVoyages')}
              value={String(stats.totalVoyages)}
              Icon={Truck}
              accent="violet"
            />
          </div>

          {/* KPIs voyages détail */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label={t('dashboard.agentReception.kpi.voyagesRetournes')}
              value={String(stats.totalRetournes)}
              Icon={CheckCircle2}
              accent="emerald"
            />
            <Kpi
              label={t('dashboard.agentReception.kpi.voyagesValides')}
              value={String(stats.totalValides)}
              Icon={CheckCircle2}
              accent="green"
            />
            <Kpi
              label={t('dashboard.agentReception.kpi.totalPrix')}
              value={`${fmt(stats.totalPrix)} MRU`}
              Icon={FileText}
              accent="slate"
            />
          </div>

          {/* Quick action */}
          <Link
            href="/dashboard/logistique/fichiers"
            className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 rounded-lg block"
          >
            <Card className="transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {t('dashboard.agentReception.shortcutTitle')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('dashboard.agentReception.shortcutDesc')}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
              </CardContent>
            </Card>
          </Link>

          {/* Fichiers récents */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-primary">
                {t('dashboard.agentReception.recentTitle')}
              </h3>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/logistique/fichiers">
                  {t('dashboard.chauffeur.viewAll')}
                  <ArrowRight className="ml-1 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>

            {recents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.agentReception.noFichiers')}
              </p>
            ) : (
              <ul className="divide-y">
                {recents.map((r) => (
                  <li
                    key={String(r._id)}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm">{r.reference}</span>
                        {fichierStatutBadge(r.statut, t)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString('fr-FR')} ·{' '}
                        {t('dashboard.agentReception.voyagesSummary', {
                          total: r.nbVoyages,
                          retournes: r.nbRetournes,
                          valides: r.nbValides,
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {fmt(r.totalPrixTransport)} MRU
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/logistique/fichiers/${r._id}`}>
                        {t('actions.view')}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}

const ACCENTS = {
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-green-50 text-green-700',
  slate: 'bg-slate-100 text-slate-600',
} as const;

function Kpi({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string;
  Icon: typeof Truck;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className={`rounded-md p-1.5 ${ACCENTS[accent]}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
