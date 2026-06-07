import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import CaisseTransactionsPanel from '@/components/caisse/CaisseTransactionsPanel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ICaisseListItem,
  IVoyage,
  UserRole,
  VoyageStatus,
} from '@/types';
import { ArrowLeft, Wallet, CheckCircle2, Hourglass } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function ChauffeurCaissePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: session, status } = useSession();
  const user = session?.user;
  const isChauffeur = user?.role === UserRole.CHAUFFEUR;

  const [caisse, setCaisse] = useState<ICaisseListItem | null | undefined>(
    undefined
  );
  const [voyages, setVoyages] = useState<IVoyage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isChauffeur) {
      void router.replace('/dashboard');
    }
  }, [status, user, isChauffeur, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !isChauffeur) return;
    let cancelled = false;
    (async () => {
      try {
        const [caiRes, voyRes] = await Promise.all([
          fetch('/api/caisse/caisses?mine=1', { credentials: 'include' }).then(
            (r) => r.json()
          ),
          fetch('/api/logistique/mes-voyages', { credentials: 'include' }).then(
            (r) => r.json()
          ),
        ]);
        if (cancelled) return;
        if (caiRes.success) {
          setCaisse(caiRes.data?.[0] ?? null);
        } else {
          setError(caiRes.error || t('common.error'));
          setCaisse(null);
        }
        if (voyRes.success) setVoyages(voyRes.data || []);
      } catch {
        if (!cancelled) {
          setError(t('common.errorNetwork'));
          setCaisse(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isChauffeur, t]);

  const stats = useMemo(() => {
    const uid = user?.id;
    let gagne = 0;
    let paye = 0;
    let attente = 0;
    for (const v of voyages) {
      if (String(v.chauffeurId || '') !== uid) continue;
      if (
        v.statutVoyage !== VoyageStatus.RETOURNE &&
        v.statutVoyage !== VoyageStatus.VALIDE
      ) {
        continue;
      }
      const m = Number(v.commissionChauffeur) || 0;
      gagne += m;
      if (v.commissionPaidAt) paye += m;
      else attente += m;
    }
    return { gagne, paye, attente };
  }, [voyages, user?.id]);

  if (status === 'loading' || !user) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isChauffeur) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} />
        <PageContent>
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        </PageContent>
      </DashboardLayout>
    );
  }

  const backButton = (
    <Button variant="outline" size="sm" asChild>
      <Link href="/dashboard/chauffeur">
        <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
        {t('dashboard.title')}
      </Link>
    </Button>
  );

  if (caisse === undefined) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} backButton={backButton} />
        <PageContent>
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (error && !caisse) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} backButton={backButton} />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!caisse) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} backButton={backButton} />
        <PageContent>
          <Alert>
            <AlertDescription>
              {t('dashboard.caisseMine.noCaisse')}
            </AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  const subtitle = t('dashboard.caisseMine.subtitle', {
    solde: fmt(caisse.solde),
  });

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caisseMine.titleAlt')}
        subtitle={subtitle}
        backButton={backButton}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'} className="max-w-full">
        <div className="space-y-4 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label={t('dashboard.chauffeur.kpi.soldeCaisse')}
              value={`${fmt(caisse.solde)} MRU`}
              Icon={Wallet}
              accent="emerald"
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.commissionsAPayer')}
              value={`${fmt(stats.attente)} MRU`}
              Icon={Hourglass}
              accent="amber"
            />
            <Kpi
              label={t('dashboard.chauffeur.kpi.commissionsPayees')}
              value={`${fmt(stats.paye)} MRU`}
              Icon={CheckCircle2}
              accent="slate"
            />
          </div>

          <CaisseTransactionsPanel
            caisseId={caisse._id}
            title={caisse.nom}
            subtitle={subtitle}
            backHref="/dashboard/chauffeur"
            hideBack
            hidePanelHeading
          />
        </div>
      </PageContent>
    </DashboardLayout>
  );
}

const ACCENTS = {
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
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
  Icon: typeof Wallet;
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
