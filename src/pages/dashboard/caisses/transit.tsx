import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';


/** Ancienne URL — redirige vers la liste des caisses. */
export default function LegacyCaisseTransitRedirect() {
  const { t } = useTranslation();
  const router = useRouter();
  useEffect(() => {
    void router.replace('/dashboard/caisses');
  }, [router]);
  return (
    <DashboardLayout>
      <PageHeader title={t('dashboard.caisses.title')} subtitle={t('common.redirecting')} />
      <PageContent>
        <p className="text-muted-foreground">{t('common.redirecting')}</p>
      </PageContent>
    </DashboardLayout>
  );
}
