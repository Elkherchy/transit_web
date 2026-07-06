import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton, MobilePagination } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserRole } from '@/types';
import {
  RefreshCcw,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  ListChecks,
} from 'lucide-react';

const PAGE_SIZE = 10;

interface OperationValidationRow {
  _id: string;
  opType: string;
  opId: string;
  snapshot?: {
    libelle?: string;
    montant?: number;
    contrepartie?: string;
    date?: string | Date;
  };
  statut: 'EN_ATTENTE_AGENT' | 'VALIDEE_AGENT' | 'REJETEE';
  submittedBy: string;
  submittedAt: string | Date;
  validatedBy?: string;
  validatedAt?: string | Date;
  rejectMotif?: string;
}

function getOpTypeLabel(
  opType: string,
  t: (k: string) => string
): string {
  switch (opType) {
    case 'CLIENT_FACTURE':
      return t('dashboard.opsValider.typeClientFacture');
    case 'CLIENT_PAIEMENT':
      return t('dashboard.opsValider.typeClientPaiement');
    case 'PAYEUR_PAIEMENT':
      return t('dashboard.opsValider.typePayeurPaiement');
    case 'ALIMENTATION':
      return t('dashboard.opsValider.typeAlimentation');
    case 'DEPENSE':
      return t('dashboard.opsValider.typeDepense');
    default:
      return opType;
  }
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function OperationsAValiderPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const canAccess =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;

  const [rows, setRows] = useState<OperationValidationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  // Pagination + sélection multiple
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Receipt viewer state
  const [viewerRow, setViewerRow] = useState<OperationValidationRow | null>(null);
  const [viewerUrls, setViewerUrls] = useState<Array<{ url: string; name: string; key: string }>>([]);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerLoadingId, setViewerLoadingId] = useState<string | null>(null);

  const openViewer = useCallback(
    async (row: OperationValidationRow) => {
      if (row.opType !== 'PAYEUR_PAIEMENT') return;
      setViewerRow(row);
      setViewerUrls([]);
      setViewerLoading(true);
      setViewerLoadingId(row._id);
      setViewerIdx(0);
      setError(null);
      try {
        const recusRes = await fetch(
          `/api/transit/designation-recus?id=${encodeURIComponent(row.opId)}`,
          { credentials: 'include' }
        );
        const recusData = await recusRes.json().catch(() => null);
        if (!recusData?.success || !recusData.data?.recus?.length) {
          setViewerUrls([]);
          return;
        }
        const recus: Array<{ key: string; name?: string }> = recusData.data.recus;
        const urls = await Promise.all(
          recus.filter((r) => r.key).map(async (r) => {
            const res = await fetch(`/api/documents/${encodeURIComponent(r.key)}`, {
              credentials: 'include',
            });
            const d = await res.json().catch(() => null);
            return {
              url: d?.url || '',
              name: r.name || r.key.split('/').pop() || 'reçu',
              key: r.key,
            };
          })
        );
        setViewerUrls(urls.filter((u) => u.url));
      } catch {
        setError(t('dashboard.opsValider.errNetwork') || 'Erreur réseau');
        setViewerRow(null);
      } finally {
        setViewerLoading(false);
        setViewerLoadingId(null);
      }
    },
    [t]
  );

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  // Sélection du statut selon le rôle :
  //   AGENT_TRANSIT  → opérations en attente de SA validation (EN_ATTENTE_AGENT)
  //   ADMIN_TRANSIT  → opérations DÉJÀ validées par l'agent, attendant ADMIN
  //                    (EN_ATTENTE_ADMIN)
  //   ADMIN (super)  → voit aussi les EN_ATTENTE_ADMIN par défaut
  const isAgentOnly = user?.role === UserRole.AGENT_TRANSIT;
  const targetStatut = isAgentOnly
    ? 'EN_ATTENTE_AGENT'
    : 'EN_ATTENTE_ADMIN';

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/operations-validation?statut=${targetStatut}&limit=500`,
        { credentials: 'include' }
      ).then((x) => x.json());
      if (r.success) setRows((r.data || []) as OperationValidationRow[]);
      else setError(r.error || 'Erreur');
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [targetStatut]);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  const valider = async (id: string) => {
    setActingId(id);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/operations-validation/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        setSuccess('Opération validée');
        void reload();
      } else setError(d?.error || `Erreur ${r.status}`);
    } catch {
      setError('Erreur réseau');
    } finally {
      setActingId(null);
    }
  };

  const rejeter = async (id: string) => {
    const motif = window.prompt(t('dashboard.opsValider.promptMotifRejet')) || '';
    setActingId(id);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/operations-validation/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motif }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        setSuccess('Opération rejetée');
        void reload();
      } else setError(d?.error || `Erreur ${r.status}`);
    } catch {
      setError('Erreur réseau');
    } finally {
      setActingId(null);
    }
  };

  // ── Pagination (10/page) ──
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page]
  );

  // Clamp page si la liste rétrécit (après validation).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = pageRows.map((r) => r._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  // ── Validation groupée (tout ou sélection) ──
  const validerLot = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setSuccess(null);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/operations-validation/${id}/valider`, {
          method: 'POST',
          credentials: 'include',
        });
        const d = await r.json().catch(() => null);
        if (r.ok && d?.success) ok += 1;
        else fail += 1;
      } catch {
        fail += 1;
      }
    }
    setSelected(new Set());
    if (fail === 0) setSuccess(`${ok} opération(s) validée(s)`);
    else setError(`${ok} validée(s), ${fail} en échec`);
    setBulkBusy(false);
    void reload();
  };

  const selectedIds = rows.filter((r) => selected.has(r._id)).map((r) => r._id);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.opsValider.pageTitle')} />
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
        title={t('dashboard.opsValider.pageTitle')}
        subtitle={
          isAgentOnly
            ? t('dashboard.opsValider.subtitleAgent')
            : t('dashboard.opsValider.subtitleAdmin')
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.opsValider.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-6xl space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-amber-600" />
                {t('dashboard.opsValider.sectionEnAttente')}
                <Badge className="ml-1 bg-amber-500 text-white hover:bg-amber-500">
                  {rows.length}
                </Badge>
              </CardTitle>
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={bulkBusy || selectedIds.length === 0}
                    onClick={() => void validerLot(selectedIds)}
                  >
                    {bulkBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Valider la sélection ({selectedIds.length})
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                    disabled={bulkBusy}
                    onClick={() => void validerLot(rows.map((r) => r._id))}
                  >
                    {bulkBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Valider tout ({rows.length})
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {rows.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">
                  {t('dashboard.opsValider.empty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 w-10">
                          <Checkbox
                            checked={allPageSelected}
                            onCheckedChange={togglePage}
                            aria-label="Tout sélectionner"
                          />
                        </th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.opsValider.colType')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.opsValider.colLibelle')}</th>
                        <th className="px-4 py-2.5 font-medium">
                          {t('dashboard.opsValider.colContrepartie')}
                        </th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.opsValider.colDate')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          {t('dashboard.opsValider.colMontant')}
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          {t('dashboard.opsValider.colActions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr
                          key={r._id}
                          className="border-b last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-2.5">
                            <Checkbox
                              checked={selected.has(r._id)}
                              onCheckedChange={() => toggleOne(r._id)}
                              aria-label="Sélectionner l'opération"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="text-[10px]">
                              {getOpTypeLabel(r.opType, t)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 font-medium">
                            {r.snapshot?.libelle || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {r.snapshot?.contrepartie || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                            {r.snapshot?.date
                              ? new Date(r.snapshot.date).toLocaleString(
                                  'fr-FR'
                                )
                              : new Date(r.submittedAt).toLocaleString('fr-FR')}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                            {fmt(Number(r.snapshot?.montant) || 0)} MRU
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex justify-end gap-1.5">
                              {r.opType === 'PAYEUR_PAIEMENT' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={viewerLoadingId === r._id}
                                  onClick={() => void openViewer(r)}
                                  title={t('dashboard.opsValider.voirRecus')}
                                >
                                  {viewerLoadingId === r._id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Eye className="h-3 w-3 sm:mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {t('dashboard.opsValider.voirRecus')}
                                  </span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                disabled={actingId === r._id}
                                onClick={() => void valider(r._id)}
                              >
                                {actingId === r._id ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="mr-1 h-3 w-3" />
                                )}
                                {t('dashboard.opsValider.valider')}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                disabled={actingId === r._id}
                                onClick={() => void rejeter(r._id)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                {t('dashboard.opsValider.rejeter')}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {totalPages > 1 && (
                <div className="mt-4 px-4 sm:px-0">
                  <MobilePagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={rows.length}
                    itemsPerPage={PAGE_SIZE}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>

      {/* Receipt viewer dialog */}
      <Dialog
        open={!!viewerRow}
        onOpenChange={(open) => {
          if (!open) setViewerRow(null);
        }}
      >
        <DialogContent className="max-w-4xl flex flex-col" style={{ height: '85vh' }}>
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.manutention.detail.recuViewerTitle', {
                nom: viewerRow?.snapshot?.libelle || '',
              })}
            </DialogTitle>
          </DialogHeader>
          {viewerLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewerUrls.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('dashboard.manutention.detail.recuViewerEmpty')}
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-hidden">
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {viewerUrls.length > 1 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={viewerIdx === 0}
                      onClick={() => setViewerIdx((i) => i - 1)}
                    >
                      {t('dashboard.manutention.detail.recuViewerPrev')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {viewerIdx + 1} / {viewerUrls.length}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={viewerIdx === viewerUrls.length - 1}
                      onClick={() => setViewerIdx((i) => i + 1)}
                    >
                      {t('dashboard.manutention.detail.recuViewerNext')}
                    </Button>
                  </>
                )}
                <span className="text-sm text-muted-foreground truncate flex-1">
                  {viewerUrls[viewerIdx]?.name}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(viewerUrls[viewerIdx]?.url, '_blank', 'noopener')
                  }
                >
                  <Eye className="mr-1 h-3 w-3" />
                  {t('dashboard.manutention.detail.recuViewerOpenTab')}
                </Button>
              </div>
              <div className="flex-1 overflow-hidden rounded border min-h-0">
                {viewerUrls[viewerIdx]?.url &&
                  (viewerUrls[viewerIdx].key.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img
                      src={viewerUrls[viewerIdx].url}
                      alt={viewerUrls[viewerIdx].name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={viewerUrls[viewerIdx].url}
                      title={viewerUrls[viewerIdx].name}
                      className="w-full h-full border-0"
                    />
                  ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
