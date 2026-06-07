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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  UserRole,
  type IUserResponse,
  type IVoyage,
} from '@/types';
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCcw,
  Wallet,
} from 'lucide-react';

interface DetailData {
  chauffeur: IUserResponse;
  caisseId: string;
  soldeCaisse: number;
  voyagesAPayer: IVoyage[];
  voyagesPayes: IVoyage[];
  totalAPayer: number;
  totalDejaPaye: number;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function PaiementsChauffeurDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const chauffeurId = String(router.query.chauffeurId || '');
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!chauffeurId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/logistique/paiements-chauffeurs/${chauffeurId}`,
        { credentials: 'include' }
      ).then((x) => x.json());
      if (r.success) {
        setData(r.data);
        setSelected(
          new Set((r.data?.voyagesAPayer || []).map((v: IVoyage) => String(v._id)))
        );
      } else {
        setError(r.error || 'Erreur');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [chauffeurId]);

  useEffect(() => {
    if (isAllowed && chauffeurId) void reload();
  }, [isAllowed, chauffeurId, reload]);

  const voyagesAPayer = data?.voyagesAPayer || [];
  const voyagesPayes = data?.voyagesPayes || [];

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelected(new Set(voyagesAPayer.map((v) => String(v._id))));
      } else {
        setSelected(new Set());
      }
    },
    [voyagesAPayer]
  );

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const totalSelectionne = useMemo(() => {
    return voyagesAPayer
      .filter((v) => selected.has(String(v._id)))
      .reduce((s, v) => s + (Number(v.commissionChauffeur) || 0), 0);
  }, [voyagesAPayer, selected]);

  const allSelected =
    voyagesAPayer.length > 0 && selected.size === voyagesAPayer.length;
  const someSelected = selected.size > 0 && !allSelected;

  const columnsAPayer = useMemo<ColumnDef<IVoyage>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allSelected || (someSelected && 'indeterminate')}
            onCheckedChange={(v) => toggleAll(Boolean(v))}
            aria-label={t('dashboard.paiementsChauffeurs.selectAllAria')}
          />
        ),
        cell: ({ row }) => {
          const id = String(row.original._id);
          return (
            <Checkbox
              checked={selected.has(id)}
              onCheckedChange={(v) => toggleOne(id, Boolean(v))}
              aria-label={t('dashboard.paiementsChauffeurs.selectOneAria')}
            />
          );
        },
      },
      {
        id: 'date',
        header: t('dashboard.paiementsChauffeurs.colRetour'),
        cell: ({ row }) => {
          const d = row.original.scanRetourAt;
          return (
            <span className="text-sm tabular-nums">
              {d ? new Date(d).toLocaleDateString('fr-FR') : '—'}
            </span>
          );
        },
      },
      {
        accessorKey: 'clientSource',
        header: t('dashboard.paiementsChauffeurs.colClient'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.clientSource || '—'}</span>
        ),
      },
      {
        id: 'identif',
        header: t('dashboard.paiementsChauffeurs.colIdentif'),
        cell: ({ row }) => (
          <div className="text-xs space-y-0.5">
            {row.original.bl && <div>BL {row.original.bl}</div>}
            {row.original.ntc && (
              <div className="text-muted-foreground">
                NTC {row.original.ntc}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'matricule',
        header: t('dashboard.paiementsChauffeurs.colMatricule'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.matricule || '—'}
          </span>
        ),
      },
      {
        id: 'commission',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colCommission'),
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">
            {fmt(Number(row.original.commissionChauffeur || 0))} {t('common.mru')}
          </span>
        ),
      },
    ],
    [selected, allSelected, someSelected, toggleAll, toggleOne, t]
  );

  const columnsPayes = useMemo<ColumnDef<IVoyage>[]>(
    () => [
      {
        id: 'paidAt',
        header: t('dashboard.paiementsChauffeurs.colPaidAt'),
        cell: ({ row }) => {
          const d = row.original.commissionPaidAt;
          return (
            <span className="text-sm tabular-nums">
              {d ? new Date(d).toLocaleDateString('fr-FR') : '—'}
            </span>
          );
        },
      },
      {
        accessorKey: 'clientSource',
        header: t('dashboard.paiementsChauffeurs.colClient'),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.clientSource || '—'}</span>
        ),
      },
      {
        id: 'identif',
        header: t('dashboard.paiementsChauffeurs.colIdentif'),
        cell: ({ row }) => (
          <div className="text-xs space-y-0.5">
            {row.original.bl && <div>BL {row.original.bl}</div>}
            {row.original.ntc && (
              <div className="text-muted-foreground">
                NTC {row.original.ntc}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'matricule',
        header: t('dashboard.paiementsChauffeurs.colMatricule'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.matricule || '—'}
          </span>
        ),
      },
      {
        id: 'commission',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.paiementsChauffeurs.colCommission'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {fmt(Number(row.original.commissionChauffeur || 0))} {t('common.mru')}
          </span>
        ),
      },
    ],
    [t]
  );

  const submitPaiement = async () => {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const ids = Array.from(selected);
      const r = await fetch(
        `/api/logistique/paiements-chauffeurs/${data.chauffeur._id}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voyageIds: ids }),
        }
      ).then((x) => x.json());
      if (r.success) {
        setSuccess(
          r.message ||
            t('dashboard.paiementsChauffeurs.successPayment', {
              count: r.data?.nbVoyagesPayes ?? 0,
              montant: fmt(Number(r.data?.montantPaye || 0))
            })
        );
        setConfirmOpen(false);
        void reload();
      } else {
        setError(r.error || 'Erreur');
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.paiementsChauffeurs.detailLoadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  if (error && !data) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.paiementsChauffeurs.detailLoadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/logistique/paiements-chauffeurs">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.logistique.actions.back')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={data.chauffeur.nom}
        subtitle={t('dashboard.paiementsChauffeurs.detailSubtitle', { count: voyagesAPayer.length, total: fmt(data.totalAPayer) })}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logistique/paiements-chauffeurs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
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
            <RefreshCcw className="h-4 w-4 sm:mr-2 rtl:sm:ml-2 rtl:sm:mr-0" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-4 max-w-7xl mx-auto">
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t('dashboard.paiementsChauffeurs.detailFieldEmail')} value={data.chauffeur.email} />
            <Field label={t('dashboard.paiementsChauffeurs.detailFieldTel')} value={data.chauffeur.telephone || '—'} />
            <Field
              label={t('dashboard.paiementsChauffeurs.detailFieldSolde')}
              value={`${fmt(data.soldeCaisse)} ${t('common.mru')}`}
              strong
            />
            <Field
              label={t('dashboard.paiementsChauffeurs.detailFieldTotalDejaPaye')}
              value={`${fmt(data.totalDejaPaye)} ${t('common.mru')}`}
            />
          </div>

          <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardHeader className="text-base font-semibold text-primary p-0">
                {t('dashboard.paiementsChauffeurs.detailAPayerTitle', { count: voyagesAPayer.length })}
              </CardHeader>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {t('dashboard.paiementsChauffeurs.detailSelectionneLabel')}
                  <strong className="text-foreground tabular-nums">
                    {fmt(totalSelectionne)} {t('common.mru')}
                  </strong>
                </span>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setConfirmOpen(true)}
                  disabled={selected.size === 0 || totalSelectionne <= 0}
                >
                  <Wallet className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" />
                  {t('dashboard.paiementsChauffeurs.detailPaySelection')}
                </Button>
              </div>
            </div>
            <DataTable
              columns={columnsAPayer}
              data={voyagesAPayer}
              emptyMessage={t('dashboard.paiementsChauffeurs.noVoyagesAPayer')}
            />
          </div>

          {voyagesPayes.length > 0 && (
            <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
              <CardHeader className="text-base font-semibold text-primary p-0">
                {t('dashboard.paiementsChauffeurs.detailDejaPayesTitle', { count: voyagesPayes.length })}
              </CardHeader>
              <DataTable
                columns={columnsPayes}
                data={voyagesPayes}
                emptyMessage={t('dashboard.paiementsChauffeurs.noVoyagesPayes')}
              />
            </div>
          )}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.paiementsChauffeurs.confirmDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.paiementsChauffeurs.confirmDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.paiementsChauffeurs.confirmFieldChauffeur')}</span>
                <span className="font-medium">{data.chauffeur.nom}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.paiementsChauffeurs.confirmFieldVoyages')}</span>
                <span className="font-medium">{selected.size}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">{t('dashboard.paiementsChauffeurs.confirmFieldTotal')}</span>
                <span className="font-semibold tabular-nums text-base">
                  {fmt(totalSelectionne)} {t('common.mru')}
                </span>
              </div>
            </div>
            <DialogFooter className="gap-2">
<Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={() => void submitPaiement()}
                disabled={submitting || selected.size === 0}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                <Wallet className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" />
                {submitting ? t('dashboard.paiementsChauffeurs.confirmSubmitting') : t('dashboard.paiementsChauffeurs.confirmBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={
          strong ? 'text-base font-semibold tabular-nums' : 'text-sm'
        }
      >
        {value}
      </div>
    </div>
  );
}
