import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
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
  IBonCommandeResponse,
  ICaisseListItem,
  UserRole,
} from '@/types';
import { ArrowLeft, CreditCard } from 'lucide-react';

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

export default function BonCommandeDetailPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();

  const id = useMemo(() => {
    const raw = router.query.id;
    return Array.isArray(raw) ? raw[0] || '' : raw || '';
  }, [router.query.id]);

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.ADMIN_LOGISTIQUE || userRole === UserRole.AGENT_TRANSIT || userRole === UserRole.COMPTABLE;

  const [bon, setBon] = useState<IBonCommandeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<IBonCommandeResponse | null>(null);
  const [caisses, setCaisses] = useState<ICaisseListItem[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string>('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, isAllowed, router]);

  const fetchBon = useCallback(async () => {
    if (!isAllowed || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/logistique/bons-commande/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('dashboard.logistique.bonsCommande.errLoad'));
      setBon(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.logistique.bonsCommande.errUnknown'));
    } finally {
      setLoading(false);
    }
  }, [id, isAllowed, t]);

  useEffect(() => {
    void fetchBon();
  }, [fetchBon]);

  const fetchCaisses = useCallback(async () => {
    try {
      const res = await fetch('/api/caisse/caisses');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCaisses(json.data);
      }
    } catch {
      // silent
    }
  }, []);

  const openPayDialog = useCallback(
    (target: IBonCommandeResponse) => {
      setPayTarget(target);
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
      setSelectedCaisseId('');
      setPayError(null);
      await fetchBon();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t('dashboard.logistique.bonsCommande.errUnknown'));
    } finally {
      setPaying(false);
    }
  }, [payTarget, selectedCaisseId, fetchBon, t]);

  if (status === 'loading') return <PageSkeleton />;
  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={bon ? `Bon ${bon.reference}` : t('dashboard.logistique.bonsCommande.detailFallbackTitle')}
        subtitle={t('dashboard.bonsCommande.detailSubtitle')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/logistique/bons-commande">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.logistique.actions.back')}
            </Link>
          </Button>
        }
      />

      <PageContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <PageSkeleton />
        ) : !bon ? (
          <Alert variant="destructive">
            <AlertDescription>{t('dashboard.logistique.bonsCommande.detailNotFound')}</AlertDescription>
          </Alert>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">{bon.reference}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {bon.client}
                  {bon.date
                    ? ` — ${new Date(bon.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
                    : ''}
                  {` — ${t('dashboard.logistique.bonsCommande.detailLignesCount', { count: bon.lignes.length })}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={STATUT_VARIANT[bon.statut]}>{t(`dashboard.logistique.statuses.bonCommande.${bon.statut}`)}</Badge>
                {bon.statut === BonCommandeStatut.CONFIRME && (
                  <Button size="sm" variant="default" onClick={() => openPayDialog(bon)}>
                    <CreditCard className="mr-1 h-3.5 w-3.5" />
                    {t('dashboard.logistique.bonsCommande.payBtn')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('dashboard.logistique.bonsCommande.detailFieldTotal')}</span>{' '}
                  <span className="font-medium">{formatMRU(bon.total)}</span>
                </div>
                {bon.caisseNom && (
                  <div>
                    <span className="text-muted-foreground">{t('dashboard.logistique.bonsCommande.detailFieldCaisseDebitee')}</span>{' '}
                    <span>{bon.caisseNom}</span>
                  </div>
                )}
                {bon.paidAt && (
                  <div>
                    <span className="text-muted-foreground">{t('dashboard.logistique.bonsCommande.detailFieldPaidAt')}</span>{' '}
                    <span>{new Date(bon.paidAt).toLocaleDateString('fr-FR')}</span>
                  </div>
                )}
                {bon.createdByNom && (
                  <div>
                    <span className="text-muted-foreground">{t('dashboard.logistique.bonsCommande.detailFieldCreatedBy')}</span>{' '}
                    <span>{bon.createdByNom}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">{t('dashboard.logistique.bonsCommande.detailColDescription')}</th>
                      <th className="text-right px-3 py-1.5 font-medium">{t('dashboard.logistique.bonsCommande.detailColMontant')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bon.lignes.map((l, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground">{l.description}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatMRU(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold">
                    <tr>
                      <td className="px-3 py-1.5">{t('dashboard.logistique.bonsCommande.detailTotalRow')}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatMRU(bon.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContent>

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
