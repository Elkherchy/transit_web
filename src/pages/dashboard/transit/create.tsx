import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import TransitDossierForm from '@/components/transit/TransitDossierForm';
import { useTranslation } from 'react-i18next';

export default function TransitCreatePage() {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <PageHeader title={t('dashboard.transit.newTitle')} subtitle={t('dashboard.transit.newSubtitle')} sticky={isMobile} />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <TransitDossierForm mode="create" />
      </PageContent>
    </DashboardLayout>
  );
}
