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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import { isAdminTransit } from '@/lib/roles';
import { UserRole } from '@/types';
import {
  Plus,
  Eye,
  Pencil,
  Receipt,
  Wallet,
  RefreshCcw,
  MoreHorizontal,
  ShieldCheck,
  XCircle,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface ClientRow {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
  caisseId?: string;
  actif: boolean;
  statut?: 'EN_ATTENTE' | 'VALIDE';
  createdBy?: string;
}

export default function AdminClientsList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const canAccess =
    isAdminTransit(user?.role) || user?.role === UserRole.AGENT_TRANSIT;
  const isAdminValidator = isAdminTransit(user?.role);

  const handleValider = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/clients/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) void reload();
      else alert(r.error || t('common.error'));
    } catch {
      alert(t('common.errorNetwork'));
    }
  };

  const handleRejeter = async (id: string, nom: string) => {
    if (!window.confirm(t('dashboard.clients.confirmReject', { nom }))) return;
    try {
      const r = await fetch(`/api/admin/clients/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) void reload();
      else alert(r.error || t('common.error'));
    } catch {
      alert(t('common.errorNetwork'));
    }
  };

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [financials, setFinancials] = useState<Map<string, { debit: number; credit: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formNom, setFormNom] = useState('');
  const [formTelephone, setFormTelephone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog : transfert client → client. Disponible pour ADMIN_TRANSIT
  // (validation directe) et AGENT_TRANSIT (crée un MouvementPending avec
  // image justificative, à valider par ADMIN_TRANSIT).
  const [transferSource, setTransferSource] = useState<ClientRow | null>(null);
  const [transferDestId, setTransferDestId] = useState('');
  const [transferMontant, setTransferMontant] = useState('');
  const [transferDesc, setTransferDesc] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  /** Clients validés & actifs récupérés via /api/transit/clients (qui
   *  filtre strictement par statut=VALIDE et actif=true). Utilisé comme
   *  source de vérité pour le select destination. */
  const [validatedClients, setValidatedClients] = useState<
    { _id: string; nom: string }[]
  >([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const isAgentTransit = user?.role === UserRole.AGENT_TRANSIT;

  const openTransfer = (row: ClientRow) => {
    setTransferSource(row);
    setTransferDestId('');
    setTransferMontant('');
    setTransferDesc('');
    setTransferError(null);
    setTransferSuccess(null);
    // Charge la liste filtrée strictement à VALIDE + actif depuis /api/transit/clients.
    void fetch('/api/transit/clients?limit=500', { credentials: 'include' })
      .then((x) => x.json())
      .then((r) => {
        if (r?.success) {
          setValidatedClients(
            (r.data || []) as { _id: string; nom: string }[]
          );
        }
      })
      .catch(() => null);
  };

  const submitTransfer = async () => {
    if (!transferSource) return;
    setTransferError(null);
    if (!transferDestId) {
      setTransferError(t('dashboard.clients.transfer.errorNoDest'));
      return;
    }
    if (transferDestId === transferSource._id) {
      setTransferError(t('dashboard.clients.transfer.errorSameDest'));
      return;
    }
    const m = parseFloat(transferMontant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      setTransferError('Montant invalide');
      return;
    }
    if (!transferDesc.trim()) {
      setTransferError(t('dashboard.clients.transfer.errorNoDesc'));
      return;
    }
    setTransferSubmitting(true);
    try {
      if (isAgentTransit) {
        const fd = new FormData();
        fd.append('kind', 'TRANSFER');
        fd.append('sourceClientId', transferSource._id);
        fd.append('destinationClientId', transferDestId);
        fd.append('montant', String(m));
        const destNom =
          rows.find((c) => c._id === transferDestId)?.nom || '';
        fd.append(
          'description',
          transferDesc.trim() ||
            `Transfert client ${transferSource.nom} → ${destNom}`
        );
        const r = await fetch('/api/caisse/mouvement-pending', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setTransferSuccess(
            t('dashboard.clients.transfer.successPending')
          );
          setTransferSource(null);
        } else {
          setTransferError(data?.error || `Erreur ${r.status}`);
        }
      } else {
        const r = await fetch('/api/caisse/transfer', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceClientId: transferSource._id,
            destinationClientId: transferDestId,
            montant: m,
            description: transferDesc.trim() || undefined,
          }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setTransferSuccess(t('dashboard.clients.transfer.successDone'));
          setTransferSource(null);
        } else {
          setTransferError(data?.error || `Erreur ${r.status}`);
        }
      }
    } catch {
      setTransferError(t('common.errorNetwork'));
    } finally {
      setTransferSubmitting(false);
    }
  };

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/clients', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows(r.data || []);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  useEffect(() => {
    if (!canAccess) return;
    Promise.all([
      fetch('/api/transit/factures?limit=1000', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/credit-compte?limit=500', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([facturesRes, creditRes]) => {
      const map = new Map<string, { debit: number; credit: number }>();
      if (facturesRes.success) {
        for (const f of (facturesRes.data.data || [])) {
          const cid = String(f.clientId || '').trim();
          if (!cid) continue;
          const cur = map.get(cid) ?? { debit: 0, credit: 0 };
          cur.debit += f.totalFinal || 0;
          map.set(cid, cur);
        }
      }
      if (creditRes.success) {
        for (const cc of (creditRes.data || [])) {
          if (cc.statut !== 'ACTIF') continue;
          const cid = String(cc.clientId);
          const cur = map.get(cid) ?? { debit: 0, credit: 0 };
          cur.credit += cc.montant || 0;
          map.set(cid, cur);
        }
      }
      setFinancials(map);
    }).catch(() => {/* ignore */});
  }, [canAccess]);

  const openCreate = () => {
    setFormNom('');
    setFormTelephone('');
    setFormEmail('');
    setFormError(null);
    setDialogOpen(true);
  };

  const submitCreate = async () => {
    setFormError(null);
    if (!formNom.trim()) return setFormError(t('dashboard.clients.list.nameRequired'));
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin/clients', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: formNom.trim(),
          telephone: formTelephone.trim() || undefined,
          email: formEmail.trim() || undefined,
        }),
      }).then((x) => x.json());
      if (r.success) {
        setDialogOpen(false);
        void reload();
      } else {
        setFormError(r.error || t('common.error'));
      }
    } catch {
      setFormError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<ClientRow>[]>(
    () => [
      {
        accessorKey: 'nom',
        header: t('dashboard.clients.list.colNom'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nom}</span>
        ),
      },
      {
        accessorKey: 'telephone',
        header: t('dashboard.clients.list.colTelephone'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.telephone || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: t('dashboard.clients.list.colEmail'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.email || '—'}
          </span>
        ),
      },
      {
        id: 'caisse',
        header: t('dashboard.clients.list.colCaisse'),
        cell: ({ row }) =>
          row.original.caisseId ? (
            <span className="text-xs font-mono text-muted-foreground">
              {t('dashboard.clients.list.caisseLinked')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'statut',
        header: 'Statut',
        cell: ({ row }) => {
          const s = row.original.statut || 'VALIDE';
          if (s === 'EN_ATTENTE') {
            return (
              <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
                En attente
              </Badge>
            );
          }
          return (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs">
              Validé
            </Badge>
          );
        },
      },
      {
        id: 'totalDebit',
        header: 'Total Débits',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = financials.get(row.original._id);
          if (!f) return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <Link
              href={`/dashboard/admin/clients/${row.original._id}/factures`}
              className="font-medium text-orange-600 tabular-nums hover:underline"
            >
              {f.debit.toFixed(2)} MRU
            </Link>
          );
        },
      },
      {
        id: 'totalCredit',
        header: 'Total Crédits',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = financials.get(row.original._id);
          if (!f) return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <Link
              href={`/dashboard/admin/clients/${row.original._id}`}
              className="font-medium text-green-600 tabular-nums hover:underline"
            >
              {f.credit.toFixed(2)} MRU
            </Link>
          );
        },
      },
      {
        id: 'restant',
        header: 'Restant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        cell: ({ row }) => {
          const f = financials.get(row.original._id);
          if (!f) return <span className="text-muted-foreground text-sm">—</span>;
          const restant = f.debit - f.credit;
          return (
            <Link
              href={`/dashboard/admin/clients/${row.original._id}/operations`}
              className={`font-semibold tabular-nums hover:underline ${restant > 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {restant.toFixed(2)} MRU
            </Link>
          );
        },
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.clients.list.colActions'),
        cell: ({ row }) => {
          const cid = row.original._id;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  aria-label={t('dashboard.clients.list.ariaActions', { name: row.original.nom })}
                >
                  <span className="sr-only">{t('dashboard.clients.list.openMenu')}</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t('dashboard.clients.list.menuLabel')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdminValidator && row.original.statut === 'EN_ATTENTE' && (
                  <>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleValider(cid);
                      }}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4 text-emerald-600" />
                      Valider
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleRejeter(cid, row.original.nom);
                      }}
                      className="text-red-600 focus:text-red-600"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Rejeter (supprimer)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/admin/clients/${cid}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('dashboard.clients.list.menuDetails')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/admin/clients/${cid}/modifier`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('dashboard.clients.list.menuModifier')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/admin/clients/${cid}/factures`}>
                    <Receipt className="mr-2 h-4 w-4" />
                    {t('dashboard.clients.list.menuFactures')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/admin/clients/${cid}/operations`}>
                    <Wallet className="mr-2 h-4 w-4" />
                    {t('dashboard.clients.list.menuOperations')}
                  </Link>
                </DropdownMenuItem>
                {row.original.statut === 'VALIDE' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        openTransfer(row.original);
                      }}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4 text-blue-600" />
                      {t('dashboard.clients.menuTransfer')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t, isAdminValidator, financials]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.clients.title')} />
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
        title={t('dashboard.clients.title')}
        subtitle={t('dashboard.clients.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('actions.refresh')}</span>
            </Button>
            <Button onClick={openCreate} className={isMobile ? 'h-10 px-3' : ''}>
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.clients.newClient')}</span>
              <span className="sm:hidden">{t('actions.create')}</span>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <CardHeader className="text-xl font-bold text-primary p-0">
            {t('dashboard.clients.title')}
          </CardHeader>
          <DataTable
            columns={columns}
            data={rows}
            emptyMessage={t('dashboard.clients.emptyMessage')}
          />
        </div>
      </PageContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.clients.newClient')}</DialogTitle>
          </DialogHeader>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nom">{t('dashboard.clients.list.colNom')}</Label>
              <Input
                id="nom"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
                placeholder={t('dashboard.clients.list.namePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tel">{t('dashboard.clients.list.colTelephone')}</Label>
              <Input
                id="tel"
                value={formTelephone}
                onChange={(e) => setFormTelephone(e.target.value)}
                placeholder={t('dashboard.clients.list.telephonePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('dashboard.clients.list.colEmail')}</Label>
              <Input
                id="email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder={t('dashboard.clients.list.emailPlaceholder')}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.clients.list.createHint')}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={submitCreate}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? t('dashboard.clients.list.creating') : t('dashboard.clients.list.createBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog transfert client → client */}
      <Dialog
        open={!!transferSource}
        onOpenChange={(open) => {
          if (!open) setTransferSource(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.clients.transfer.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {transferError && (
              <Alert variant="destructive">
                <AlertDescription>{transferError}</AlertDescription>
              </Alert>
            )}
            {transferSuccess && (
              <Alert>
                <AlertDescription>{transferSuccess}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>{t('dashboard.clients.transfer.labelSource')}</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                {transferSource?.nom}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-dest">{t('dashboard.clients.transfer.labelDest')}</Label>
              <Select
                value={transferDestId || undefined}
                onValueChange={setTransferDestId}
              >
                <SelectTrigger id="t-dest" className="w-full">
                  <SelectValue placeholder={t('dashboard.clients.transfer.selectPlaceholder')} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-[60vh]">
                  {validatedClients
                    .filter((c) => c._id !== transferSource?._id)
                    .map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.nom}
                      </SelectItem>
                    ))}
                  {validatedClients.filter(
                    (c) => c._id !== transferSource?._id
                  ).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {t('dashboard.clients.transfer.noClientsAvailable')}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-mont">{t('dashboard.clients.transfer.labelMontant')}</Label>
              <Input
                id="t-mont"
                type="number"
                min="0"
                step="0.01"
                value={transferMontant}
                onChange={(e) => setTransferMontant(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">{t('dashboard.clients.transfer.labelDesc')}</Label>
              <Input
                id="t-desc"
                value={transferDesc}
                onChange={(e) => setTransferDesc(e.target.value)}
                placeholder={t('dashboard.clients.transfer.descPlaceholder')}
                required
              />
            </div>
            {isAgentTransit && (
              <p className="text-[11px] text-muted-foreground">
                {t('dashboard.clients.transfer.agentHint')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={transferSubmitting}
              onClick={() => setTransferSource(null)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={
                transferSubmitting ||
                !transferDestId ||
                !transferDesc.trim() ||
                !transferMontant.trim()
              }
              onClick={() => void submitTransfer()}
            >
              {transferSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              {isAgentTransit ? t('dashboard.clients.transfer.btnSubmit') : t('dashboard.clients.transfer.btnTransfer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
