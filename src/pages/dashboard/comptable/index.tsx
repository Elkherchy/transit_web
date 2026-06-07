import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { MetricCard, type MetricCardProps } from '@/components/dashboard/MetricCard';
import { UserRole } from '@/types';

export default function ComptableDashboardPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const cards: MetricCardProps[] = [
    {
      title: t('dashboard.comptable.cards.facturesTitle'),
      description: t('dashboard.comptable.cards.facturesDesc'),
      value: '→',
      borderTopColor: '#4f46e5',
      href: '/dashboard/factures',
      voirPlusLabel: t('dashboard.comptable.cards.open'),
    },
    {
      title: t('dashboard.comptable.cards.caissesTitle'),
      description: t('dashboard.comptable.cards.caissesDesc'),
      value: '→',
      borderTopColor: '#ca8a04',
      href: '/dashboard/caisses',
      voirPlusLabel: t('dashboard.comptable.cards.open'),
    },
    {
      title: t('dashboard.comptable.cards.transitTitle'),
      description: t('dashboard.comptable.cards.transitDesc'),
      value: '→',
      borderTopColor: '#02389b',
      href: '/dashboard/transit',
      voirPlusLabel: t('dashboard.comptable.cards.open'),
    },
  ];

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.comptable.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (user?.role !== UserRole.COMPTABLE && user?.role !== UserRole.ADMIN) {
    void router.replace('/dashboard');
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.comptable.title')} />
        <PageContent>
          <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground text-sm">
            {t('dashboard.comptable.redirecting')}
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.comptable.title')}
        subtitle={t('dashboard.comptable.subtitle')}
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
