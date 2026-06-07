import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManutentionDataTable } from '@/components/dashboard/admin/manutention/data-table';
import type { ManutentionRow } from '@/components/dashboard/admin/manutention/columns';
import { isAdminTransit } from '@/lib/roles';
import { UserRole } from '@/types';
import { Plus } from 'lucide-react';

export default function AdminManutentionList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAdmin = isAdminTransit(user?.role);
  const isAgent = user?.role === UserRole.AGENT_TRANSIT;
  const canAccess = isAdmin || isAgent;

  const [rows, setRows] = useState<ManutentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [validatedFilter, setValidatedFilter] = useState<string>('ALL');

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (validatedFilter === 'VALIDATED') params.set('validated', 'true');
      else if (validatedFilter === 'NOT_VALIDATED') params.set('validated', 'false');
      const r = await fetch(`/api/manutention?${params.toString()}`, {
        credentials: 'include',
      });
      const d = await r.json();
      if (d.success) setRows(d.data?.data || []);
    } finally {
      setLoading(false);
    }
  }, [validatedFilter]);

  useEffect(() => {
    if (canAccess) void fetchData();
  }, [canAccess, fetchData]);

  if (status === 'loading' || (!canAccess && status !== 'authenticated')) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.manutention.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!canAccess) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.manutention.title')}
        subtitle={t('dashboard.manutention.subtitle')}
        actions={
          <Button asChild className={isMobile ? 'h-10 px-3' : ''}>
            <Link href="/dashboard/admin/manutention/create">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.manutention.newTitle')}</span>
              <span className="sm:hidden">{t('actions.create')}</span>
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-4 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border ">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-bold text-primary sm:text-xl">
              {t('dashboard.manutention.title')}
            </span>
            <Select value={validatedFilter} onValueChange={setValidatedFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  {t('dashboard.manutention.filter.all')}
                </SelectItem>
                <SelectItem value="VALIDATED">
                  {t('dashboard.manutention.filter.validated')}
                </SelectItem>
                <SelectItem value="NOT_VALIDATED">
                  {t('dashboard.manutention.filter.notValidated')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <PageSkeleton type="list" rows={6} />
          ) : (
            <ManutentionDataTable
              data={rows}
              detailLinkBase="/dashboard/admin/manutention"
              onValider={
                isAdmin
                  ? async (row) => {
                      try {
                        const r = await fetch(
                          `/api/manutention/${row._id}/valider`,
                          { method: 'POST', credentials: 'include' }
                        );
                        const d = await r.json();
                        if (d.success) void fetchData();
                        else alert(d.error || 'Erreur');
                      } catch {
                        alert('Erreur réseau');
                      }
                    }
                  : undefined
              }
            />
          )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
