import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Eye,
  XCircle,
  Unlock,
} from 'lucide-react';

interface PayeurPaiementRow {
  designationId: string;
  transitId: string;
  bl?: string;
  client?: string;
  designationNom: string;
  montant: number;
  payeurId?: string;
  payeurNom?: string;
  payeurEmail?: string;
  paidAt: string | Date;
  recus?: Array<{ key: string; name?: string }>;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

/** Clé d'opération identifiant un paiement payeur unique. */
function opKey(p: PayeurPaiementRow): string {
  return `PAYEUR_PAIEMENT:${p.designationId}`;
}

export default function CaissierOperationsAValiderPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const canAccess =
    user?.role === UserRole.CAISSIER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;

  const [rows, setRows] = useState<PayeurPaiementRow[]>([]);
  /** Map clé op → statut côté OperationValidation (envoyée à l'agent). */
  const [sentMap, setSentMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  // Receipt viewer state
  const [viewerRow, setViewerRow] = useState<PayeurPaiementRow | null>(null);
  const [viewerUrls, setViewerUrls] = useState<Array<{ url: string; name: string; key: string }>>([]);
  const [viewerIdx, setViewerIdx] = useState(0);
  const [viewerLoading, setViewerLoading] = useState(false);

  const openViewer = useCallback(
    async (row: PayeurPaiementRow) => {
      if (!row.recus || row.recus.length === 0) return;
      setViewerRow(row);
      setViewerUrls([]);
      setViewerLoading(true);
      setViewerIdx(0);
      setError(null);
      try {
        const urls = await Promise.all(
          row.recus.filter((r) => r.key).map(async (r) => {
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
        setError(t('dashboard.caissier.opsValider.errNetwork'));
        setViewerRow(null);
      } finally {
        setViewerLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payeursRes, validations] = await Promise.all([
        fetch('/api/journee/payeur-paiements', { credentials: 'include' }).then(
          (x) => x.json()
        ),
        Promise.all([
          fetch('/api/operations-validation?statut=EN_ATTENTE_AGENT&opType=PAYEUR_PAIEMENT&limit=500', {
            credentials: 'include',
          }).then((x) => x.json()),
          fetch('/api/operations-validation?statut=EN_ATTENTE_ADMIN&opType=PAYEUR_PAIEMENT&limit=500', {
            credentials: 'include',
          }).then((x) => x.json()),
          fetch('/api/operations-validation?statut=VALIDEE_ADMIN&opType=PAYEUR_PAIEMENT&limit=500', {
            credentials: 'include',
          }).then((x) => x.json()),
          fetch('/api/operations-validation?statut=VALIDEE_AGENT&opType=PAYEUR_PAIEMENT&limit=500', {
            credentials: 'include',
          }).then((x) => x.json()),
          fetch('/api/operations-validation?statut=REJETEE&opType=PAYEUR_PAIEMENT&limit=500', {
            credentials: 'include',
          }).then((x) => x.json()),
        ]),
      ]);

      if (payeursRes?.success) {
        setRows((payeursRes.data || []) as PayeurPaiementRow[]);
      } else {
        setError(payeursRes?.error || t('dashboard.caissier.opsValider.errLoad'));
      }

      const map = new Map<string, string>();
      for (const r of validations) {
        if (!r?.success) continue;
        for (const v of r.data || []) {
          map.set(`${v.opType}:${v.opId}`, v.statut);
        }
      }
      setSentMap(map);
    } catch {
      setError(t('dashboard.caissier.opsValider.errNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  const rejeter = useCallback(
    async (row: PayeurPaiementRow) => {
      const motif =
        window.prompt(t('dashboard.caissier.opsValider.motifPrompt'))?.trim() || '';
      const key = opKey(row);
      setActingKey(key);
      setError(null);
      setSuccess(null);
      try {
        const r = await fetch('/api/operations-validation/reject-paiement', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ designationId: row.designationId, motif }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setSuccess(t('dashboard.caissier.opsValider.successRejete'));
          void reload();
        } else {
          setError(data?.error || `Erreur ${r.status}`);
        }
      } catch {
        setError(t('dashboard.caissier.opsValider.errNetwork'));
      } finally {
        setActingKey(null);
      }
    },
    [reload, t]
  );

  const liberer = useCallback(
    async (row: PayeurPaiementRow) => {
      const motif =
        window.prompt(t('dashboard.caissier.opsValider.motifLibererPrompt'))?.trim() || '';
      const key = opKey(row);
      setActingKey(key);
      setError(null);
      setSuccess(null);
      try {
        const r = await fetch('/api/operations-validation/liberer-designation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ designationId: row.designationId, motif }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setSuccess(t('dashboard.caissier.opsValider.successLibere'));
          void reload();
        } else {
          setError(data?.error || `Erreur ${r.status}`);
        }
      } catch {
        setError(t('dashboard.caissier.opsValider.errNetwork'));
      } finally {
        setActingKey(null);
      }
    },
    [reload, t]
  );

  const valider = useCallback(
    async (row: PayeurPaiementRow) => {
      const key = opKey(row);
      setActingKey(key);
      setError(null);
      setSuccess(null);
      try {
        const r = await fetch('/api/operations-validation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                opType: 'PAYEUR_PAIEMENT',
                opId: row.designationId,
                snapshot: {
                  libelle: `Paiement ${row.designationNom}${row.bl ? ` · BL ${row.bl}` : ''}`,
                  montant: Number(row.montant) || 0,
                  contrepartie: row.payeurNom || row.payeurEmail,
                  date: new Date(row.paidAt),
                },
              },
            ],
          }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setSuccess(t('dashboard.caissier.opsValider.successValide'));
          void reload();
        } else {
          setError(data?.error || `Erreur ${r.status}`);
        }
      } catch {
        setError(t('dashboard.caissier.opsValider.errNetwork'));
      } finally {
        setActingKey(null);
      }
    },
    [reload, t]
  );

  const { pending, sentToAgent, agentValidated, rejected } = useMemo(() => {
    const p: PayeurPaiementRow[] = [];
    const s: PayeurPaiementRow[] = [];
    const v: PayeurPaiementRow[] = [];
    const r: PayeurPaiementRow[] = [];
    for (const row of rows) {
      const k = opKey(row);
      const st = sentMap.get(k);
      if (!st) p.push(row);
      // En cours dans la chaîne agent/admin : agent en attente OU admin en attente.
      else if (st === 'EN_ATTENTE_AGENT' || st === 'EN_ATTENTE_ADMIN') s.push(row);
      // Validation finale (admin) — legacy VALIDEE_AGENT inclus pour compat.
      else if (st === 'VALIDEE_ADMIN' || st === 'VALIDEE_AGENT') v.push(row);
      else if (st === 'REJETEE') r.push(row);
    }
    return {
      pending: p,
      sentToAgent: s,
      agentValidated: v,
      rejected: r,
    };
  }, [rows, sentMap]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.opsValider.pageTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!canAccess) return null;

  const renderTable = (
    label: string,
    icon: React.ReactNode,
    badge: React.ReactNode,
    data: PayeurPaiementRow[],
    options: { withValiderBtn?: boolean; withRejectedActions?: boolean; tone?: 'pending' | 'sent' | 'valid' | 'rejected' } = {}
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {label}
          {badge}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {data.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">
            {t('dashboard.caissier.opsValider.noOp')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t('dashboard.caissier.opsValider.colDate')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('dashboard.caissier.opsValider.colDesignation')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('dashboard.caissier.opsValider.colBlClient')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('dashboard.caissier.opsValider.colPayeur')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t('dashboard.caissier.opsValider.colMontant')}</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {t('dashboard.caissier.opsValider.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const k = opKey(r);
                  return (
                    <tr
                      key={k}
                      className={
                        options.tone === 'pending'
                          ? 'border-b bg-amber-50/30 hover:bg-amber-50/60'
                          : 'border-b last:border-0 hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-2.5 tabular-nums text-xs text-muted-foreground">
                        {new Date(r.paidAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {r.designationNom}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.bl || '—'}
                        {r.client ? ` · ${r.client}` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.payeurNom || r.payeurEmail || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {fmt(r.montant)} MRU
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {r.recus && r.recus.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={viewerLoading && viewerRow?.designationId === r.designationId}
                              onClick={() => void openViewer(r)}
                              title={t('dashboard.caissier.opsValider.titleVoirRecus', { count: r.recus.length })}
                            >
                              {viewerLoading && viewerRow?.designationId === r.designationId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3 sm:mr-1" />
                              )}
                              <span className="hidden sm:inline">
                                {r.recus.length > 1
                                  ? t('dashboard.caissier.opsValider.btnVoirCount', { count: r.recus.length })
                                  : t('dashboard.caissier.opsValider.btnVoir')}
                              </span>
                            </Button>
                          )}
                          {options.withValiderBtn && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                disabled={actingKey === k}
                                onClick={() => void valider(r)}
                              >
                                {actingKey === k ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="mr-1 h-3 w-3" />
                                )}
                                {t('dashboard.caissier.opsValider.btnValider')}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                disabled={actingKey === k}
                                onClick={() => void rejeter(r)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                {t('dashboard.caissier.opsValider.btnRejeter')}
                              </Button>
                            </>
                          )}
                          {options.withRejectedActions && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                disabled={actingKey === k}
                                onClick={() => void valider(r)}
                                title={t('dashboard.caissier.opsValider.btnRevalider')}
                              >
                                {actingKey === k ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="mr-1 h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">
                                  {t('dashboard.caissier.opsValider.btnRevalider')}
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                disabled={actingKey === k}
                                onClick={() => void rejeter(r)}
                                title={t('dashboard.caissier.opsValider.btnRejeterDef')}
                              >
                                {actingKey === k ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <XCircle className="mr-1 h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">
                                  {t('dashboard.caissier.opsValider.btnRejeterDef')}
                                </span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs border-amber-500 text-amber-700 hover:bg-amber-50"
                                disabled={actingKey === k}
                                onClick={() => void liberer(r)}
                                title={t('dashboard.caissier.opsValider.btnLiberer')}
                              >
                                {actingKey === k ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <Unlock className="mr-1 h-3 w-3" />
                                )}
                                <span className="hidden sm:inline">
                                  {t('dashboard.caissier.opsValider.btnLiberer')}
                                </span>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.opsValider.pageTitle')}
        subtitle={t('dashboard.caissier.opsValider.pageSubtitle')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.caissier.opsValider.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-7xl space-y-4">
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

          {renderTable(
            t('dashboard.caissier.opsValider.sectionPending'),
            <Clock className="h-4 w-4 text-amber-600" />,
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              {pending.length}
            </Badge>,
            pending,
            { withValiderBtn: true, tone: 'pending' }
          )}
          {sentToAgent.length > 0 &&
            renderTable(
              t('dashboard.caissier.opsValider.sectionAgent'),
              <Clock className="h-4 w-4 text-orange-500" />,
              <Badge className="bg-orange-500 text-white hover:bg-orange-500">
                {sentToAgent.length}
              </Badge>,
              sentToAgent,
              { tone: 'sent' }
            )}
          {agentValidated.length > 0 &&
            renderTable(
              t('dashboard.caissier.opsValider.sectionValidated'),
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {agentValidated.length}
              </Badge>,
              agentValidated,
              { tone: 'valid' }
            )}
          {rejected.length > 0 &&
            renderTable(
              t('dashboard.caissier.opsValider.sectionRejected'),
              <AlertCircle className="h-4 w-4 text-red-600" />,
              <Badge variant="destructive">{rejected.length}</Badge>,
              rejected,
              { tone: 'rejected', withRejectedActions: true }
            )}
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
                nom: viewerRow?.designationNom || '',
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
