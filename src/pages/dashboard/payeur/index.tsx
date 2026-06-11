import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  UserRole,
  type ITransit,
  type ICaisseListItem,
  DesignationStatus,
} from '@/types';
import {
  ArrowRight,
  Lock,
  Upload,
  Wallet,
  ShoppingCart,
  Banknote,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function PayeurDashboard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isPayeur = user?.role === UserRole.USER_PAYEUR;

  const [transits, setTransits] = useState<ITransit[]>([]);
  const [caisse, setCaisse] = useState<ICaisseListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'loading' && user && !isPayeur) {
      void router.replace('/dashboard');
    }
  }, [status, user, isPayeur, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [transitsRes, caisseRes] = await Promise.all([
        fetch('/api/transit/disponibles', { credentials: 'include' }).then(
          (r) => r.json()
        ),
        fetch('/api/caisse/caisses?mine=1', { credentials: 'include' }).then(
          (r) => r.json()
        ),
      ]);
      if (transitsRes.success) setTransits(transitsRes.data || []);
      if (caisseRes.success) {
        const own = (caisseRes.data || [])[0];
        setCaisse(own || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPayeur) void reload();
  }, [isPayeur, reload]);

  const counts = useMemo(() => {
    let libres = 0;
    let mesReservees = 0;
    let mesPayees = 0;
    let mesValidees = 0;
    for (const t of transits) {
      for (const d of t.designations || []) {
        if (d.statutDesignation === DesignationStatus.LIBRE) libres += 1;
        else if (
          d.statutDesignation === DesignationStatus.RESERVEE &&
          String(d.payeurId || '') === user?.id
        )
          mesReservees += 1;
        else if (
          d.statutDesignation === DesignationStatus.PAYEE &&
          String(d.payeurId || '') === user?.id
        )
          mesPayees += 1;
        else if (
          (d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT ||
            d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) &&
          String(d.payeurId || '') === user?.id
        )
          mesValidees += 1;
      }
    }
    return { libres, mesReservees, mesPayees, mesValidees };
  }, [transits, user?.id]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.payeur.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isPayeur) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.payeur.title')}
        subtitle={t('dashboard.payeur.subtitle')}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<Banknote className="h-5 w-5 text-blue-600" />}
              label={t('dashboard.payeur.kpiSoldeCaisse')}
              value={`${fmt(Number(caisse?.solde ?? 0))} MRU`}
              subline={caisse?.nom || t('dashboard.payeur.kpiNotCreated')}
            />
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionCard
              title={t('dashboard.payeur.transitsAvailable')}
              description={t('dashboard.payeur.transitsListSubtitle')}
              icon={<ShoppingCart className="h-5 w-5" />}
              href="/dashboard/payeur/transits-disponibles"
              accent="#02389b"
            />
            <ActionCard
              title={t('dashboard.payeur.myCaisse')}
              description={t('dashboard.payeur.actionAlimenter')}
              icon={<Wallet className="h-5 w-5" />}
              href="/dashboard/caisses/mine"
              accent="#16a34a"
            />
            <ActionCard
              title={t('dashboard.payeur.credits')}
              description={t('dashboard.payeur.creditsDesc')}
              icon={<TrendingUp className="h-5 w-5" />}
              href="/dashboard/caisses/mine?type=CREDIT"
              accent="#16a34a"
            />
            <ActionCard
              title={t('dashboard.payeur.debits')}
              description={t('dashboard.payeur.debitsDesc')}
              icon={<TrendingDown className="h-5 w-5" />}
              href="/dashboard/caisses/mine?type=DEBIT"
              accent="#dc2626"
            />
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}

function Kpi({
  icon,
  label,
  value,
  subline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subline: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{subline}</div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title,
  description,
  icon,
  href,
  accent,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  accent: string;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-t-4 transition-shadow hover:shadow-md" style={{ borderTopColor: accent }}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2 text-foreground">{icon}</div>
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={href}>
            {t('dashboard.payeur.ouvrir')}
            <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
