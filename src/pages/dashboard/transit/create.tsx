import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import TransitDossierForm from '@/components/transit/TransitDossierForm';

export default function TransitCreatePage() {
  const isMobile = useIsMobile();
  return (
    <DashboardLayout>
      <PageHeader title="Nouveau dossier transit" subtitle="Création" sticky={isMobile} />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <TransitDossierForm mode="create" />
      </PageContent>
    </DashboardLayout>
  );
}
