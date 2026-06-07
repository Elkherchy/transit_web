import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  UserRole,
  type ITransit,
  type IDesignation,
  DesignationStatus,
  isDesignationFixedFee,
  getDesignationMaxAmount,
  isDesignationRecuOptional,
} from '@/types';
import {
  ArrowLeft,
  Lock,
  Upload,
  RefreshCcw,
  Camera,
  FileUp,
  X as XIcon,
} from 'lucide-react';

function StatusBadge({ s }: { s?: DesignationStatus }) {
  const { t } = useTranslation();
  switch (s) {
    case DesignationStatus.LIBRE:
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-500">
          {t('dashboard.payeur.statusLibre')}
        </Badge>
      );
    case DesignationStatus.RESERVEE:
      return (
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
          {t('dashboard.payeur.statusReservee')}
        </Badge>
      );
    case DesignationStatus.PAYEE:
      return (
        <Badge className="bg-violet-600 text-white hover:bg-violet-600">
          {t('dashboard.payeur.statusPayee')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_TRANSIT:
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
          {t('dashboard.payeur.statusValideeTransit')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_ADMIN:
      return (
        <Badge className="bg-green-700 text-white hover:bg-green-700">
          {t('dashboard.payeur.statusValideeAdmin')}
        </Badge>
      );
    case DesignationStatus.REJETEE:
      return <Badge variant="destructive">{t('dashboard.payeur.statusRejetee')}</Badge>;
    default:
      return <Badge variant="outline">{s || '—'}</Badge>;
  }
}

interface PayDialogState {
  designation: IDesignation;
}

export default function PayeurTransitDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed = user?.role === UserRole.USER_PAYEUR;
  const id = String(router.query.id || '');

  const [transit, setTransit] = useState<ITransit | null>(null);
  const [soldeCaisse, setSoldeCaisse] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [payDialog, setPayDialog] = useState<PayDialogState | null>(null);
  /** Liste de tous les reçus en attente d'upload. Le bouton « +Ajouter »
   *  pousse un nouveau File ici ; chaque entrée a son bouton supprimer. */
  const [recuFiles, setRecuFiles] = useState<File[]>([]);
  const recuFile = recuFiles[0] || null; // 1er fichier — utilisé pour preview
  const [recuPreviewUrl, setRecuPreviewUrl] = useState<string | null>(null);
  const [montant, setMontant] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Inputs file cachés : un pour upload (tous formats), un pour caméra (image only).
  // L'attribut `capture="environment"` ouvre la caméra arrière sur mobile / WebView Expo.
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Génère/nettoie l'URL preview à chaque changement de fichier.
  useEffect(() => {
    if (!recuFile) {
      setRecuPreviewUrl(null);
      return;
    }
    if (!recuFile.type.startsWith('image/')) {
      setRecuPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(recuFile);
    setRecuPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recuFile]);

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
      const [transitsRes, caisseRes] = await Promise.all([
        fetch('/api/transit/disponibles', { credentials: 'include' }).then((x) =>
          x.json()
        ),
        fetch('/api/caisse/caisses?mine=1', { credentials: 'include' }).then(
          (x) => x.json()
        ),
      ]);
      if (transitsRes.success) {
        const list = (transitsRes.data || []) as ITransit[];
        const found = list.find((tr) => String(tr._id) === id) || null;
        setTransit(found);
        if (!found) setError(t('dashboard.payeur.dossierIntrouvable'));
      } else {
        setError(transitsRes.error || t('dashboard.payeur.errorPrefix'));
      }
      if (caisseRes.success) {
        const own = (caisseRes.data || [])[0];
        setSoldeCaisse(own ? Number(own.solde ?? 0) : 0);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  // Le payeur ne voit QUE les désignations LIBRE + ses propres désignations.
  // Celles prises par d'autres payeurs sont masquées du tableau.
  const visibleDesignations = useMemo(() => {
    if (!transit) return [] as IDesignation[];
    const uid = user?.id;
    return (transit.designations || []).filter((d) => {
      if (d.statutDesignation === DesignationStatus.LIBRE) return true;
      return String(d.payeurId || '') === uid;
    });
  }, [transit, user?.id]);

  const designationColumns = useMemo<ColumnDef<IDesignation>[]>(
    () => [
      {
        id: 'nom',
        header: t('dashboard.payeur.colDesignationName'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nom}</span>
        ),
      },
      {
        accessorKey: 'montant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.payeur.colMontant'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {Number(row.original.montant || 0).toFixed(2)} MRU
          </span>
        ),
      },
      {
        id: 'statut',
        header: t('dashboard.payeur.colStatut'),
        cell: ({ row }) => <StatusBadge s={row.original.statutDesignation} />,
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.payeur.colAction'),
        cell: ({ row }) => {
          const d = row.original;
          if (!transit) return null;
          const isMine = String(d.payeurId || '') === user?.id;
          const canReserve =
            d.statutDesignation === DesignationStatus.LIBRE;
          const canPay =
            isMine && d.statutDesignation === DesignationStatus.RESERVEE;
          // « Repayer » : la désignation a été rejetée par le caissier mais
          // reste à l'utilisateur — il peut soumettre un nouveau paiement.
          const canRepay =
            isMine && d.statutDesignation === DesignationStatus.REJETEE;
          const k = `${transit._id}:${d._id}`;
          if (canReserve) {
            return (
              <Button
                size="sm"
                variant="outline"
                disabled={busyKey === k}
                onClick={() => void reserver(String(d._id))}
              >
                <Lock className="mr-2 h-4 w-4" />
                {t('dashboard.payeur.btnReserver')}
              </Button>
            );
          }
          if (canPay) {
            return (
              <Button size="sm" onClick={() => openPay(d)}>
                <Upload className="mr-2 h-4 w-4" />
                {t('dashboard.payeur.btnPayerRecu')}
              </Button>
            );
          }
          if (canRepay) {
            return (
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => openPay(d)}
                title={d.commentaire || undefined}
              >
                <Upload className="mr-2 h-4 w-4" />
                Repayer
              </Button>
            );
          }
          if (isMine) {
            return (
              <span className="text-xs text-muted-foreground">{t('dashboard.payeur.vous')}</span>
            );
          }
          return null;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transit, user?.id, busyKey]
  );

  const reserver = async (designationId: string) => {
    if (!transit) return;
    setBusyKey(`${transit._id}:${designationId}`);
    setError(null);
    try {
      const r = await fetch(
        `/api/transit/${transit._id}/designation/${designationId}/reserver`,
        { method: 'POST', credentials: 'include' }
      ).then((x) => x.json());
      if (!r.success) setError(r.error || t('dashboard.payeur.errorPrefix'));
      void reload();
    } finally {
      setBusyKey(null);
    }
  };

  const openPay = (designation: IDesignation) => {
    setPayDialog({ designation });
    // Pas de pré-remplissage pour les frais fixes — le payeur saisit librement
    // (avec la contrainte ≤ plafond validée au submit).
    const initial = Number(designation.montant) || 0;
    setMontant(initial > 0 ? String(initial) : '');
    setRecuFiles([]);
    setPayError(null);
  };

  const submitPay = async () => {
    if (!payDialog || !transit) return;
    setPayError(null);
    const designation = payDialog.designation;
    const fixedFee = isDesignationFixedFee(designation.nom);
    const maxAmount = getDesignationMaxAmount(designation.nom);
    const recuOptional = isDesignationRecuOptional(designation.nom);
    // Reçu non obligatoire pour TS, Bonne de Sortie Douanes, Camion, Sogetrap.
    if (!recuOptional && recuFiles.length === 0)
      return setPayError(t('dashboard.payeur.errRecuRequis'));
    const m = parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      return setPayError(t('dashboard.payeur.errMontantPositif'));
    }
    if (fixedFee && maxAmount !== null && m > maxAmount) {
      return setPayError(
        `Le montant doit être ≤ ${maxAmount} MRU pour « ${designation.nom} »`
      );
    }
    if (soldeCaisse !== null && m > soldeCaisse) {
      return setPayError(
        t('dashboard.payeur.errSoldeInsuffisant', { value: soldeCaisse.toFixed(2) })
      );
    }

    setSubmittingPay(true);
    try {
      // Upload chaque reçu via une URL S3 présignée (contourne la limite 4,5 Mo
      // de Vercel + permet plusieurs reçus pour un même paiement).
      const uploaded: Array<{ key: string; name: string; size: number }> = [];
      for (const f of recuFiles) {
        const presignRes = await fetch(
          `/api/transit/${transit._id}/designation/${payDialog.designation._id}/presign-recu`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: f.name,
              contentType: f.type || 'application/octet-stream',
            }),
          }
        );
        const pd = await presignRes.json().catch(() => null);
        if (!presignRes.ok || !pd?.success) {
          throw new Error(pd?.error || `Presign échoué (${presignRes.status})`);
        }
        const { uploadUrl, key, headers } = pd.data as {
          uploadUrl: string;
          key: string;
          headers: Record<string, string>;
        };
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers,
          body: f,
        });
        if (!putRes.ok) {
          throw new Error(`Upload S3 échoué (${putRes.status})`);
        }
        uploaded.push({ key, name: f.name, size: f.size });
      }

      const r = await fetch(
        `/api/transit/${transit._id}/designation/${payDialog.designation._id}/payer`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recus: uploaded, montant: m }),
        }
      ).then((x) => x.json());
      if (r.success) {
        setPayDialog(null);
        void reload();
      } else {
        setPayError(r.error || t('dashboard.payeur.errPaiement'));
      }
    } catch (e) {
      setPayError(
        e instanceof Error ? e.message : t('common.errorNetwork')
      );
    } finally {
      setSubmittingPay(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.payeur.transitDetailTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  if (error && !transit) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.payeur.transitDetailTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/payeur/transits-disponibles">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.payeur.headerListe')}
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

  if (!transit) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={`${transit.client} — BL ${transit.bl}`}
        subtitle={transit.objet}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/payeur/transits-disponibles">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.payeur.headerListe')}
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
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.payeur.rafraichir')}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-3 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {soldeCaisse !== null && (
            <div className="text-sm text-muted-foreground">
              {t('dashboard.payeur.soldeCaisse')}{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {soldeCaisse.toFixed(2)} MRU
              </span>
            </div>
          )}
          <CardHeader className="text-xl font-bold text-primary p-0">
            {t('dashboard.payeur.designationsCount', { count: visibleDesignations.length })}
          </CardHeader>
          <DataTable
            columns={designationColumns}
            data={visibleDesignations}
            emptyMessage={t('dashboard.payeur.transitDetailEmpty')}
            mobileGridCols={2}
          />
        </div>

        <Dialog
          open={!!payDialog}
          onOpenChange={(o) => !o && setPayDialog(null)}
        >
          <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>{t('dashboard.payeur.paymentDialog')}</DialogTitle>
              <DialogDescription>
                {payDialog?.designation.nom}
                {Number(payDialog?.designation.montant || 0) > 0
                  ? t('dashboard.payeur.montantInitial', { value: Number(payDialog?.designation.montant || 0).toFixed(2) })
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {soldeCaisse !== null && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {t('dashboard.payeur.soldeCaisse')}{' '}
                  <span className="font-semibold tabular-nums">
                    {soldeCaisse.toFixed(2)} MRU
                  </span>
                </div>
              )}
              {payError && (
                <Alert variant="destructive">
                  <AlertDescription>{payError}</AlertDescription>
                </Alert>
              )}
              {(() => {
                const desig = payDialog?.designation;
                const fixedMax = desig
                  ? getDesignationMaxAmount(desig.nom)
                  : null;
                const isFixed = fixedMax !== null;
                return (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="m">
                        {t('dashboard.payeur.montantPaye')}
                        {isFixed && (
                          <span className="ml-2 text-xs font-normal text-amber-700">
                            (doit être ≤ {fixedMax} MRU)
                          </span>
                        )}
                      </Label>
                      <Input
                        id="m"
                        type="number"
                        step="0.01"
                        min="0"
                        value={montant}
                        onChange={(e) => setMontant(e.target.value)}
                        placeholder={t(
                          'dashboard.payeur.saisissezMontant'
                        )}
                        required
                      />
                    </div>
                  </>
                );
              })()}
              {payDialog?.designation &&
              isDesignationRecuOptional(payDialog.designation.nom) ? null : (
              <div className="space-y-2">
                <Label>
                  {t('dashboard.payeur.recuLabel')}
                  {payDialog?.designation &&
                    isDesignationRecuOptional(payDialog.designation.nom) && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (optionnel)
                      </span>
                    )}
                </Label>

                {/* Inputs cachés — déclenchés via les boutons. `capture` fait
                    ouvrir la caméra arrière sur mobile / WebView Expo. */}
                <input
                  ref={fileUploadRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setRecuFiles((prev) => [...prev, f]);
                    if (fileUploadRef.current) fileUploadRef.current.value = '';
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setRecuFiles((prev) => [...prev, f]);
                    if (cameraRef.current) cameraRef.current.value = '';
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileUploadRef.current?.click()}
                  >
                    <FileUp className="mr-2 h-4 w-4" />
                    {recuFiles.length === 0
                      ? t('dashboard.payeur.importerFichier')
                      : `+ Ajouter un fichier`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    {recuFiles.length === 0
                      ? t('dashboard.payeur.scanner')
                      : '+ Scanner'}
                  </Button>
                </div>

                {recuFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {recuFiles.map((f, idx) => (
                      <div
                        key={`${f.name}-${idx}`}
                        className="rounded-md border bg-muted/30 p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="font-medium truncate">
                              {idx + 1}. {f.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {(f.size / 1024).toFixed(0)} Ko ·{' '}
                              {f.type ||
                                t('dashboard.payeur.fichierFallback')}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => {
                              setRecuFiles((prev) =>
                                prev.filter((_, i) => i !== idx)
                              );
                            }}
                            aria-label={t('dashboard.payeur.retirerFichier')}
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                        {idx === 0 && recuPreviewUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={recuPreviewUrl}
                            alt={t('dashboard.payeur.apercuRecu')}
                            className="mt-2 max-h-48 w-full object-contain rounded"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
            <DialogFooter className="shrink-0 gap-2 border-t bg-background px-3 py-3 m-1">
              <Button
                variant="outline"
                onClick={() => setPayDialog(null)}
                disabled={submittingPay}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={submitPay}
                disabled={
                  submittingPay ||
                  (recuFiles.length === 0 &&
                    !(
                      payDialog?.designation &&
                      isDesignationRecuOptional(payDialog.designation.nom)
                    ))
                }
                className="w-full sm:w-auto"
              >
                {submittingPay
                  ? t('dashboard.payeur.envoi')
                  : recuFiles.length > 1
                    ? `${t('dashboard.payeur.confirmerPaiement')} (${recuFiles.length} reçus)`
                    : t('dashboard.payeur.confirmerPaiement')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
