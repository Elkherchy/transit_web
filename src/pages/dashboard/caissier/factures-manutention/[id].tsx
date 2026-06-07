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
  type IFactureManutention,
  type ITransit,
  type IDesignation,
  DesignationStatus,
} from '@/types';
import { ArrowLeft, RefreshCcw } from 'lucide-react';

function designationStatusBadge(s: DesignationStatus | undefined, t: (key: string) => string) {
  switch (s) {
    case DesignationStatus.LIBRE:
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-500">
          {t('dashboard.caissier.facturesManutention.detail.designationStatus.LIBRE')}
        </Badge>
      );
    case DesignationStatus.RESERVEE:
      return (
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
          {t('dashboard.caissier.facturesManutention.detail.designationStatus.RESERVEE')}
        </Badge>
      );
    case DesignationStatus.PAYEE:
      return (
        <Badge className="bg-violet-600 text-white hover:bg-violet-600">
          {t('dashboard.caissier.facturesManutention.detail.designationStatus.PAYEE')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_TRANSIT:
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
          {t('dashboard.caissier.facturesManutention.detail.designationStatus.VALIDEE_TRANSIT')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_ADMIN:
      return (
        <Badge className="bg-green-700 text-white hover:bg-green-700">
          {t('dashboard.caissier.facturesManutention.detail.designationStatus.VALIDEE_ADMIN')}
        </Badge>
      );
    case DesignationStatus.REJETEE:
      return <Badge variant="destructive">{t('dashboard.caissier.facturesManutention.detail.designationStatus.REJETEE')}</Badge>;
    default:
      return <Badge variant="outline">{s || '—'}</Badge>;
  }
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function CaissierFactureManutentionDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;
  const id = String(router.query.id || '');

  const [facture, setFacture] = useState<IFactureManutention | null>(null);
  const [transit, setTransit] = useState<ITransit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/manutention/${id}`, {
        credentials: 'include',
      }).then((x) => x.json());
      if (!r.success) {
        setError(r.error || t('common.error'));
        setFacture(null);
        return;
      }
      const fac = r.data as IFactureManutention;
      setFacture(fac);

      // Fetch transit lié (pour afficher les désignations / statuts).
      const tid = (fac as { transitId?: string }).transitId;
      if (tid) {
        try {
          const tr = await fetch(`/api/transit/${tid}`, {
            credentials: 'include',
          }).then((x) => x.json());
          if (tr.success) setTransit(tr.data as ITransit);
        } catch {
          /* ignore : on affiche la facture sans le transit */
        }
      } else {
        setTransit(null);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  const designationColumns = useMemo<ColumnDef<IDesignation>[]>(
    () => [
      {
        id: 'nom',
        header: t('dashboard.caissier.facturesManutention.detail.colDesignation'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nom}</span>
        ),
      },
      {
        accessorKey: 'montant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.caissier.facturesManutention.detail.colMontant'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt(Number(row.original.montant || 0))} MRU
          </span>
        ),
      },
      {
        id: 'statut',
        header: t('dashboard.caissier.facturesManutention.detail.colStatut'),
        cell: ({ row }) => designationStatusBadge(row.original.statutDesignation, t),
      },
      {
        id: 'paye',
        header: t('dashboard.caissier.facturesManutention.detail.colPayeur'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.payeurId ? String(row.original.payeurId).slice(-6) : '—'}
          </span>
        ),
      },
    ],
    [t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.factureLoadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  if (error || !facture) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.caissier.factureLoadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/caissier/factures-manutention">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.caissier.facturesManutention.detail.back')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error || t('dashboard.caissier.facturesManutention.detail.errorFallback')}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.facturesManutention.detail.titlePrefix', { bl: facture.bl })}
        subtitle={facture.objet || facture.client || t('dashboard.caissier.facturesManutention.detail.subtitleFallback')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/caissier/factures-manutention">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.caissier.facturesManutention.detail.back')}
            </Link>
          </Button>
        }
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
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Info card facture */}
          <div className="rounded-lg bg-white p-4 border shadow-sm grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('dashboard.caissier.facturesManutention.detail.fieldClient')} value={facture.client || '—'} strong />
            <Field label={t('dashboard.caissier.facturesManutention.detail.fieldBl')} value={facture.bl} mono />
            <Field
              label={t('dashboard.caissier.facturesManutention.detail.fieldBonLivret')}
              value={`${fmt(facture.bonLivret)} MRU`}
              strong
            />
            <Field
              label={t('dashboard.caissier.facturesManutention.detail.fieldStatut')}
              value={<Badge variant="outline">{facture.statut}</Badge>}
            />
            <Field
              label={t('dashboard.caissier.facturesManutention.detail.fieldObjet')}
              value={facture.objet || '—'}
              className="sm:col-span-2"
            />
            <Field
              label={t('dashboard.caissier.facturesManutention.detail.fieldCreatedAt')}
              value={new Date(facture.createdAt).toLocaleString('fr-FR')}
            />
            <Field
              label={t('dashboard.caissier.facturesManutention.detail.fieldUpdatedAt')}
              value={new Date(facture.updatedAt).toLocaleString('fr-FR')}
            />
          </div>

          {/* Désignations du transit lié */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <CardHeader className="text-xl font-bold text-primary p-0">
              {t('dashboard.caissier.facturesManutention.detail.designationsTitle')}
            </CardHeader>
            {transit ? (
              <DataTable
                columns={designationColumns}
                data={transit.designations || []}
                emptyMessage={t('dashboard.caissier.factureNoDesignations')}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.caissier.facturesManutention.detail.noTransit')}
              </p>
            )}
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}

function Field({
  label,
  value,
  strong,
  mono,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={[
          strong ? 'text-lg font-semibold' : 'text-sm',
          mono ? 'font-mono tabular-nums' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
