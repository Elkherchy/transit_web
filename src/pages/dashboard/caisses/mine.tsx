import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import CaisseTransactionsPanel from '@/components/caisse/CaisseTransactionsPanel';
import { ICaisseListItem, UserRole } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';

export default function MonComptePayeurPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: session, status } = useSession();
  const user = session?.user;

  const [row, setRow] = useState<ICaisseListItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && user.role !== UserRole.USER_PAYEUR) {
      void router.replace('/dashboard');
    }
  }, [status, user, router]);

  useEffect(() => {
    if (
      status !== 'authenticated' ||
      user?.role !== UserRole.USER_PAYEUR
    )
      return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/caisse/caisses?mine=1', { credentials: 'include' });
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || t('common.error'));
          setRow(null);
          return;
        }
        setRow(json.data[0] ?? null);
        setError(null);
      } catch {
        if (!cancelled) {
          setError(t('common.errorNetwork'));
          setRow(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user, t]);

  if (status === 'loading' || !user) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (user.role !== UserRole.USER_PAYEUR) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.title')} />
        <PageContent>
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (row === undefined) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.title')} />
        <PageContent>
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.title')} />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!row) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisseMine.titleAlt')} />
        <PageContent>
          <div className="space-y-4 max-w-lg">
            <Alert>
              <AlertDescription>
                {t('dashboard.caisseMine.noCaisse')}
              </AlertDescription>
            </Alert>
          </div>
        </PageContent>
      </DashboardLayout>
    );
  }

  const subtitle = t('dashboard.caisseMine.subtitle', {
    solde: row.solde.toLocaleString('fr-FR'),
  });

  return (
    <DashboardLayout>
      <PageHeader
        title={`${t('dashboard.caisseMine.title')} · ${row.nom}`}
        subtitle={subtitle}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'} className="max-w-full">
        <CaisseTransactionsPanel
          caisseId={row._id}
          title={row.nom}
          subtitle={subtitle}
          backHref="/dashboard/factures"
          isPayeurOwnCaisse
          hidePanelHeading
        />
      </PageContent>
    </DashboardLayout>
  );
}
