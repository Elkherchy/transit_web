import React from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import TransitDossierForm from '@/components/transit/TransitDossierForm';
import { UserRole } from '@/types';
import { ArrowLeft } from 'lucide-react';

export default function TransitEditPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const { id } = router.query;
  const transitId = typeof id === 'string' ? id : undefined;
  const isPayeurReadOnly = session?.user?.role === UserRole.USER_PAYEUR;

  const backList = (
    <Button variant="outline" size="sm" asChild className="shrink-0">
      <Link href="/dashboard/transit">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Liste
      </Link>
    </Button>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={isPayeurReadOnly ? 'Dossier transit' : 'Modifier le dossier transit'}
        subtitle={
          isPayeurReadOnly
            ? 'Consultation du dossier (lecture seule)'
            : 'Identification, montants et pièces jointes'
        }
        backButton={backList}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {router.isReady && transitId ? (
          <TransitDossierForm
            key={transitId}
            mode="edit"
            transitId={transitId}
            readOnly={isPayeurReadOnly}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Chargement…
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
