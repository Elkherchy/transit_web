import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FactureStatus,
  PaiementStatus,
  IFacture,
  IPaiement,
  UserRole,
} from '@/types';
import { ArrowLeft, Download, FolderOpen, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import {
  buildFactureClientPdfModel,
  downloadFactureClientPdf,
  printFactureClientPdf,
} from '@/components/factures/facture-client-pdf';

export default function FactureDetail() {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const { id } = router.query;
  const [facture, setFacture] = useState<IFacture | null>(null);
  const [paiements, setPaiements] = useState<IPaiement[]>([]);
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [payMontant, setPayMontant] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [pdfAction, setPdfAction] = useState<null | 'print' | 'download'>(null);

  const isAgentTransit = user?.role === UserRole.AGENT_TRANSIT;
  const isAgentOrAdmin =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;

  const fetchFacture = async () => {
    if (!id || typeof id !== 'string') return;
    try {
      const response = await fetch(`/api/transit/factures/${id}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        const raw = data.data as IFacture & {
          paiements?: IPaiement[];
        };
        const { paiements: p, ...rest } = raw;
        setFacture(rest as IFacture);
        setPaiements(p || []);
      }
    } catch (error) {
      console.error('Error fetching facture:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFacture();
  }, [id]);

  const getStatusBadge = (status: FactureStatus | PaiementStatus) => {
    const statusColors: Record<string, string> = {
      [FactureStatus.BROUILLON]: 'bg-gray-500',
      [FactureStatus.EMIS]: 'bg-yellow-500',
      [FactureStatus.EN_VALIDATION]: 'bg-orange-500',
      [FactureStatus.EN_PAYE]: 'bg-orange-500',
      [FactureStatus.PAYE]: 'bg-green-500',
      [PaiementStatus.EN_ATTENTE]: 'bg-yellow-500',
      [PaiementStatus.VALIDE]: 'bg-green-500',
      [PaiementStatus.REJETE]: 'bg-red-500',
    };

    const statusLabels: Record<string, string> = {
      [FactureStatus.BROUILLON]: t('dashboard.factures.statusBrouillon'),
      [FactureStatus.EMIS]: t('dashboard.factures.statusEmis'),
      [FactureStatus.EN_VALIDATION]: t('dashboard.factures.statusEnValidation'),
      [FactureStatus.EN_PAYE]: t('dashboard.factures.statusEnPaye'),
      [FactureStatus.PAYE]: t('dashboard.factures.statusPaye'),
      [PaiementStatus.EN_ATTENTE]: t('dashboard.paiements.status.enAttente'),
      [PaiementStatus.VALIDE]: t('dashboard.paiements.status.valide'),
      [PaiementStatus.REJETE]: t('dashboard.paiements.status.rejete'),
    };

    return (
      <Badge className={statusColors[status] || 'bg-gray-500'}>
        {statusLabels[status] || String(status).replace(/_/g, ' ')}
      </Badge>
    );
  };

  const isPayeurUser =
    user?.role === UserRole.USER_PAYEUR &&
    facture &&
    facture.payeurId &&
    String(facture.payeurId) === String(user.id);

  const hasPaiementEnCours = paiements.some(
    (p) =>
      p.statut === PaiementStatus.EN_ATTENTE ||
      p.statut === PaiementStatus.EN_VALIDATION
  );

  useEffect(() => {
    if (!router.isReady || typeof id !== 'string' || !facture) return;
    if (router.query.paiement !== '1') return;
    if (
      isPayeurUser &&
      facture.statut === FactureStatus.EMIS &&
      !hasPaiementEnCours
    ) {
      setPayMontant(String(facture.totalFinal));
      setPayDate(new Date().toISOString().slice(0, 10));
      setPayFile(null);
      setPayError(null);
      setPayOpen(true);
    }
    void router.replace(`/dashboard/factures/${id}`, undefined, { shallow: true });
  }, [
    router,
    router.isReady,
    router.query.paiement,
    id,
    facture,
    isPayeurUser,
    hasPaiementEnCours,
  ]);

  const handleImprimerFacture = async () => {
    if (!facture) return;
    setPdfAction('print');
    try {
      const model = buildFactureClientPdfModel(facture);
      if (isAgentTransit) { model.interet = 0; model.total = model.totalOperations; }
      await printFactureClientPdf(model, window.location.origin);
    } catch (err) {
      console.error('Impression facture client:', err);
    } finally {
      setPdfAction(null);
    }
  };

  const handleTelechargerFacture = async () => {
    if (!facture) return;
    setPdfAction('download');
    try {
      const model = buildFactureClientPdfModel(facture);
      if (isAgentTransit) { model.interet = 0; model.total = model.totalOperations; }
      await downloadFactureClientPdf(model, window.location.origin);
    } catch (err) {
      console.error('Téléchargement facture client:', err);
    } finally {
      setPdfAction(null);
    }
  };

  const openPayDialog = () => {
    if (!facture) return;
    setPayMontant(String(facture.totalFinal));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayFile(null);
    setPayError(null);
    setPayOpen(true);
  };

  const handleSubmitPaiement = async () => {
    if (!facture) return;
    setPayError(null);
    if (!payFile) {
      setPayError(t('dashboard.factures.joignezRecu'));
      return;
    }
    const m = parseFloat(payMontant.replace(',', '.'));
    if (Number.isNaN(m) || m <= 0) {
      setPayError(t('dashboard.factures.montantInvalide'));
      return;
    }
    setPaySubmitting(true);
    try {
      const fd = new FormData();
      fd.append('factureId', facture._id);
      fd.append('montant', String(m));
      fd.append('datePaiement', payDate ? new Date(payDate).toISOString() : new Date().toISOString());
      fd.append('recu', payFile);
      const response = await fetch('/api/transit/paiements/soumettre-payeur', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await response.json();
      if (data.success) {
        setPayOpen(false);
        await fetchFacture();
      } else {
        setPayError(data.error || t('dashboard.factures.envoiImpossible'));
      }
    } catch {
      setPayError(t('common.errorNetwork'));
    } finally {
      setPaySubmitting(false);
    }
  };

  const backList = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild className="shrink-0">
        <Link href="/dashboard/factures">
          <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
          {t('dashboard.factures.headerListe')}
        </Link>
      </Button>
      {!loading && facture ? (
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={`/dashboard/transit/details?id=${encodeURIComponent(facture.transitId)}`}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('dashboard.factures.headerDossierTransit')}
          </Link>
        </Button>
      ) : null}
    </div>
  );

  const headerTitle = loading
    ? t('dashboard.factures.factureClient')
    : facture
      ? t('dashboard.factures.factureNumber', { numero: facture.numero })
      : t('dashboard.factures.factureNotFound');
  const headerSubtitle = loading
    ? t('dashboard.factures.loadingSubtitle')
    : facture
      ? t('dashboard.factures.subtitleDetail')
      : t('dashboard.factures.subtitleNotFound');

  return (
    <DashboardLayout>
      <PageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backButton={backList}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {loading ? (
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        ) : !facture ? (
          <div className="rounded-xl border border-border/60 bg-card px-6 py-12 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">
              {t('dashboard.factures.factureNotFoundTitle')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('dashboard.factures.factureNotFoundDesc')}
            </p>
          </div>
        ) : (
      <div className="space-y-6 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
        <div className="flex flex-row gap-2 justify-end">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={pdfAction !== null}
            onClick={() => void handleImprimerFacture()}
            className="flex-1 sm:flex-none"
          >
            {pdfAction === 'print' ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Printer className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">{t('dashboard.factures.headerImprimer')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pdfAction !== null}
            onClick={() => void handleTelechargerFacture()}
            className="flex-1 sm:flex-none"
          >
            {pdfAction === 'download' ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">{t('dashboard.factures.headerTelecharger')}</span>
          </Button>
        </div>
        <div className="">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">{t('dashboard.factures.informationsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblNumero')}</span>
                <span className="font-medium">{facture.numero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblBl')}</span>
                <span className="font-medium">{facture.bl || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblClient')}</span>
                <span className="font-medium">{facture.transitClient || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblObjet')}</span>
                <span className="font-medium">{facture.transitObjet || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblStatut')}</span>
                {getStatusBadge(facture.statut)}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblTotalOps')}</span>
                <span>{facture.totalOperations.toLocaleString()} MRU</span>
              </div>
              {!isAgentTransit && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblInteret')}</span>
                <span>{facture.interet.toLocaleString()} MRU</span>
              </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblDejaPaye')}</span>
                <span className="font-medium text-green-700">
                  {(facture.montantPaye || 0).toLocaleString('fr-FR')} MRU
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('dashboard.factures.lblResteDu')}</span>
                <span
                  className={
                    facture.totalFinal - (facture.montantPaye || 0) > 0
                      ? 'font-medium text-amber-700'
                      : 'font-medium text-muted-foreground'
                  }
                >
                  {Math.max(
                    0,
                    facture.totalFinal - (facture.montantPaye || 0)
                  ).toLocaleString('fr-FR')}{' '}
                  MRU
                </span>
              </div>
              <div className="flex justify-between border-t pt-4">
                <span className="font-bold">{t('dashboard.factures.lblTotalFinal')}</span>
                <span className="font-bold text-lg">{facture.totalFinal.toLocaleString()} MRU</span>
              </div>
              {facture.dateEmission && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('dashboard.factures.lblDateEmission')}</span>
                  <span>{new Date(facture.dateEmission).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {paiements.length > 0 && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">
                  {t('dashboard.factures.paiementsCount', { count: paiements.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">{t('dashboard.factures.colDate')}</th>
                        <th className="px-4 py-2 font-medium text-right">
                          {t('dashboard.factures.colMontant')}
                        </th>
                        <th className="px-4 py-2 font-medium">{t('dashboard.factures.colStatut')}</th>
                        <th className="px-4 py-2 font-medium">{t('dashboard.factures.colReference')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paiements.map((p) => (
                        <tr key={String(p._id)} className="border-b last:border-b-0">
                          <td className="px-4 py-2 tabular-nums">
                            {p.datePaiement
                              ? new Date(p.datePaiement).toLocaleDateString('fr-FR')
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-green-700">
                            +{Number(p.montant || 0).toLocaleString('fr-FR', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            MRU
                          </td>
                          <td className="px-4 py-2">
                            {getStatusBadge(p.statut)}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {p.commentaire || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('dashboard.factures.declareDialog')}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.factures.indiquezMontant')}
              </p>
            </DialogHeader>
            {payError && (
              <p className="text-sm text-destructive" role="alert">
                {payError}
              </p>
            )}
            <div className="grid gap-3 py-2">
              <div className="grid gap-2">
                <Label htmlFor="pay-montant">{t('dashboard.factures.lblMontantMru')}</Label>
                <Input
                  id="pay-montant"
                  inputMode="decimal"
                  value={payMontant}
                  onChange={(e) => setPayMontant(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-date">{t('dashboard.factures.lblDatePaiement')}</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-recu">{t('dashboard.factures.lblRecuLimit')}</Label>
                <Input
                  id="pay-recu"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                  onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPayOpen(false)}
                disabled={paySubmitting}
              >
                {t('actions.cancel')}
              </Button>
              <Button type="button" onClick={() => void handleSubmitPaiement()} disabled={paySubmitting}>
                {paySubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('dashboard.factures.envoyerValidation')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
