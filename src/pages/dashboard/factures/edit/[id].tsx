import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FactureStatus, IFacture, IPaiement, UserRole } from '@/types';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

function ReadOnlyRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="rounded-lg border border-input/60 bg-muted/30 px-3 py-2 text-sm min-h-10 flex items-center">
        {value}
      </div>
    </div>
  );
}

export default function FactureEditInteretPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const { id } = router.query;
  const factureId = typeof id === 'string' ? id : undefined;

  const [loading, setLoading] = useState(true);
  const [facture, setFacture] = useState<IFacture | null>(null);
  const [interetInput, setInteretInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const isAgentOrAdmin =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;

  const fetchFacture = useCallback(async () => {
    if (!factureId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/transit/factures/${factureId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) {
        setFacture(null);
        return;
      }
      const raw = data.data as IFacture & { paiements?: IPaiement[] };
      const { paiements: _p, ...rest } = raw;
      setFacture(rest);
      setInteretInput(String(rest.interet ?? 0));
    } catch {
      setFacture(null);
    } finally {
      setLoading(false);
    }
  }, [factureId]);

  useEffect(() => {
    if (router.isReady && factureId) {
      void fetchFacture();
    }
  }, [router.isReady, factureId, fetchFacture]);

  const totalOperations = facture?.totalOperations ?? 0;

  const interetNum = useMemo(() => {
    const n = parseFloat(String(interetInput).replace(',', '.'));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [interetInput]);

  const totalFinalPreview = totalOperations + interetNum;

  const canEdit =
    isAgentOrAdmin && facture && facture.statut !== FactureStatus.PAYE;

  const handleSave = async () => {
    if (!factureId || !facture || !canEdit) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/transit/factures/${factureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ interet: interetNum }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'ok', text: t('dashboard.factures.interetSaved') });
        const raw = data.data as IFacture;
        setFacture((prev) =>
          prev
            ? {
                ...prev,
                interet: raw.interet,
                totalFinal: raw.totalFinal,
              }
            : null
        );
        setInteretInput(String(raw.interet ?? 0));
      } else {
        setFeedback({
          type: 'err',
          text: data.error || t('dashboard.factures.saveImpossible'),
        });
      }
    } catch {
      setFeedback({ type: 'err', text: t('common.errorNetwork') });
    } finally {
      setSaving(false);
    }
  };

  const backList = (
    <Button variant="outline" size="sm" asChild className="shrink-0">
      <Link href="/dashboard/factures">
        <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
        {t('dashboard.factures.headerListe')}
      </Link>
    </Button>
  );

  const sessionLoading = sessionStatus === 'loading' || !router.isReady;
  const headerSubtitle = sessionLoading
    ? t('dashboard.factures.loadingSubtitle')
    : !isAgentOrAdmin
      ? t('dashboard.factures.editFactureAccessDenied')
      : loading
        ? t('dashboard.factures.editFactureLoading')
        : !facture
          ? t('dashboard.factures.editFactureNotFound')
          : !canEdit
            ? t('dashboard.factures.editFactureReadOnly')
            : t('dashboard.factures.editFactureSubtitle');

  const statusColors: Record<FactureStatus, string> = {
    [FactureStatus.BROUILLON]: 'bg-gray-500',
    [FactureStatus.EMIS]: 'bg-yellow-500',
    [FactureStatus.EN_VALIDATION]: 'bg-orange-500',
    [FactureStatus.EN_PAYE]: 'bg-blue-500',
    [FactureStatus.PAYE]: 'bg-green-500',
  };

  const statusLabels: Record<FactureStatus, string> = {
    [FactureStatus.BROUILLON]: t('dashboard.factures.statusBrouillon'),
    [FactureStatus.EMIS]: t('dashboard.factures.statusEmis'),
    [FactureStatus.EN_VALIDATION]: t('dashboard.factures.statusEnValidation'),
    [FactureStatus.EN_PAYE]: t('dashboard.factures.statusEnPaye'),
    [FactureStatus.PAYE]: t('dashboard.factures.statusPaye'),
  };

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.factures.editInteret')}
        subtitle={headerSubtitle}
        backButton={router.isReady ? backList : undefined}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {sessionLoading ? (
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        ) : !isAgentOrAdmin ? (
          <p className="py-12 text-center text-muted-foreground">
            {t('dashboard.factures.editFactureAccessDeniedFull')}
          </p>
        ) : loading ? (
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        ) : !facture ? (
          <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-border/60 bg-card px-6 py-12 text-center shadow-sm">
            <p className="text-muted-foreground">{t('dashboard.factures.editFactureNotFound')}</p>
            <Button variant="outline" asChild>
              <Link href="/dashboard/factures">{t('dashboard.factures.retourListe')}</Link>
            </Button>
          </div>
        ) : !canEdit ? (
          <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
            <p className="text-muted-foreground">
              {t('dashboard.factures.editFactureReadOnly')}
            </p>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/factures/${facture._id}`}>{t('dashboard.factures.voirFacture')}</Link>
            </Button>
          </div>
        ) : (
      <div className="mx-auto w-full max-w-7xl space-y-6 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
        {feedback && (
          <div
            role="status"
            className={`rounded-lg border px-4 py-3 text-sm ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.factures.factureCardTitle', { numero: facture.numero })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ReadOnlyRow label={t('dashboard.factures.colNumero')} value={facture.numero} />
            <ReadOnlyRow
              label={t('dashboard.factures.colStatut')}
              value={
                <Badge className={statusColors[facture.statut]}>
                  {statusLabels[facture.statut] || facture.statut}
                </Badge>
              }
            />
            <ReadOnlyRow
              label={t('dashboard.factures.lblDossierTransit')}
              value={
                <span className="font-mono text-xs">{facture.transitId}</span>
              }
            />
            {facture.dateEmission && (
              <ReadOnlyRow
                label={t('dashboard.factures.lblDateEmission')}
                value={new Date(facture.dateEmission).toLocaleDateString('fr-FR')}
              />
            )}
            <ReadOnlyRow
              label={t('dashboard.factures.lblTotalOperations')}
              value={
                <span className="tabular-nums font-medium">
                  {totalOperations.toLocaleString('fr-FR')} MRU
                </span>
              }
            />

            <div className="grid gap-1.5 sm:grid-cols-[10rem_1fr] sm:items-center sm:gap-4">
              <Label htmlFor="interet-edit" className="text-foreground">
                {t('dashboard.factures.lblInteretMru')}
              </Label>
              <Input
                id="interet-edit"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="h-11 tabular-nums max-w-xs"
                value={interetInput}
                onChange={(e) => setInteretInput(e.target.value)}
              />
            </div>

            <ReadOnlyRow
              label={t('dashboard.factures.lblTotalFinalCard')}
              value={
                <span className="tabular-nums font-bold text-lg text-primary">
                  {totalFinalPreview.toLocaleString('fr-FR')} MRU
                </span>
              }
            />

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => void router.push('/dashboard/factures')}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="button"
                className="sm:w-auto"
                disabled={
                  saving ||
                  interetNum === (facture.interet ?? 0)
                }
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('actions.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
