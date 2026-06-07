import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  /** Ouvre les reçus joints dans de nouveaux onglets via URL signée S3. */
  const openRecus = useCallback(
    async (row: PayeurPaiementRow) => {
      if (!row.recus || row.recus.length === 0) {
        setError('Aucun reçu joint à ce paiement.');
        return;
      }
      const key = opKey(row);
      setOpeningKey(key);
      setError(null);
      try {
        for (const r of row.recus) {
          if (!r.key) continue;
          const res = await fetch(
            `/api/documents/${encodeURIComponent(r.key)}`,
            { credentials: 'include' }
          );
          const d = await res.json().catch(() => null);
          if (d?.success && d.url) {
            window.open(d.url, '_blank', 'noopener');
          } else {
            setError(d?.error || 'Reçu introuvable');
          }
        }
      } catch {
        setError('Erreur réseau');
      } finally {
        setOpeningKey(null);
      }
    },
    []
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
        setError(payeursRes?.error || 'Erreur de chargement');
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
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  const rejeter = useCallback(
    async (row: PayeurPaiementRow) => {
      const motif =
        window.prompt('Motif du rejet (optionnel) :')?.trim() || '';
      const key = opKey(row);
      setActingKey(key);
      setError(null);
      setSuccess(null);
      try {
        const r = await fetch('/api/operations-validation/reject-paiement', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designationId: row.designationId,
            motif,
          }),
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data?.success) {
          setSuccess('Paiement rejeté');
          void reload();
        } else {
          setError(data?.error || `Erreur ${r.status}`);
        }
      } catch {
        setError('Erreur réseau');
      } finally {
        setActingKey(null);
      }
    },
    [reload]
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
          setSuccess(
            "Paiement validé par le caissier — en attente de validation par l'agent transit."
          );
          void reload();
        } else {
          setError(data?.error || `Erreur ${r.status}`);
        }
      } catch {
        setError('Erreur réseau');
      } finally {
        setActingKey(null);
      }
    },
    [reload]
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
        <PageHeader title="Opérations à valider" />
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
    options: { withValiderBtn?: boolean; tone?: 'pending' | 'sent' | 'valid' | 'rejected' } = {}
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
            Aucune opération.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Désignation</th>
                  <th className="px-4 py-2.5 font-medium">BL · Client</th>
                  <th className="px-4 py-2.5 font-medium">Payeur</th>
                  <th className="px-4 py-2.5 text-right font-medium">Montant</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Actions
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
                              disabled={openingKey === k}
                              onClick={() => void openRecus(r)}
                              title={`Voir ${r.recus.length} reçu(s)`}
                            >
                              {openingKey === k ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3 sm:mr-1" />
                              )}
                              <span className="hidden sm:inline">
                                Voir{r.recus.length > 1 ? ` (${r.recus.length})` : ''}
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
                                Valider
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                disabled={actingKey === k}
                                onClick={() => void rejeter(r)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejeter
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
        title="Opérations à valider"
        subtitle="Paiements payeurs en attente de votre validation. Une fois validés, l'agent transit doit également valider."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Actualiser</span>
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
            'À valider par moi',
            <Clock className="h-4 w-4 text-amber-600" />,
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
              {pending.length}
            </Badge>,
            pending,
            { withValiderBtn: true, tone: 'pending' }
          )}
          {sentToAgent.length > 0 &&
            renderTable(
              'En attente agent transit',
              <Clock className="h-4 w-4 text-orange-500" />,
              <Badge className="bg-orange-500 text-white hover:bg-orange-500">
                {sentToAgent.length}
              </Badge>,
              sentToAgent,
              { tone: 'sent' }
            )}
          {agentValidated.length > 0 &&
            renderTable(
              'Validées par l\'agent transit',
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                {agentValidated.length}
              </Badge>,
              agentValidated,
              { tone: 'valid' }
            )}
          {rejected.length > 0 &&
            renderTable(
              'Rejetées',
              <AlertCircle className="h-4 w-4 text-red-600" />,
              <Badge variant="destructive">{rejected.length}</Badge>,
              rejected,
              { tone: 'rejected' }
            )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
