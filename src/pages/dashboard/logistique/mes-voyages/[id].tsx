import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserRole, type IVoyage, VoyageStatus } from '@/types';
import {
  ArrowLeft,
  Truck,
  Lock,
  CheckCircle2,
  RefreshCcw,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

function statusBadge(s?: VoyageStatus, t?: (key: string) => string) {
  switch (s) {
    case VoyageStatus.CREE:
      return <Badge className="bg-blue-500 text-white">{t ? t('dashboard.logistique.statuses.voyage.CREE') : 'Disponible'}</Badge>;
    case VoyageStatus.RESERVE:
      return <Badge className="bg-amber-500 text-white">{t ? t('dashboard.logistique.statuses.voyage.RESERVE') : 'Réservé'}</Badge>;
    case VoyageStatus.EN_COURS:
      return <Badge className="bg-violet-600 text-white">{t ? t('dashboard.logistique.statuses.voyage.EN_COURS') : 'En cours'}</Badge>;
    case VoyageStatus.RETOURNE:
      return <Badge className="bg-emerald-600 text-white">{t ? t('dashboard.logistique.statuses.voyage.RETOURNE') : 'Retourné'}</Badge>;
    case VoyageStatus.VALIDE:
      return <Badge className="bg-green-700 text-white">{t ? t('dashboard.logistique.statuses.voyage.VALIDE') : 'Validé'}</Badge>;
    default:
      return <Badge variant="outline">{s || '—'}</Badge>;
  }
}

export default function ChauffeurVoyageDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.CHAUFFEUR ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE;
  const id = String(router.query.id || '');

  const [voyage, setVoyage] = useState<IVoyage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reserveOpen, setReserveOpen] = useState(false);
  const [matricule, setMatricule] = useState('');
  const [myMatricule, setMyMatricule] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitReserve, setSubmitReserve] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const [submitRetour, setSubmitRetour] = useState(false);
  const [retourOpen, setRetourOpen] = useState(false);
  const [retourPhotoFile, setRetourPhotoFile] = useState<File | null>(null);
  const [retourPhotoPreview, setRetourPhotoPreview] = useState<string | null>(null);
  const [retourError, setRetourError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      const r = await fetch('/api/logistique/mes-voyages', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        const found = (r.data as IVoyage[]).find(
          (v) => String(v._id) === id
        );
        if (!found) setError(t('dashboard.mesVoyages.errLoad'));
        else setVoyage(found);
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  // Récupère le véhicule assigné au chauffeur (Vehicule.chauffeurId === me)
  // pour pré-remplir le matricule dans la dialog de réservation.
  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/logistique/vehicules/mine', {
          credentials: 'include',
        }).then((x) => x.json());
        if (cancelled) return;
        if (r.success && r.data?.matricule) {
          setMyMatricule(String(r.data.matricule).toUpperCase());
        }
      } catch {
        /* silencieux : la saisie manuelle reste disponible */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAllowed]);

  const submitReservation = async () => {
    if (!voyage) return;
    setReserveError(null);
    if (!matricule.trim()) {
      return setReserveError(t('dashboard.logistique.mesVoyages.errMatriculeRequired'));
    }
    if (!photoFile) {
      return setReserveError(
        t('dashboard.logistique.mesVoyages.errPhotoDepartRequired')
      );
    }
    setSubmitReserve(true);
    try {
      const fd = new FormData();
      fd.append('matricule', matricule.trim().toUpperCase());
      fd.append('photo', photoFile);
      const r = await fetch(
        `/api/logistique/voyages/${voyage._id}/reserver`,
        {
          method: 'POST',
          credentials: 'include',
          body: fd,
        }
      ).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.logistique.mesVoyages.successReserve'));
        setReserveOpen(false);
        setMatricule('');
        setPhotoFile(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        void reload();
      } else {
        setReserveError(r.error || t('common.error'));
      }
    } catch {
      setReserveError(t('common.errorNetwork'));
    } finally {
      setSubmitReserve(false);
    }
  };

  const submitRetourScan = async () => {
    if (!voyage) return;
    setRetourError(null);
    if (!retourPhotoFile) {
      return setRetourError(
        t('dashboard.logistique.mesVoyages.errPhotoRetourRequired')
      );
    }
    setSuccess(null);
    setError(null);
    setSubmitRetour(true);
    try {
      const fd = new FormData();
      fd.append('photo', retourPhotoFile);
      const r = await fetch(`/api/logistique/voyages/${voyage._id}/retour`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      }).then((x) => x.json());
      if (r.success) {
        const m = Number(r.data?.nouveauSoldeChauffeur ?? 0);
        setSuccess(
          t('dashboard.logistique.mesVoyages.successRetour', { solde: fmt(m) })
        );
        setRetourOpen(false);
        setRetourPhotoFile(null);
        if (retourPhotoPreview) URL.revokeObjectURL(retourPhotoPreview);
        setRetourPhotoPreview(null);
        void reload();
      } else {
        setRetourError(r.error || t('common.error'));
      }
    } catch {
      setRetourError(t('common.errorNetwork'));
    } finally {
      setSubmitRetour(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.mesVoyages.loadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  if (error || !voyage) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.mesVoyages.loadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/logistique/mes-voyages">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.logistique.actions.back')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Voyage introuvable'}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  const isMine = String(voyage.chauffeurId || '') === user?.id;
  const canReserver = voyage.statutVoyage === VoyageStatus.CREE;
  const canRetour = isMine && voyage.statutVoyage === VoyageStatus.EN_COURS;

  return (
    <DashboardLayout>
      <PageHeader
        title={`Voyage ${voyage.bl || voyage.ntc || ''}`}
        subtitle={`${voyage.clientSource || '—'} · ${new Date(voyage.date).toLocaleDateString('fr-FR')}`}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logistique/mes-voyages">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.logistique.actions.back')}
            </Link>
          </Button>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2 rtl:sm:ml-2 rtl:sm:mr-0" />
            <span className="hidden sm:inline">{t('actions.refresh')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Info card */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <CardHeader className="text-base font-semibold text-primary p-0">
                {t('dashboard.logistique.mesVoyages.infoCardTitle')}
              </CardHeader>
              {statusBadge(voyage.statutVoyage, t)}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('dashboard.logistique.mesVoyages.fieldDate')} value={new Date(voyage.date).toLocaleDateString('fr-FR')} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldClient')} value={voyage.clientSource || '—'} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldBl')} value={voyage.bl || '—'} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldNtc')} value={voyage.ntc || '—'} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldTel')} value={voyage.telephone || '—'} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldSociete')} value={voyage.societe || '—'} />
              <Field label={t('dashboard.logistique.mesVoyages.fieldTp')} value={voyage.tp || '—'} />
              <Field
                label={t('dashboard.logistique.mesVoyages.fieldMatricule')}
                value={voyage.matricule || '—'}
                strong={!!voyage.matricule}
              />
              {voyage.note && (
                <Field
                  label={t('dashboard.logistique.mesVoyages.fieldNote')}
                  value={voyage.note}
                  className="sm:col-span-2"
                />
              )}
            </div>
          </div>

          {/* Tarifs */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm grid grid-cols-2 gap-3">
            {user?.role === UserRole.ADMIN && (
              <Field
                label={t('dashboard.logistique.mesVoyages.fieldPrixTransport')}
                value={`${fmt(Number(voyage.prixTransport || 0))} ${t('common.mru')}`}
              />
            )}
            <Field
              label={t('dashboard.logistique.mesVoyages.fieldMaCommission')}
              value={`${fmt(Number(voyage.commissionChauffeur || 0))} ${t('common.mru')}`}
              strong
            />
            {voyage.scanDepartAt && (
              <Field
                label={t('dashboard.logistique.mesVoyages.fieldDepartScanned')}
                value={new Date(voyage.scanDepartAt).toLocaleString('fr-FR')}
              />
            )}
            {voyage.scanRetourAt && (
              <Field
                label={t('dashboard.logistique.mesVoyages.fieldRetourScanned')}
                value={new Date(voyage.scanRetourAt).toLocaleString('fr-FR')}
              />
            )}
            {voyage.scanDepartPhotoUrl && (
              <div className="col-span-2">
                <ScanPhoto
                  label={t('dashboard.logistique.mesVoyages.fieldPhotoDepart')}
                  storageKey={voyage.scanDepartPhotoUrl}
                  filename={voyage.scanDepartPhotoName}
                />
              </div>
            )}
            {voyage.scanRetourPhotoUrl && (
              <div className="col-span-2">
                <ScanPhoto
                  label={t('dashboard.logistique.mesVoyages.fieldPhotoRetour')}
                  storageKey={voyage.scanRetourPhotoUrl}
                  filename={voyage.scanRetourPhotoName}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          {canReserver && (
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setMatricule(myMatricule);
                setReserveError(null);
                setReserveOpen(true);
              }}
            >
              <Truck className="mr-2 h-5 w-5 rtl:ml-2 rtl:mr-0" />
              {t('dashboard.logistique.mesVoyages.actionReserver')}
            </Button>
          )}

          {canRetour && (
            <Button
              size="lg"
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setRetourError(null);
                setRetourPhotoFile(null);
                if (retourPhotoPreview) URL.revokeObjectURL(retourPhotoPreview);
                setRetourPhotoPreview(null);
                setRetourOpen(true);
              }}
              disabled={submitRetour}
            >
              <Lock className="mr-2 h-5 w-5 rtl:ml-2 rtl:mr-0" />
              {t('dashboard.logistique.mesVoyages.actionRetour', { commission: fmt(Number(voyage.commissionChauffeur || 0)) })}
            </Button>
          )}

          {!canReserver && !canRetour && voyage.statutVoyage && (
            <Alert>
              <AlertDescription>
                {voyage.statutVoyage === VoyageStatus.RETOURNE
                    ? t('dashboard.logistique.mesVoyages.infoRetourne')
                    : voyage.statutVoyage === VoyageStatus.VALIDE
                      ? t('dashboard.logistique.mesVoyages.infoValide')
                      : t('dashboard.logistique.mesVoyages.infoNoAction')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Dialog réservation */}
        <Dialog
          open={reserveOpen}
          onOpenChange={(open) => {
            setReserveOpen(open);
            if (!open) {
              setPhotoFile(null);
              if (photoPreview) URL.revokeObjectURL(photoPreview);
              setPhotoPreview(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.mesVoyages.reserveDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.mesVoyages.reserveDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {reserveError && (
                <Alert variant="destructive">
                  <AlertDescription>{reserveError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="mat">{t('dashboard.logistique.mesVoyages.reserveMatLabel')}</Label>
                <Input
                  id="mat"
                  value={matricule}
                  onChange={(e) =>
                    setMatricule(e.target.value.toUpperCase())
                  }
                  placeholder={t('dashboard.logistique.mesVoyages.reserveMatPlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t('dashboard.logistique.mesVoyages.reservePhotoLabel')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    htmlFor="photo-camera"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {t('dashboard.logistique.mesVoyages.reserveTakePhoto')}
                    <input
                      id="photo-camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoFile(f);
                        setPhotoPreview(f ? URL.createObjectURL(f) : null);
                      }}
                    />
                  </label>
                  <label
                    htmlFor="photo-file"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t('dashboard.logistique.mesVoyages.reserveChooseFile')}
                    <input
                      id="photo-file"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoFile(f);
                        setPhotoPreview(f ? URL.createObjectURL(f) : null);
                      }}
                    />
                  </label>
                </div>
                {photoPreview && (
                  <div className="relative rounded-md overflow-hidden border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt={t('dashboard.logistique.mesVoyages.reservePreviewAlt')}
                      className="w-full h-48 object-cover"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 end-2 rtl:top-2 rtl:start-2 rtl:end-auto h-7"
                      onClick={() => {
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                    >
                      {t('dashboard.logistique.mesVoyages.reserveRemove')}
                    </Button>
                  </div>
                )}
                {photoFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {photoFile.name} ·{' '}
                    {(photoFile.size / 1024).toFixed(0)} Ko
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setReserveOpen(false)}
                disabled={submitReserve}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={() => void submitReservation()}
                disabled={submitReserve || !matricule.trim()}
                className="w-full sm:w-auto"
              >
                <Truck className="mr-2 h-4 w-4 rtl:rotate-180 rtl:ml-0 rtl:mr-2" />
                {submitReserve ? t('dashboard.logistique.mesVoyages.reserveSubmitting') : t('dashboard.logistique.mesVoyages.reserveSubmit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog scan retour */}
        <Dialog
          open={retourOpen}
          onOpenChange={(open) => {
            setRetourOpen(open);
            if (!open) {
              setRetourPhotoFile(null);
              if (retourPhotoPreview) URL.revokeObjectURL(retourPhotoPreview);
              setRetourPhotoPreview(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.mesVoyages.retourDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.mesVoyages.retourDialogDescription', { commission: fmt(Number(voyage.commissionChauffeur || 0)) })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {retourError && (
                <Alert variant="destructive">
                  <AlertDescription>{retourError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>
                  {t('dashboard.logistique.mesVoyages.retourPhotoLabel')}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    htmlFor="retour-camera"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {t('dashboard.logistique.mesVoyages.reserveTakePhoto')}
                    <input
                      id="retour-camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (retourPhotoPreview)
                          URL.revokeObjectURL(retourPhotoPreview);
                        setRetourPhotoFile(f);
                        setRetourPhotoPreview(
                          f ? URL.createObjectURL(f) : null
                        );
                      }}
                    />
                  </label>
                  <label
                    htmlFor="retour-file"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm font-medium cursor-pointer hover:bg-muted transition-colors"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t('dashboard.logistique.mesVoyages.reserveChooseFile')}
                    <input
                      id="retour-file"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (retourPhotoPreview)
                          URL.revokeObjectURL(retourPhotoPreview);
                        setRetourPhotoFile(f);
                        setRetourPhotoPreview(
                          f ? URL.createObjectURL(f) : null
                        );
                      }}
                    />
                  </label>
                </div>
                {retourPhotoPreview && (
                  <div className="relative rounded-md overflow-hidden border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={retourPhotoPreview}
                      alt={t('dashboard.logistique.mesVoyages.retourPreviewAlt')}
                      className="w-full h-48 object-cover"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute top-2 end-2 rtl:top-2 rtl:start-2 rtl:end-auto h-7"
                      onClick={() => {
                        if (retourPhotoPreview)
                          URL.revokeObjectURL(retourPhotoPreview);
                        setRetourPhotoFile(null);
                        setRetourPhotoPreview(null);
                      }}
                    >
                      {t('dashboard.logistique.mesVoyages.reserveRemove')}
                    </Button>
                  </div>
                )}
                {retourPhotoFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {retourPhotoFile.name} ·{' '}
                    {(retourPhotoFile.size / 1024).toFixed(0)} Ko
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setRetourOpen(false)}
                disabled={submitRetour}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={() => void submitRetourScan()}
                disabled={submitRetour || !retourPhotoFile}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                <Lock className="mr-2 h-4 w-4 rtl:rotate-180 rtl:ml-0 rtl:mr-2" />
                {submitRetour ? t('dashboard.logistique.mesVoyages.retourSubmitting') : t('dashboard.logistique.mesVoyages.retourSubmit')}
              </Button>
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
      <div className={strong ? 'text-base font-semibold' : 'text-sm'}>
        {value}
      </div>
    </div>
  );
}

function ScanPhoto({
  label,
  storageKey,
  filename,
}: {
  label: string;
  storageKey: string;
  filename?: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/documents/${encodeURIComponent(storageKey)}`,
          { credentials: 'include' }
        ).then((x) => x.json());
        if (cancelled) return;
        if (r.success && r.url) setUrl(String(r.url));
        else setError(t('dashboard.logistique.mesVoyages.photoUnavailable'));
      } catch {
        if (!cancelled) setError(t('common.errorNetwork'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  return (
    <div className="space-y-1.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !url ? (
        <div className="h-32 rounded-md border bg-muted animate-pulse" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename || label}
            className="w-full max-h-72 object-contain bg-white"
          />
        </a>
      )}
      {filename && (
        <p className="text-xs text-muted-foreground truncate">{filename}</p>
      )}
    </div>
  );
}
