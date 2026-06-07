import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { UserRole, type ITransit, DesignationStatus } from '@/types';
import { RefreshCcw, Eye } from 'lucide-react';

export default function PayeurTransitsDisponibles() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed = user?.role === UserRole.USER_PAYEUR;

  const [transits, setTransits] = useState<ITransit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soldeCaisse, setSoldeCaisse] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [transitsRes, caisseRes] = await Promise.all([
        fetch('/api/transit/disponibles', { credentials: 'include' }).then((x) =>
          x.json()
        ),
        fetch('/api/caisse/caisses?mine=1', { credentials: 'include' }).then(
          (x) => x.json()
        ),
      ]);
      if (transitsRes.success) setTransits(transitsRes.data || []);
      else setError(transitsRes.error || t('dashboard.payeur.errorPrefix'));
      if (caisseRes.success) {
        const own = (caisseRes.data || [])[0];
        setSoldeCaisse(own ? Number(own.solde ?? 0) : 0);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  // Compteurs par transit — uniquement ce qui est **visible au payeur** :
  // les désignations LIBRE + ses propres désignations. Les désignations
  // réservées/payées par d'autres payeurs sont masquées.
  const counts = useMemo(() => {
    const map = new Map<
      string,
      { libre: number; reservee: number; payee: number; visibleTotal: number }
    >();
    const uid = user?.id;
    for (const t of transits) {
      let libre = 0;
      let reservee = 0;
      let payee = 0;
      for (const d of t.designations || []) {
        const mine = String(d.payeurId || '') === uid;
        if (d.statutDesignation === DesignationStatus.LIBRE) {
          libre += 1;
        } else if (mine && d.statutDesignation === DesignationStatus.RESERVEE) {
          reservee += 1;
        } else if (
          mine &&
          (d.statutDesignation === DesignationStatus.PAYEE ||
            d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT ||
            d.statutDesignation === DesignationStatus.VALIDEE_ADMIN)
        ) {
          payee += 1;
        }
      }
      const visibleTotal = libre + reservee + payee;
      map.set(String(t._id), { libre, reservee, payee, visibleTotal });
    }
    return map;
  }, [transits, user?.id]);

  const transitColumns = useMemo<ColumnDef<ITransit>[]>(
    () => [
      // Mobile title : client name
      {
        accessorKey: 'client',
        header: t('dashboard.payeur.colClient'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.client || '—'}</span>
        ),
      },
      {
        accessorKey: 'bl',
        header: t('dashboard.payeur.colBl'),
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.bl}</span>
        ),
      },
      {
        id: 'designations',
        header: t('dashboard.payeur.colDesignations'),
        cell: ({ row }) => {
          const c = counts.get(String(row.original._id));
          if (!c) return <span className="text-sm">—</span>;
          return (
            <span className="text-sm">
              <span className="font-medium">{c.libre}</span>
              <span className="text-muted-foreground">
                /{c.visibleTotal} {t('dashboard.payeur.libres')}
              </span>
              {(c.reservee > 0 || c.payee > 0) && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.reservee > 0 && ` ${t('dashboard.payeur.reserveeSuffix', { count: c.reservee })}`}
                  {c.payee > 0 && ` ${t('dashboard.payeur.payeeSuffix', { count: c.payee })}`}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: 'date',
        header: t('dashboard.payeur.colDate'),
        // Hidden on mobile — shown on desktop only
        meta: { hideInMobileList: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm">
            {new Date(
              row.original.date || row.original.createdAt
            ).toLocaleDateString('fr-FR')}
          </span>
        ),
      },
      {
        accessorKey: 'objet',
        header: t('dashboard.payeur.colObjet'),
        // Too verbose for compact grid cards
        meta: { hideInMobileList: true } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground line-clamp-2">
            {row.original.objet || '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.payeur.colActions'),
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/payeur/transits-disponibles/${row.original._id}`}
            >
              <Eye className="mr-2 h-4 w-4" />
              {t('dashboard.payeur.voir')}
            </Link>
          </Button>
        ),
      },
    ],
    [counts, t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.payeur.transitsListTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.payeur.transitsListTitle')}
        subtitle={t('dashboard.payeur.transitsListSubtitle')}
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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {soldeCaisse !== null && (
            <div className="text-sm text-muted-foreground">
              {t('dashboard.payeur.soldeCaisse')}{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {soldeCaisse.toFixed(2)} MRU
              </span>
            </div>
          )}
          <CardHeader className="text-xl font-bold text-primary p-0">
            {t('dashboard.payeur.dossiersDispoCount', { count: transits.length })}
          </CardHeader>
          <DataTable
            columns={transitColumns}
            data={transits}
            emptyMessage={t('dashboard.payeur.transitsListEmpty')}
            mobileGridCols={2}
          />
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
