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
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import {
  UserRole,
  type IVoyage,
  VoyageStatus,
} from '@/types';
import { Eye, RefreshCcw } from 'lucide-react';

interface VoyageRow extends IVoyage {
  fichier?: { _id: string; reference: string; date: Date };
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

function statusBadge(s?: VoyageStatus, t?: (key: string) => string) {
  switch (s) {
    case VoyageStatus.CREE:
      return <Badge className="bg-blue-500 text-white hover:bg-blue-500 text-xs">{t ? t('dashboard.logistique.statuses.voyage.CREE') : 'Disponible'}</Badge>;
    case VoyageStatus.RESERVE:
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">{t ? t('dashboard.logistique.statuses.voyage.RESERVE') : 'Réservé'}</Badge>;
    case VoyageStatus.EN_COURS:
      return <Badge className="bg-violet-600 text-white hover:bg-violet-600 text-xs">{t ? t('dashboard.logistique.statuses.voyage.EN_COURS') : 'En cours'}</Badge>;
    case VoyageStatus.RETOURNE:
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs">{t ? t('dashboard.logistique.statuses.voyage.RETOURNE') : 'Retourné'}</Badge>;
    case VoyageStatus.VALIDE:
      return <Badge className="bg-green-700 text-white hover:bg-green-700 text-xs">{t ? t('dashboard.logistique.statuses.voyage.VALIDE') : 'Validé'}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{s || '—'}</Badge>;
  }
}

export default function ChauffeurMesVoyagesList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.CHAUFFEUR ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE;

  const [rows, setRows] = useState<VoyageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/logistique/mes-voyages', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows(r.data || []);
      else setError(r.error || 'Erreur');
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

const columns = useMemo<ColumnDef<VoyageRow>[]>(
    () => [
      {
        id: 'date',
        header: t('dashboard.logistique.mesVoyages.colDate'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {new Date(row.original.date).toLocaleDateString('fr-FR')}
          </span>
        ),
      },
      {
        id: 'fichier',
        header: t('dashboard.logistique.mesVoyages.colDossier'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.fichier?.reference || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'clientSource',
        header: t('dashboard.logistique.mesVoyages.colClient'),
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {row.original.clientSource || '—'}
          </span>
        ),
      },
      {
        id: 'identif',
        header: t('dashboard.logistique.mesVoyages.colIdentif'),
        cell: ({ row }) => (
          <div className="text-sm space-y-0.5">
            {row.original.bl && (
              <div className="tabular-nums">BL {row.original.bl}</div>
            )}
            {row.original.ntc && (
              <div className="tabular-nums text-xs text-muted-foreground">
                NTC {row.original.ntc}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'matricule',
        header: t('dashboard.logistique.mesVoyages.colMatricule'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.matricule || (
              <span className="text-muted-foreground italic">—</span>
            )}
          </span>
        ),
      },
      {
        id: 'commission',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.logistique.mesVoyages.colCommission'),
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">
            {fmt(Number(row.original.commissionChauffeur || 0))} {t('common.mru')}
          </span>
        ),
      },
      {
        accessorKey: 'statutVoyage',
        header: t('dashboard.logistique.mesVoyages.colStatut'),
        cell: ({ row }) => statusBadge(row.original.statutVoyage, t),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.logistique.mesVoyages.colActions'),
        cell: ({ row }) => (
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/logistique/mes-voyages/${row.original._id}`}
            >
              <Eye className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" />
              {t('dashboard.logistique.mesVoyages.viewBtn')}
            </Link>
          </Button>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.mesVoyages.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const dispo = rows.filter((v) => v.statutVoyage === VoyageStatus.CREE).length;
  const enCours = rows.filter(
    (v) => v.statutVoyage === VoyageStatus.EN_COURS
  ).length;
  const retournes = rows.filter(
    (v) => v.statutVoyage === VoyageStatus.RETOURNE
  ).length;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.mesVoyages.title')}
        subtitle={t('dashboard.logistique.mesVoyages.subtitleSummary', { dispo, enCours, retournes })}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2 rtl:sm:ml-2 rtl:sm:mr-0" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 max-w-7xl mx-auto rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CardHeader className="text-base font-semibold text-primary p-0">
            {t('dashboard.logistique.mesVoyages.voyagesCardTitle', { count: rows.length })}
          </CardHeader>
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage={t('dashboard.mesVoyages.empty')}
          />
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
