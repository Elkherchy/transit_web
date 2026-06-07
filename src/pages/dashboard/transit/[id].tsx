import { useEffect } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';

/**
 * Ancienne URL /dashboard/transit/:id → consultation /dashboard/transit/details?id=…
 */
export default function TransitLegacyIdRedirect() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { id } = router.query;

  useEffect(() => {
    if (!router.isReady || !id || typeof id !== 'string') return;
    void router.replace({ pathname: '/dashboard/transit/details', query: { id } });
  }, [router, id]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Dossier transit"
        subtitle="Redirection vers la consultation…"
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
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Redirection…</p>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
