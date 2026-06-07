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
import {
  UserRole,
  VoyageStatus,
  type IVoyage,
  type ICaisseListItem,
} from '@/types';
import {
  ArrowRight,
  Truck,
  Wallet,
  CheckCircle2,
  Clock,
  Hourglass,
  RefreshCcw,
} from 'lucide-react';

interface VoyageRow extends IVoyage {
  fichier?: { _id: string; reference: string; date: Date };
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function ChauffeurDashboard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isChauffeur = user?.role === UserRole.CHAUFFEUR;

  const [voyages, setVoyages] = useState<VoyageRow[]>([]);
  const [caisse, setCaisse] = useState<ICaisseListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isChauffeur) {
      void router.replace('/dashboard');
    }
  }, [status, user, isChauffeur, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [voyRes, caiRes] = await Promise.all([
        fetch('/api/logistique/mes-voyages', { credentials: 'include' }).then(
          (r) => r.json()
        ),
        fetch('/api/caisse/caisses?mine=1', { credentials: 'include' }).then(
          (r) => r.json()
        ),
      ]);
      if (voyRes.success) setVoyages(voyRes.data || []);
      else setError(voyRes.error || t('common.error'));
      if (caiRes.success) {
        const own = (caiRes.data || [])[0];
        setCaisse(own || null);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isChauffeur) void reload();
  }, [isChauffeur, reload]);

  const stats = useMemo(() => {
    const uid = user?.id;
    let dispo = 0;
    let enCours = 0;
    let retournes = 0;
    let valides = 0;
    let commGagnee = 0;
    let commPayee = 0;
    let commAttente = 0;

    for (const v of voyages) {
      const isMine = String(v.chauffeurId || '') === uid;
      const m = Number(v.commissionChauffeur) || 0;

      if (v.statutVoyage === VoyageStatus.CREE) {
        dispo += 1;
      } else if (isMine) {
        if (v.statutVoyage === VoyageStatus.EN_COURS) enCours += 1;
        else if (v.statutVoyage === VoyageStatus.RETOURNE) {
          retournes += 1;
          commGagnee += m;
          if (v.commissionPaidAt) commPayee += m;
          else commAttente += m;
        } else if (v.statutVoyage === VoyageStatus.VALIDE) {
          valides += 1;
          commGagnee += m;
          if (v.commissionPaidAt) commPayee += m;
          else commAttente += m;
        }
      }
    }

    return {
      dispo,
      enCours,
      retournes,
      valides,
      commGagnee,
      commPayee,
      commAttente,
    };
  }, [voyages, user?.id]);

  const recentVoyages = useMemo(() => {
    const uid = user?.id;
    return voyages
      .filter((v) => String(v.chauffeurId || '') === uid)
      .sort((a, b) => {
        const da = new Date(a.scanDepartAt || a.date).getTime();
        const db = new Date(b.scanDepartAt || b.date).getTime();
        return db - da;
      })
      .slice(0, 5);
  }, [voyages, user?.id]);

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

  if (!isChauffeur) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.greeting', { name: user?.name || '' })}
        subtitle={t('dashboard.chauffeur.subtitle')}
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
        <div className="space-y-4 max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* KPIs caisse */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label={t('dashboard.chauffeur.kpi.soldeCaisse')}
              value={`${fmt(caisse?.solde ?? 0)} MRU`}
              Icon={Wallet}
              accent="emerald"
              cta={{
                label: t('dashboard.chauffeur.viewMyCaisse'),
                href: '/dashboard/chauffeur/caisse',
              }}
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.commissionsAPayer')}
              value={`${fmt(stats.commAttente)} MRU`}
              Icon={Hourglass}
              accent="amber"
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.commissionsPayees')}
              value={`${fmt(stats.commPayee)} MRU`}
              Icon={CheckCircle2}
              accent="slate"
            />
          </div>

          {/* KPIs voyages */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              label={t('dashboard.chauffeur.kpi.disponibles')}
              value={String(stats.dispo)}
              Icon={Truck}
              accent="blue"
              cta={{
                label: t('dashboard.chauffeur.view'),
                href: '/dashboard/logistique/mes-voyages',
              }}
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.enCours')}
              value={String(stats.enCours)}
              Icon={Clock}
              accent="violet"
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.retournes')}
              value={String(stats.retournes)}
              Icon={CheckCircle2}
              accent="emerald"
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.valides')}
              value={String(stats.valides)}
              Icon={CheckCircle2}
              accent="green"
            />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/dashboard/logistique/mes-voyages"
              className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 rounded-lg"
            >
              <Card className="transition-shadow group-hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {t('nav.items.mesVoyages')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('dashboard.chauffeur.shortcuts.mesVoyagesDesc')}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </CardContent>
              </Card>
            </Link>
            <Link
              href="/dashboard/chauffeur/caisse"
              className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 rounded-lg"
            >
              <Card className="transition-shadow group-hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {t('nav.items.maCaisse')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('dashboard.chauffeur.shortcuts.maCaisseDesc')}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Voyages récents */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-primary">
                {t('dashboard.chauffeur.voyagesRecents')}
              </h3>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/logistique/mes-voyages">
                  {t('dashboard.chauffeur.viewAll')}
                  <ArrowRight className="ml-1 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
            </div>

            {recentVoyages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.chauffeur.noVoyages')}
              </p>
            ) : (
              <ul className="divide-y">
                {recentVoyages.map((v) => (
                  <li
                    key={String(v._id)}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {v.clientSource || '—'}{' '}
                        {v.bl ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            · BL {v.bl}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(v.date).toLocaleDateString('fr-FR')} ·{' '}
                        {t(`voyageStatus.${v.statutVoyage || 'CREE'}`, {
                          defaultValue: v.statutVoyage || '—',
                        })}{' '}
                        {v.matricule ? `· ${v.matricule}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {fmt(Number(v.commissionChauffeur || 0))} MRU
                      </div>
                      {v.commissionPaidAt ? (
                        <div className="text-[10px] text-emerald-700 uppercase tracking-wide">
                          {t('dashboard.chauffeur.commissionPaid')}
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-700 uppercase tracking-wide">
                          {t('dashboard.chauffeur.commissionPending')}
                        </div>
                      )}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/logistique/mes-voyages/${v._id}`}
                      >
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
  cta,
}: {
  label: string;
  value: string;
  Icon: typeof Truck;
  accent: keyof typeof ACCENTS;
  cta?: { label: string; href: string };
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
        {cta && (
          <Link
            href={cta.href}
            className="mt-auto inline-flex items-center text-xs font-medium text-blue-600 hover:underline"
          >
            {cta.label}
            <ArrowRight className="ml-1 h-3 w-3 rtl:rotate-180" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
