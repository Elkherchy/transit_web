import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import TransitDossierForm from '@/components/transit/TransitDossierForm';
import { ArrowLeft } from 'lucide-react';

/**
 * Consultation : `/dashboard/transit/details?id=…`
 * L’édition se fait depuis la liste (menu Actions → Modifier).
 */
export default function TransitDetailsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const rawId = router.query.id;
  const transitId =
    typeof rawId === 'string'
      ? rawId
      : Array.isArray(rawId)
        ? rawId[0]
        : undefined;

  return (
    <DashboardLayout>
      <PageHeader
        title="Dossier transit"
        subtitle="Consultation du dossier"
        sticky={isMobile}
        backButton={
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/dashboard/transit">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Liste
            </Link>
          </Button>
        }
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {router.isReady && transitId ? (
          <TransitDossierForm
            key={transitId}
            mode="edit"
            transitId={transitId}
            readOnly
            hideListHeader
          />
        ) : router.isReady ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-sm text-destructive">
            Identifiant de dossier manquant ou invalide.{' '}
            <Link href="/dashboard/transit" className="font-medium underline">
              Retour à la liste
            </Link>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Chargement…
          </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
