import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { CardHeader } from '@/components/ui/card';
import { JourneesDataTable } from '@/components/dashboard/journees/data-table';
import {
  UserRole,
  type IJourneeCaisse,
  JourneeCaisseStatus,
} from '@/types';

/**
 * Ordre d'affichage : journées les plus urgentes en premier
 *   1. CLOTUREE        — à valider par l'agent transit
 *   2. VALIDEE_TRANSIT — en attente admin
 *   3. OUVERTE         — en cours côté caissier
 *   4. VALIDEE_ADMIN   — historique
 */
const STATUT_PRIORITY: Record<JourneeCaisseStatus, number> = {
  [JourneeCaisseStatus.CLOTUREE]: 0,
  [JourneeCaisseStatus.VALIDEE_TRANSIT]: 1,
  [JourneeCaisseStatus.OUVERTE]: 2,
  [JourneeCaisseStatus.VALIDEE_ADMIN]: 3,
};

export default function TransitJourneesList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;

  const [list, setList] = useState<IJourneeCaisse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/journee', { credentials: 'include' }).then(
        (x) => x.json()
      );
      if (r.success) setList(r.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const sortedList = useMemo(() => {
    const arr = [...list];
    arr.sort((a, b) => {
      const pa = STATUT_PRIORITY[a.statut] ?? 99;
      const pb = STATUT_PRIORITY[b.statut] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return arr;
  }, [list]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.transit.journees.pageTitle')} />
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
        title={t('dashboard.transit.journees.pageTitle')}
        subtitle={t('dashboard.transit.journees.pageSubtitle')}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          <CardHeader className="text-xl font-bold text-primary p-0">
            {t('dashboard.transit.journees.allJournees')} ({sortedList.length})
          </CardHeader>
          <JourneesDataTable
            data={sortedList}
            detailLinkBase="/dashboard/transit/journees"
            emptyMessage={t('dashboard.transit.journees.empty')}
          />
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
