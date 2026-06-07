import React, { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PDFView } from '@/components/ui/pdf-view';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserRole, type IFactureManutention, type ILigneEntreprise, FactureManutentionStatus, type IUserResponse, type IManutentionPaiement } from '@/types';
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle2, MoreHorizontal, FileText } from 'lucide-react';

interface LigneForm {
  id: string;
  nomEntreprise: string;
  bl: string;
  montant: string;
}

interface PaiementRecuPreview extends Pick<IManutentionPaiement, '_id' | 'recuUrl' | 'recuFilename'> {}

export default function EditFactureManutention() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const { id } = router.query;

  const [facture, setFacture] = useState<IFactureManutention | null>(null);
  const [bl, setBl] = useState('');
  const [lignes, setLignes] = useState<LigneForm[]>([]);
  const [payeurId, setPayeurId] = useState<string>('');
  const [payeurs, setPayeurs] = useState<IUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [validatingPaiement, setValidatingPaiement] = useState(false);
  const [recuLoading, setRecuLoading] = useState(false);
  const [recuError, setRecuError] = useState<string | null>(null);
  const [recuDisplayUrl, setRecuDisplayUrl] = useState<string | null>(null);
  const [selectedRecu, setSelectedRecu] = useState<PaiementRecuPreview | null>(null);

  const isCaissier = user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;
  const isUserCaissier = user?.role === UserRole.CAISSIER;
  const isEditable = facture?.statut === FactureManutentionStatus.BROUILLON || 
                     facture?.statut === FactureManutentionStatus.EN_ATTENTE_PAIEMENT;
  const canConvert = facture?.statut === FactureManutentionStatus.CLOTURE && !facture?.transitId;

  // Redirection si pas caissier
  useEffect(() => {
    if (status !== 'loading' && user && !isCaissier) {
      void router.replace('/dashboard');
    }
  }, [status, user, isCaissier, router]);

  // Charger la facture
  useEffect(() => {
    if (!id || !isCaissier) return;

    const fetchFacture = async () => {
      try {
        const res = await fetch(`/api/manutention/${id}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          const f = data.data as IFactureManutention;
          setFacture(f);
          setBl(f.bl);
          setPayeurId(f.payeurId || 'none');
          setLignes(
            f.lignesEntreprise.map((l, idx) => ({
              id: idx.toString(),
              nomEntreprise: l.nomEntreprise,
              bl: l.bl,
              montant: l.montant.toString(),
            }))
          );
        } else {
          setError(data.error || t('dashboard.caissier.factureNotFound'));
        }
      } catch {
        setError(t('common.errorNetwork'));
      } finally {
        setLoading(false);
      }
    };

    void fetchFacture();
  }, [id, isCaissier]);

  useEffect(() => {
    if (!id || !isCaissier) return;
    let cancelled = false;

    const fetchRecu = async () => {
      setRecuLoading(true);
      setRecuError(null);
      setRecuDisplayUrl(null);
      setSelectedRecu(null);
      try {
        const res = await fetch(
          `/api/manutention/paiements?factureManutentionId=${encodeURIComponent(String(id))}&limit=20`,
          { credentials: 'include' }
        );
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          setRecuError(t('dashboard.caissier.errLoadRecu'));
          return;
        }

        const paiementWithRecu = ((data.data?.data || []) as PaiementRecuPreview[]).find(
          (paiement) => Boolean(paiement.recuUrl)
        );

        if (!paiementWithRecu?.recuUrl) {
          return;
        }

        setSelectedRecu(paiementWithRecu);
        if (
          paiementWithRecu.recuUrl.startsWith('http://') ||
          paiementWithRecu.recuUrl.startsWith('https://')
        ) {
          setRecuDisplayUrl(paiementWithRecu.recuUrl);
          return;
        }

        const recuRes = await fetch(
          `/api/documents/${encodeURIComponent(paiementWithRecu.recuUrl)}`,
          { credentials: 'include' }
        );
        const recuData = await recuRes.json();
        if (cancelled) return;
        if (recuData.url) {
          setRecuDisplayUrl(recuData.url);
        } else {
          setRecuError(t('dashboard.caissier.errLoadRecu'));
        }
      } catch {
        if (!cancelled) {
          setRecuError(t('common.errorNetwork'));
        }
      } finally {
        if (!cancelled) {
          setRecuLoading(false);
        }
      }
    };

    void fetchRecu();
    return () => {
      cancelled = true;
    };
  }, [id, isCaissier]);

  // Charger les payeurs
  useEffect(() => {
    if (!isCaissier) return;

    const fetchPayeurs = async () => {
      try {
        const res = await fetch('/api/users/payeurs', {
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          setPayeurs(data.data || []);
        }
      } catch (err) {
        console.error('Error fetching payeurs:', err);
      }
    };

    void fetchPayeurs();
  }, [isCaissier]);

  const addLigne = () => {
    setLignes((prev) => [
      ...prev,
      { id: Date.now().toString(), nomEntreprise: '', bl, montant: '' },
    ]);
  };

  const removeLigne = (id: string) => {
    if (lignes.length <= 1) {
      setError(t('dashboard.caissier.errLigneRequired'));
      return;
    }
    setLignes((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLigne = (id: string, field: keyof LigneForm, value: string) => {
    setLignes((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!bl.trim()) {
      setError(t('dashboard.caissier.errBlRequired'));
      return;
    }

    // Validation des lignes
    const lignesData: ILigneEntreprise[] = [];
    for (const ligne of lignes) {
      if (!ligne.nomEntreprise.trim() || !ligne.bl.trim() || !ligne.montant) {
        setError(t('dashboard.caissier.errLigneFieldsRequired'));
        return;
      }
      const montant = parseFloat(ligne.montant);
      if (isNaN(montant) || montant < 0) {
        setError(t('dashboard.caissier.errMontantInvalid'));
        return;
      }
      lignesData.push({
        nomEntreprise: ligne.nomEntreprise.trim(),
        bl: ligne.bl.trim(),
        montant,
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/manutention/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bl: bl.trim(),
          lignesEntreprise: lignesData,
          payeurId: payeurId === 'none' ? undefined : payeurId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        void router.push('/dashboard/caissier/factures-manutention');
      } else {
        setError(data.error || t('dashboard.caissier.errUpdate'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertToTransit = async () => {
    if (!window.confirm(t('dashboard.caissier.confirmConvert'))) {
      return;
    }

    setConverting(true);
    try {
      const res = await fetch('/api/manutention/convert-to-transit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factureManutentionId: id }),
      });

      const data = await res.json();
      if (data.success) {
        void router.push(`/dashboard/transit/edit/${data.data.transitId}`);
      } else {
        setError(data.error || t('dashboard.caissier.errConvert'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setConverting(false);
    }
  };

  const handleValiderPaiement = async () => {
    if (!id || typeof id !== 'string') return;
    if (
      !window.confirm(
        t('dashboard.caissier.confirmValider')
      )
    ) {
      return;
    }
    setError(null);
    setValidatingPaiement(true);
    try {
      const res = await fetch('/api/manutention/valider-paiement', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factureManutentionId: id }),
      });
      const data = await res.json();
      if (data.success) {
        const refreshed = await fetch(`/api/manutention/${id}`, { credentials: 'include' });
        const refreshedJson = await refreshed.json();
        if (refreshedJson.success) {
          const f = refreshedJson.data as IFactureManutention;
          setFacture(f);
        } else {
          void router.push('/dashboard/caissier/factures-manutention');
        }
      } else {
        setError(data.error || t('dashboard.caissier.errValider'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setValidatingPaiement(false);
    }
  };

  const getStatusBadge = (status: FactureManutentionStatus) => {
    const colors: Record<FactureManutentionStatus, string> = {
      [FactureManutentionStatus.BROUILLON]: 'bg-gray-500',
      [FactureManutentionStatus.EN_ATTENTE_VALIDATION]: 'bg-amber-500',
      [FactureManutentionStatus.EN_ATTENTE_PAIEMENT]: 'bg-yellow-500',
      [FactureManutentionStatus.PAIEMENT_PARTIEL]: 'bg-orange-500',
      [FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION]: 'bg-blue-500',
      [FactureManutentionStatus.CLOTURE]: 'bg-green-500',
    };
    return <Badge className={colors[status]}>{status.replace(/_/g, ' ')}</Badge>;
  };

  const backList = (
    <Button variant="outline" size="sm" asChild className="shrink-0">
      <Link href="/dashboard/caissier/factures-manutention">
        <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
        {t('dashboard.caissier.btnBack')}
      </Link>
    </Button>
  );

  const pageBootLoading = status === 'loading' || loading;
  const headerSubtitle = pageBootLoading
    ? t('dashboard.caissier.loadingSubtitle')
    : !isCaissier
      ? t('dashboard.transit.subtitleRedirect')
      : facture?.bl
        ? `${t('dashboard.logistique.fichier.voyageBl')} ${facture.bl}`
        : undefined;

  const headerActions =
    facture ? (
      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        {getStatusBadge(facture.statut)}
        {isUserCaissier &&
          facture.statut === FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Actions facture"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t('dashboard.transit.actionsTitle')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={validatingPaiement}
                  onClick={() => void handleValiderPaiement()}
                >
                  {validatingPaiement ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {t('dashboard.paiements.valider')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        {canConvert && (
          <Button onClick={handleConvertToTransit} disabled={converting}>
            {converting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2 animate-spin" />
                {t('dashboard.caissier.converting')}
              </>
            ) : (
              t('dashboard.caissier.btnConvert')
            )}
          </Button>
        )}
      </div>
    ) : undefined;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.factureEditTitle')}
        subtitle={headerSubtitle}
        backButton={isCaissier ? backList : undefined}
        actions={headerActions}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {pageBootLoading ? (
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        ) : !isCaissier ? (
          <p className="text-muted-foreground">{t('dashboard.caissier.redirecting')}</p>
        ) : (
      <div className="space-y-6 max-w-7xl mx-auto">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.caissier.fieldBl')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bl">{t('dashboard.caissier.labelBl')}</Label>
                  <Input
                    id="bl"
                    value={bl}
                    onChange={(e) => setBl(e.target.value.toUpperCase())}
                    placeholder={t('dashboard.caissier.blPlaceholder')}
                    required
                    disabled={!isEditable}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('dashboard.caissier.labelPayeur')}</Label>
                  <Select
                    value={payeurId || 'none'}
                    onValueChange={(val) => setPayeurId(val === 'none' ? '' : val)}
                    disabled={!isEditable || facture?.statut === FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('dashboard.caissier.selectPayeur')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('dashboard.caissier.noPayeur')}</SelectItem>
                      {payeurs.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.nom} ({p.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.caissier.payeurHint')}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>{t('dashboard.caissier.lignesTitle')}</Label>
                  {isEditable && (
                    <Button type="button" variant="outline" size="sm" onClick={addLigne}>
                      <Plus className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" />
                      {t('dashboard.caissier.addLigne')}
                    </Button>
                  )}
                </div>

                {lignes.map((ligne) => (
                  <div
                    key={ligne.id}
                    className="grid grid-cols-12 gap-4 items-start p-4 border rounded-lg bg-muted/30"
                  >
                    <div className="col-span-4 space-y-2">
                      <Label>{t('dashboard.caissier.entreprise')}</Label>
                      <Input
                        value={ligne.nomEntreprise}
                        onChange={(e) =>
                          updateLigne(ligne.id, 'nomEntreprise', e.target.value)
                        }
                        placeholder={t('dashboard.caissier.entreprisePlaceholder')}
                        required
                        disabled={!isEditable}
                      />
                    </div>
                    <div className="col-span-3 space-y-2">
                      <Label>{t('dashboard.caissier.blLigne')}</Label>
                      <Input
                        value={ligne.bl}
                        onChange={(e) => updateLigne(ligne.id, 'bl', e.target.value)}
                        placeholder="BL"
                        required
                        disabled={!isEditable}
                      />
                    </div>
                    <div className="col-span-4 space-y-2">
                      <Label>{t('dashboard.caissier.montantLabel')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ligne.montant}
                        onChange={(e) => updateLigne(ligne.id, 'montant', e.target.value)}
                        placeholder="0.00"
                        required
                        disabled={!isEditable}
                      />
                    </div>
                    {isEditable && (
                      <div className="col-span-1 pt-8">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeLigne(ligne.id)}
                          disabled={lignes.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {t('dashboard.caissier.bonLabel')}{' '}
                  <span className="font-medium text-foreground">
                    {lignes
                      .reduce((sum, l) => sum + (parseFloat(l.montant) || 0), 0)
                      .toFixed(2)}{' '}
                    {t('common.mru')}
                  </span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/caissier/factures-manutention">{t('actions.cancel')}</Link>
                  </Button>
                  {isEditable && (
                    <Button type="submit" disabled={submitting}>
                      {submitting ? t('dashboard.caissier.submitting') : t('actions.save')}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </form>

        {(recuLoading || recuError || recuDisplayUrl) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('dashboard.paiements.recuPaiement')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recuLoading ? (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2 animate-spin" />
                  {t('dashboard.paiements.loadingApercu')}
                </div>
              ) : recuError ? (
                <p className="text-sm text-destructive">{recuError}</p>
              ) : recuDisplayUrl ? (
                <PDFView
                  src={recuDisplayUrl}
                  title={selectedRecu?.recuFilename || t('dashboard.paiements.recuFallbackTitle')}
                />
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
        )}
      </PageContent>
    </DashboardLayout>
  );
}
