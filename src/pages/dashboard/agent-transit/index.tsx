import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { MetricCard, type MetricCardProps } from '@/components/dashboard/MetricCard';
import { UserRole } from '@/types';

export default function AgentTransitDashboardPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const cards: MetricCardProps[] = [
    {
      title: t('dashboard.agentTransit.cards.transitTitle'),
      description: t('dashboard.agentTransit.cards.transitDesc'),
      value: '→',
      borderTopColor: '#02389b',
      href: '/dashboard/transit',
      voirPlusLabel: t('dashboard.agentTransit.cards.open'),
    },
    {
      title: t('dashboard.agentTransit.cards.facturesTitle'),
      description: t('dashboard.agentTransit.cards.facturesDesc'),
      value: '→',
      borderTopColor: '#4f46e5',
      href: '/dashboard/factures',
      voirPlusLabel: t('dashboard.agentTransit.cards.open'),
    },
    {
      title: t('dashboard.agentTransit.cards.profilTitle'),
      description: t('dashboard.agentTransit.cards.profilDesc'),
      value: '→',
      borderTopColor: '#9333ea',
      href: '/dashboard/profil',
      voirPlusLabel: t('dashboard.agentTransit.cards.open'),
    },
  ];

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.agentTransit.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (user?.role !== UserRole.AGENT_TRANSIT && user?.role !== UserRole.ADMIN) {
    void router.replace('/dashboard');
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.agentTransit.title')} />
        <PageContent>
          <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
            {t('dashboard.agentTransit.redirecting')}
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.agentTransit.title')}
        subtitle={t('dashboard.agentTransit.subtitle')}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 rounded-lg bg-white p-4 sm:p-6 border shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, i) => (
              <MetricCard key={`${card.href}-${i}`} {...card} />
            ))}
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
