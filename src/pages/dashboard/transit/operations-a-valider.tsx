import { useCallback, useEffect, useState } from 'react';
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
import { UserRole } from '@/types';
import {
  RefreshCcw,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-amber-600" />
                {t('dashboard.opsValider.sectionEnAttente')}
                <Badge className="ml-1 bg-amber-500 text-white hover:bg-amber-500">
                  {rows.length}
                </Badge>
              </CardTitle>
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
                      {rows.map((r) => (
                        <tr
                          key={r._id}
                          className="border-b last:border-0 hover:bg-slate-50"
                        >
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
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
