import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import {
  PageHeader,
  PageContent,
  EmptyState,
  PageSkeleton,
  MobilePagination,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BonCommandeStatut,
  CompteType,
  IBonCommandeResponse,
  ICaisseListItem,
  LogistiqueClient,
  UserRole,
} from '@/types';
import { ClipboardList, Plus, CreditCard } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const STATUT_VARIANT: Record<BonCommandeStatut, 'default' | 'secondary' | 'outline'> = {
  [BonCommandeStatut.BROUILLON]: 'outline',
  [BonCommandeStatut.CONFIRME]: 'secondary',
  [BonCommandeStatut.PAYE]: 'default',
};

function formatMRU(amount: number) {
  return new Intl.NumberFormat('fr-MR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' MRU';
}

export default function BonsCommandePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.ADMIN_LOGISTIQUE || userRole === UserRole.AGENT_TRANSIT || userRole === UserRole.COMPTABLE;

  const [rows, setRows] = useState<IBonCommandeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [availableClients, setAvailableClients] = useState<string[]>([]);

  // Pay dialog state
  const [payTarget, setPayTarget] = useState<IBonCommandeResponse | null>(null);
  const [caisses, setCaisses] = useState<ICaisseListItem[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string>('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const limit = isMobile ? 5 : 15;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, isAllowed, router]);

  // Load available clients (default + dynamic)
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const defaultClients = Object.values(LogistiqueClient);
        const res = await fetch('/api/logistique/clients');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const dynamicClients = json.data.map((c: { name: string }) => c.name);
          const allClients = Array.from(new Set([...defaultClients, ...dynamicClients]));
          setAvailableClients(allClients);
        } else {
          setAvailableClients(defaultClients);
        }
      } catch {
        setAvailableClients(Object.values(LogistiqueClient));
      }
    };
    void fetchClients();
  }, []);

  const fetchBons = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterClient !== 'all') params.set('client', filterClient);
      if (filterStatut !== 'all') params.set('statut', filterStatut);

      const res = await fetch(`/api/logistique/bons-commande?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('dashboard.logistique.bonsCommande.errLoad'));
      setRows(json.data.data);
      setTotalPages(json.data.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.logistique.bonsCommande.errUnknown'));
    } finally {
      setLoading(false);
    }
  }, [isAllowed, page, limit, filterClient, filterStatut, t]);

  useEffect(() => {
    void fetchBons();
  }, [fetchBons]);

  const fetchCaisses = useCallback(async () => {
    try {
      // Bon de commande = logistique → on n'autorise que les comptes du domaine
      // (General_Logistique + Banque_Logistique + autres banques logistique).
      const res = await fetch('/api/caisse/caisses?caisseType=LOGISTIQUE');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCaisses(
          json.data.filter(
            (c: ICaisseListItem) =>
              c.type === CompteType.GENERAL || c.type === CompteType.BANQUE
          )
        );
      }
    } catch {
      // silent
    }
  }, []);

  const openPayDialog = useCallback(
    (bon: IBonCommandeResponse) => {
      setPayTarget(bon);
      setSelectedCaisseId('');
      setPayError(null);
      void fetchCaisses();
    },
    [fetchCaisses]
  );

  const handlePay = useCallback(async () => {
    if (!payTarget || !selectedCaisseId) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/logistique/bons-commande/${payTarget._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payer', caisseId: selectedCaisseId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('dashboard.logistique.bonsCommande.errPayment'));
      setPayTarget(null);
      void fetchBons();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t('dashboard.logistique.bonsCommande.errUnknown'));
    } finally {
      setPaying(false);
    }
  }, [payTarget, selectedCaisseId, fetchBons, t]);

  const totalParStatut = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of Object.values(BonCommandeStatut)) {
      map[s] = rows.filter((r) => r.statut === s).reduce((acc, r) => acc + r.total, 0);
    }
    return map;
  }, [rows]);

  const columns = useMemo<ColumnDef<IBonCommandeResponse>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: t('dashboard.logistique.bonsCommande.colReference'),
        cell: ({ row }) => <span className="font-semibold">{row.original.reference}</span>,
      },
      {
        id: 'clientDate',
        header: t('dashboard.logistique.bonsCommande.colClientDate'),
        cell: ({ row }) => {
          const b = row.original;
          const dateLabel = b.date
            ? new Date(b.date).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
            : '—';
          return (
            <div className="space-y-0.5">
              <div className="font-medium">{b.client}</div>
              <div className="text-xs text-muted-foreground">{dateLabel}</div>
            </div>
          );
        },
      },
      {
        accessorKey: 'total',
        header: t('dashboard.logistique.bonsCommande.colTotal'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => <span className="font-medium">{formatMRU(row.original.total)}</span>,
      },
      {
        accessorKey: 'statut',
        header: t('dashboard.logistique.bonsCommande.colStatut'),
        cell: ({ row }) => (
          <Badge variant={STATUT_VARIANT[row.original.statut]}>
            {t(`dashboard.logistique.statuses.bonCommande.${row.original.statut}`)}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: t('dashboard.logistique.bonsCommande.colActions'),
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/logistique/bons-commande/${row.original._id}`}>
                {t('dashboard.logistique.bonsCommande.viewBtn')}
              </Link>
            </Button>
            {row.original.statut === BonCommandeStatut.CONFIRME && (
              <Button size="sm" variant="default" onClick={() => openPayDialog(row.original)}>
                <CreditCard className="mr-1 h-3.5 w-3.5" />
                {t('dashboard.logistique.bonsCommande.payBtn')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [openPayDialog, t]
  );

  if (status === 'loading') return <PageSkeleton />;
  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.bonsCommande.title')}
        subtitle={t('dashboard.bonsCommande.subtitle')}
        actions={
          <Button onClick={() => void router.push('/dashboard/logistique/bons-commande/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('dashboard.logistique.bonsCommande.newBtn')}
          </Button>
        }
      />

      <PageContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={filterClient} onValueChange={(v) => { setFilterClient(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('dashboard.logistique.bonsCommande.filterClientPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.logistique.bonsCommande.filterClientAll')}</SelectItem>
              {availableClients.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatut} onValueChange={(v) => { setFilterStatut(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('dashboard.logistique.bonsCommande.filterStatutPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dashboard.logistique.bonsCommande.filterStatutAll')}</SelectItem>
              {Object.values(BonCommandeStatut).map((s) => (
                <SelectItem key={s} value={s}>{t(`dashboard.logistique.statuses.bonCommande.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <PageSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={t('dashboard.bonsCommande.empty')}
            description={t('dashboard.logistique.bonsCommande.emptyDesc')}
          />
        ) : (
          <DataTable columns={columns} data={rows} emptyMessage={t('dashboard.bonsCommande.empty')} />
        )}

        {totalPages > 1 && (
          <div className="mt-4">
            <MobilePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </PageContent>

      {/* Pay Dialog */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPayTarget(null);
            setSelectedCaisseId('');
            setPayError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.bonsCommande.payDialog', { reference: payTarget?.reference || '' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <p className="text-muted-foreground">{t('dashboard.logistique.bonsCommande.payInfoLabel')}</p>
              <p className="font-medium text-foreground">{payTarget?.reference || '—'}</p>
              <p className="mt-1 text-muted-foreground">
                {t('dashboard.logistique.bonsCommande.payAmountLabel')}{' '}
                <span className="font-semibold text-foreground">
                  {payTarget ? formatMRU(payTarget.total) : '—'}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('dashboard.logistique.bonsCommande.paySelectCaisse')}</label>
              <Select value={selectedCaisseId} onValueChange={setSelectedCaisseId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('dashboard.logistique.bonsCommande.payChooseCaisse')} />
                </SelectTrigger>
                <SelectContent>
                  {caisses.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.nom} — {t('dashboard.logistique.bonsCommande.paySoldeLabel')} {formatMRU(c.solde)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {caisses.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('dashboard.logistique.bonsCommande.payNoCaisse')}</p>
              )}
            </div>

            {payError && (
              <Alert variant="destructive">
                <AlertDescription>{payError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={paying}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void handlePay()} disabled={paying || !selectedCaisseId}>
              {paying ? t('dashboard.logistique.bonsCommande.paySubmitting') : t('dashboard.logistique.bonsCommande.payConfirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
