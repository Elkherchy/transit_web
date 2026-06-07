import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fichierStatutBadge } from '@/components/dashboard/logistique/fichiers/columns';
import {
  UserRole,
  type IFichierLogistique,
  type IVoyage,
  type IUserResponse,
  VoyageStatus,
  FichierLogistiqueStatus,
} from '@/types';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { ScanPhoto } from '@/components/logistique/ScanPhoto';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

function voyageStatusBadge(s: VoyageStatus | undefined, t: TFunction) {
  switch (s) {
    case VoyageStatus.CREE:
      return <Badge className="bg-blue-500 text-white hover:bg-blue-500 text-xs">{t('dashboard.logistique.statuses.voyage.CREE')}</Badge>;
    case VoyageStatus.RESERVE:
      return <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">{t('dashboard.logistique.statuses.voyage.RESERVE')}</Badge>;
    case VoyageStatus.EN_COURS:
      return <Badge className="bg-violet-600 text-white hover:bg-violet-600 text-xs">{t('dashboard.logistique.statuses.voyage.EN_COURS')}</Badge>;
    case VoyageStatus.RETOURNE:
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs">{t('dashboard.logistique.statuses.voyage.RETOURNE')}</Badge>;
    case VoyageStatus.VALIDE:
      return <Badge className="bg-green-700 text-white hover:bg-green-700 text-xs">{t('dashboard.logistique.statuses.voyage.VALIDE')}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{s || '—'}</Badge>;
  }
}

interface FichierDetailData {
  fichier: IFichierLogistique;
  voyages: IVoyage[];
  chauffeurs: Record<string, IUserResponse>;
  createur?: IUserResponse;
}

export default function FichierLogistiqueDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const id = String(router.query.id || '');

  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;
  const canValider =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;

  const [data, setData] = useState<FichierDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Voyage sélectionné pour la visualisation des scans (départ / retour).
  const [scansVoyage, setScansVoyage] = useState<IVoyage | null>(null);
  // État du bouton "Valider ce voyage" (transit) dans le dialog scans.
  const [validatingVoyage, setValidatingVoyage] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitValide, setSubmitValide] = useState(false);
  // Prix transport & commission chauffeur — saisis par le user TRANSIT au
  // moment de la validation, appliqués à TOUS les voyages du fichier.
  const [validatePrixTransport, setValidatePrixTransport] = useState('6000');
  const [validateCommission, setValidateCommission] = useState('300');
  // Overrides par voyage (dialog scans) — pré-remplis depuis le voyage sélectionné.
  const [voyagePrixTransport, setVoyagePrixTransport] = useState('');
  const [voyageCommission, setVoyageCommission] = useState('');

  useEffect(() => {
    if (scansVoyage) {
      setVoyagePrixTransport(String(Number(scansVoyage.prixTransport ?? 6000)));
      setVoyageCommission(String(Number(scansVoyage.commissionChauffeur ?? 300)));
    }
  }, [scansVoyage]);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/logistique/fichiers/${id}`, {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setData(r.data);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  const submitValidation = async () => {
    if (!data) return;
    const prixNum = Number(validatePrixTransport);
    const comNum = Number(validateCommission);
    if (!Number.isFinite(prixNum) || prixNum < 0) {
      setError(t('dashboard.logistique.fichier.errPrixInvalide', 'Prix transport invalide'));
      return;
    }
    if (!Number.isFinite(comNum) || comNum < 0) {
      setError(t('dashboard.logistique.fichier.errCommissionInvalide', 'Commission invalide'));
      return;
    }
    setSubmitValide(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(
        `/api/logistique/fichiers/${data.fichier._id}/valider`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prixTransport: prixNum,
            commissionChauffeur: comNum,
          }),
        }
      ).then((x) => x.json());
      if (r.success) {
        setSuccess(
          r.message ||
            t('dashboard.logistique.fichier.validationSuccess', {
              count: r.data?.voyagesValides ?? 0,
              credits: fmt(Number(r.data?.totalCreditVehicules || 0)),
            })
        );
        setConfirmOpen(false);
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitValide(false);
    }
  };

  /** Validation transit d'UN seul voyage depuis le dialog scans. */
  const validateVoyage = async (voyageId: string) => {
    const prixNum = Number(voyagePrixTransport);
    const comNum = Number(voyageCommission);
    if (!Number.isFinite(prixNum) || prixNum < 0) {
      setError(t('dashboard.logistique.fichier.errPrixInvalide', 'Prix transport invalide'));
      return;
    }
    if (!Number.isFinite(comNum) || comNum < 0) {
      setError(t('dashboard.logistique.fichier.errCommissionInvalide', 'Commission invalide'));
      return;
    }
    setValidatingVoyage(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(
        `/api/logistique/voyages/${voyageId}/valider-transit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prixTransport: Number.isFinite(prixNum) && prixNum >= 0 ? prixNum : undefined,
            commissionChauffeur: Number.isFinite(comNum) && comNum >= 0 ? comNum : undefined,
          }),
        }
      ).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.logistique.fichier.voyageValideOk'));
        setScansVoyage(null);
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setValidatingVoyage(false);
    }
  };

  const voyages = data?.voyages || [];
  const chauffeurs = data?.chauffeurs || {};

  const columns = useMemo<ColumnDef<IVoyage>[]>(
    () => [
      {
        id: 'date',
        header: t('dashboard.logistique.mesVoyages.colDate'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {new Date(row.original.date).toLocaleDateString('fr-FR')}
          </span>
        ),
      },
      {
        accessorKey: 'clientSource',
        header: t('dashboard.logistique.mesVoyages.colClient'),
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {row.original.clientSource || '—'}
          </span>
        ),
      },
      {
        id: 'identif',
        header: t('dashboard.logistique.mesVoyages.colIdentif'),
        cell: ({ row }) => {
          // Affiche tous les NTC (un BL peut en porter plusieurs). Fallback
          // sur le champ legacy `ntc` si `ntcs[]` est vide ou absent.
          const ntcs =
            row.original.ntcs && row.original.ntcs.length > 0
              ? row.original.ntcs
              : row.original.ntc
                ? [row.original.ntc]
                : [];
          return (
            <div className="text-sm space-y-0.5">
              {row.original.bl && (
                <div className="tabular-nums">BL {row.original.bl}</div>
              )}
              {ntcs.length > 0 && (
                <div className="tabular-nums text-xs text-muted-foreground">
                  NTC {ntcs.join(', ')}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'matricule',
        header: t('dashboard.logistique.mesVoyages.colMatricule'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.matricule || (
              <span className="text-muted-foreground italic">—</span>
            )}
          </span>
        ),
      },
      {
        id: 'chauffeur',
        header: t('dashboard.logistique.vehicule.colChauffeur'),
        cell: ({ row }) => {
          const cid = row.original.chauffeurId
            ? String(row.original.chauffeurId)
            : null;
          const u = cid ? chauffeurs[cid] : null;
          return (
            <span className="text-sm">
              {u?.nom || (
                <span className="text-muted-foreground italic">—</span>
              )}
            </span>
          );
        },
      },
      {
        id: 'magasinage',
        header: t('dashboard.logistique.fichier.voyageMagasinage'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.magasinage
              ? new Date(row.original.magasinage).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
      {
        id: 'surestaries',
        header: t('dashboard.logistique.fichier.voyageSurestaries'),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.surestaries
              ? new Date(row.original.surestaries).toLocaleDateString('fr-FR')
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'statutVoyage',
        header: t('dashboard.logistique.vehicule.colStatut'),
        cell: ({ row }) => voyageStatusBadge(row.original.statutVoyage, t),
      },
      {
        id: 'scans',
        header: t('dashboard.logistique.fichier.colScans', 'Scans'),
        cell: ({ row }) => {
          const v = row.original;
          const hasDepart = !!v.scanDepartPhotoUrl;
          const hasRetour = !!v.scanRetourPhotoUrl;
          if (!hasDepart && !hasRetour) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={() => setScansVoyage(v)}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>
                {[hasDepart && 'D', hasRetour && 'R']
                  .filter(Boolean)
                  .join(' / ')}
              </span>
            </Button>
          );
        },
      },
    ],
    [chauffeurs, t]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.fichiers.loadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  if (error && !data) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.fichiers.loadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/logistique/fichiers">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.logistique.actions.back')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const { fichier, createur } = data;
  // Totaux affichés dans le dialog de validation : prix × nombre de voyages,
  // car le user TRANSIT saisit les montants unitaires qui seront appliqués
  // identiquement à chaque voyage du fichier.
  const previewPrixUnit = Number(validatePrixTransport) || 0;
  const previewCommissionUnit = Number(validateCommission) || 0;
  const totalPrix = previewPrixUnit * voyages.length;
  const totalCommission = previewCommissionUnit * voyages.length;
  const nbRetournes = voyages.filter(
    (v) =>
      v.statutVoyage === VoyageStatus.RETOURNE ||
      v.statutVoyage === VoyageStatus.VALIDE
  ).length;
  const allRetournes = voyages.length > 0 && nbRetournes === voyages.length;
  const isValide = fichier.statut === FichierLogistiqueStatus.VALIDE;
  const showValiderButton = canValider && allRetournes && !isValide;

  return (
    <DashboardLayout>
      <PageHeader
        title={`${t('dashboard.fichiers.loadingTitle')} ${fichier.reference}`}
        subtitle={t('dashboard.logistique.fichier.headerSubtitleVoyages', {
          count: voyages.length,
          date: new Date(fichier.date).toLocaleDateString('fr-FR'),
        })}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logistique/fichiers">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.logistique.actions.back')}
            </Link>
          </Button>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.logistique.actions.refresh')}</span>
            </Button>
            {showValiderButton && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setConfirmOpen(true)}
              >
                <ShieldCheck className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('dashboard.logistique.fichier.validateBtn')}</span>
                <span className="sm:hidden">{t('dashboard.logistique.fichier.validateBtnShort')}</span>
              </Button>
            )}
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-4 max-w-7xl mx-auto">
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardHeader className="text-base font-semibold text-primary p-0">
                {t('dashboard.logistique.fichier.infoCardTitle')}
              </CardHeader>
              {fichierStatutBadge(fichier.statut, t)}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label={t('dashboard.logistique.fichier.fieldReference')}
                value={
                  <span className="font-mono">{fichier.reference}</span>
                }
              />
              <Field
                label={t('dashboard.logistique.fichier.fieldDate')}
                value={new Date(fichier.date).toLocaleDateString('fr-FR')}
              />
              <Field
                label={t('dashboard.logistique.fichier.fieldCreatedBy')}
                value={createur?.nom || '—'}
              />
              <Field
                label={t('dashboard.logistique.fichier.fieldVoyages')}
                value={t('dashboard.logistique.fichier.fieldVoyagesValue', {
                  retournes: nbRetournes,
                  total: voyages.length,
                })}
              />
              {fichier.note && (
                <Field
                  label={t('dashboard.logistique.fichier.fieldNote')}
                  value={fichier.note}
                  className="sm:col-span-2 lg:col-span-4"
                />
              )}
              {fichier.valideTransitAt && (
                <Field
                  label={t('dashboard.logistique.fichier.fieldValideTransitAt')}
                  value={new Date(fichier.valideTransitAt).toLocaleString(
                    'fr-FR'
                  )}
                  className="sm:col-span-2 lg:col-span-2"
                />
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
            <CardHeader className="text-base font-semibold text-primary p-0">
              {t('dashboard.logistique.fichier.voyagesCardTitle', { count: voyages.length })}
            </CardHeader>
            <DataTable
              columns={columns}
              data={voyages}
              emptyMessage={t('dashboard.fichiers.noVoyages')}
            />
          </div>

          {!isValide && !allRetournes && voyages.length > 0 && (
            <Alert>
              <AlertDescription>
                {t('dashboard.logistique.fichier.validationOnlyAllRetournes', {
                  retournes: nbRetournes,
                  total: voyages.length,
                })}
              </AlertDescription>
            </Alert>
          )}
          {isValide && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {t('dashboard.logistique.fichier.valideAlert')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.fichiers.validateDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.fichier.validateDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="validate-prix">
                    {t(
                      'dashboard.logistique.fichier.validatePrixTransportLabel',
                      'Prix transport (par voyage)'
                    )}
                  </Label>
                  <Input
                    id="validate-prix"
                    type="number"
                    min="0"
                    step="0.01"
                    value={validatePrixTransport}
                    onChange={(e) => setValidatePrixTransport(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="validate-com">
                    {t(
                      'dashboard.logistique.fichier.validateCommissionLabel',
                      'Commission (par voyage)'
                    )}
                  </Label>
                  <Input
                    id="validate-com"
                    type="number"
                    min="0"
                    step="0.01"
                    value={validateCommission}
                    onChange={(e) => setValidateCommission(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">{t('dashboard.logistique.fichier.validateSummaryVoyages')}</span>
                <span className="font-semibold">{voyages.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('dashboard.logistique.fichier.validateSummaryCredit')}
                </span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  +{fmt(totalPrix)} MRU
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('dashboard.logistique.fichier.validateSummaryDebit')}
                </span>
                <span className="font-semibold tabular-nums text-red-700">
                  −{fmt(totalCommission)} MRU
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">
                  {t('dashboard.logistique.fichier.validateSummaryNet')}
                </span>
                <span className="font-bold tabular-nums">
                  {fmt(totalPrix - totalCommission)} MRU
                </span>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={submitValide}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={() => void submitValidation()}
                disabled={submitValide}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {submitValide ? t('dashboard.logistique.fichier.submitting') : t('dashboard.logistique.fichier.validateConfirmBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Visualiseur des scans départ/retour d'un voyage */}
        <Dialog
          open={!!scansVoyage}
          onOpenChange={(o) => {
            if (!o) setScansVoyage(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {t('dashboard.logistique.fichier.scansDialogTitle', 'Scans chauffeur')}
              </DialogTitle>
              {scansVoyage && (
                <DialogDescription>
                  {scansVoyage.matricule || '—'}
                  {scansVoyage.bl ? ` · BL ${scansVoyage.bl}` : ''}
                  {scansVoyage.chauffeurId &&
                  chauffeurs[String(scansVoyage.chauffeurId)]
                    ? ` · ${chauffeurs[String(scansVoyage.chauffeurId)].nom}`
                    : ''}
                </DialogDescription>
              )}
            </DialogHeader>
            {scansVoyage &&
              canValider &&
              scansVoyage.statutVoyage === VoyageStatus.RETOURNE &&
              (data.fichier.statut === FichierLogistiqueStatus.PRET_VALIDATION ||
                data.fichier.statut === FichierLogistiqueStatus.VALIDE) && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="voyage-prix">
                      {t(
                        'dashboard.logistique.fichier.validatePrixTransportLabel',
                        'Prix transport'
                      )}
                    </Label>
                    <Input
                      id="voyage-prix"
                      type="number"
                      min="0"
                      step="0.01"
                      value={voyagePrixTransport}
                      onChange={(e) => setVoyagePrixTransport(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="voyage-com">
                      {t(
                        'dashboard.logistique.fichier.validateCommissionLabel',
                        'Commission'
                      )}
                    </Label>
                    <Input
                      id="voyage-com"
                      type="number"
                      min="0"
                      step="0.01"
                      value={voyageCommission}
                      onChange={(e) => setVoyageCommission(e.target.value)}
                    />
                  </div>
                </div>
              )}
            {scansVoyage && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scansVoyage.scanDepartPhotoUrl ? (
                  <ScanPhoto
                    label={
                      scansVoyage.scanDepartAt
                        ? `${t(
                            'dashboard.logistique.fichier.scanDepartLabel',
                            'Scan départ'
                          )} · ${new Date(scansVoyage.scanDepartAt).toLocaleString('fr-FR')}`
                        : t(
                            'dashboard.logistique.fichier.scanDepartLabel',
                            'Scan départ'
                          )
                    }
                    storageKey={scansVoyage.scanDepartPhotoUrl}
                    filename={scansVoyage.scanDepartPhotoName}
                  />
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
                    {t('dashboard.logistique.fichier.noScanDepart', 'Pas de scan départ')}
                  </div>
                )}
                {scansVoyage.scanRetourPhotoUrl ? (
                  <ScanPhoto
                    label={
                      scansVoyage.scanRetourAt
                        ? `${t(
                            'dashboard.logistique.fichier.scanRetourLabel',
                            'Scan retour'
                          )} · ${new Date(scansVoyage.scanRetourAt).toLocaleString('fr-FR')}`
                        : t(
                            'dashboard.logistique.fichier.scanRetourLabel',
                            'Scan retour'
                          )
                    }
                    storageKey={scansVoyage.scanRetourPhotoUrl}
                    filename={scansVoyage.scanRetourPhotoName}
                  />
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
                    {t('dashboard.logistique.fichier.noScanRetour', 'Pas de scan retour')}
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setScansVoyage(null)}
                disabled={validatingVoyage}
                className="w-full sm:w-auto"
              >
                {t('actions.close')}
              </Button>
              {/* Validation transit d'un voyage : visible si le rôle a le
                  droit ET le voyage est encore RETOURNE (pas déjà validé)
                  ET le fichier est en PRET_VALIDATION ou VALIDE. */}
              {scansVoyage &&
                canValider &&
                scansVoyage.statutVoyage === VoyageStatus.RETOURNE &&
                (data.fichier.statut === FichierLogistiqueStatus.PRET_VALIDATION ||
                  data.fichier.statut === FichierLogistiqueStatus.VALIDE) && (
                  <Button
                    onClick={() => validateVoyage(String(scansVoyage._id))}
                    disabled={validatingVoyage}
                    className="w-full sm:w-auto"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {validatingVoyage
                      ? t('actions.loading')
                      : t('dashboard.logistique.fichier.validateVoyageBtn')}
                  </Button>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}

function Field({
  label,
  value,
  strong,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={strong ? 'text-base font-semibold tabular-nums' : 'text-sm'}>
        {value}
      </div>
    </div>
  );
}
