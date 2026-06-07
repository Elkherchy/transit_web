import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { ManutentionDataTable } from '@/components/dashboard/admin/manutention/data-table';
import type { ManutentionRow } from '@/components/dashboard/admin/manutention/columns';
import { UserRole } from '@/types';
import { RefreshCcw } from 'lucide-react';

/**
 * Liste des factures manutention pour le caissier — lecture seule.
 * (La création est désormais réservée à l'admin.)
 */
export default function CaissierFacturesManutentionList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isCaissier =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  const [rows, setRows] = useState<ManutentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isCaissier) {
      void router.replace('/dashboard');
    }
  }, [status, user, isCaissier, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/manutention?limit=100', {
        credentials: 'include',
      });
      const d = await r.json();
      if (d.success) {
        setRows(d.data?.data || []);
      } else {
        setError(d.error || t('dashboard.caissier.facturesManutention.list.errorLoad'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isCaissier) void reload();
  }, [isCaissier, reload]);

  if (status === 'loading' || (!isCaissier && status !== 'authenticated')) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.facturesTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isCaissier) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.facturesTitle')}
        subtitle={t('dashboard.caissier.facturesSubtitle')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <CardHeader className="text-xl font-bold text-primary p-0">
            {t('dashboard.caissier.facturesTitle')} ({rows.length})
          </CardHeader>
          {loading ? (
            <PageSkeleton type="list" rows={6} />
          ) : (
            <ManutentionDataTable
              data={rows}
              detailLinkBase="/dashboard/caissier/factures-manutention"
            />
          )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
