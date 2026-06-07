import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import {
  type IFactureManutention,
  type ITransit,
  type IDesignation,
  DesignationStatus,
  FactureManutentionStatus,
  UserRole,
  DESIGNATIONS_ADMIN_ONLY,
} from '@/types';
import { isAdminTransit } from '@/lib/roles';
import {
  ArrowLeft,
  RefreshCcw,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Save,
  X as XIcon,
  Trash2,
  ShieldCheck,
  Eye,
  FileText,
  Receipt,
} from 'lucide-react';

function designationStatusBadge(s: DesignationStatus | undefined, t: (key: string) => string) {
  switch (s) {
    case DesignationStatus.LIBRE:
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-500">
          {t('dashboard.manutention.detail.designationStatus.LIBRE')}
        </Badge>
      );
    case DesignationStatus.RESERVEE:
      return (
        <Badge className="bg-amber-500 text-white hover:bg-amber-500">
          {t('dashboard.manutention.detail.designationStatus.RESERVEE')}
        </Badge>
      );
    case DesignationStatus.PAYEE:
      return (
        <Badge className="bg-violet-600 text-white hover:bg-violet-600">
          {t('dashboard.manutention.detail.designationStatus.PAYEE')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_TRANSIT:
      return (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
          {t('dashboard.manutention.detail.designationStatus.VALIDEE_TRANSIT')}
        </Badge>
      );
    case DesignationStatus.VALIDEE_ADMIN:
      return (
        <Badge className="bg-green-700 text-white hover:bg-green-700">
          {t('dashboard.manutention.detail.designationStatus.VALIDEE_ADMIN')}
        </Badge>
      );
    case DesignationStatus.REJETEE:
      return <Badge variant="destructive">{t('dashboard.manutention.detail.designationStatus.REJETEE')}</Badge>;
    default:
      return <Badge variant="outline">{s || '—'}</Badge>;
  }
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function AdminFactureManutentionDetail() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAdmin =
    isAdminTransit(user?.role) || user?.role === UserRole.AGENT_TRANSIT;
  /** Distinction agent/admin pour l'UI (l'agent ne touche pas aux désignations). */
  const isAgentOnly = user?.role === UserRole.AGENT_TRANSIT;
  /** Admin transit / super-admin = peuvent valider une manutention BROUILLON. */
  const canValiderManutention = isAdminTransit(user?.role);
  const id = String(router.query.id || '');

  const [facture, setFacture] = useState<IFactureManutention | null>(null);
  const [transit, setTransit] = useState<ITransit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Mode édition : permet à l'admin d'ajouter/modifier les désignations du
  // transit lié. À l'enregistrement, le total de la facture client est
  // automatiquement recalculé côté API (PUT /api/transit/[id]).
  const [editMode, setEditMode] = useState(false);
  const [editDesignations, setEditDesignations] = useState<IDesignation[]>([]);
  const [editInteret, setEditInteret] = useState<string>('0');
  const [editClient, setEditClient] = useState<string>('');
  const [editClientId, setEditClientId] = useState<string>('');
  const [editObjet, setEditObjet] = useState<string>('');
  // Clés des docs marquées pour suppression (effacée à la sauvegarde).
  const [pendingRemovedDocKeys, setPendingRemovedDocKeys] = useState<string[]>(
    []
  );
  const [clientOptions, setClientOptions] = useState<
    { _id: string; nom: string }[]
  >([]);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMontant, setNewMontant] = useState('');

  const [openingDocKey, setOpeningDocKey] = useState<string | null>(null);

  // Receipt viewer state
  const [recuViewerDesignation, setRecuViewerDesignation] = useState<IDesignation | null>(null);
  const [recuViewerUrls, setRecuViewerUrls] = useState<Array<{ url: string; name: string; key: string }>>([]);
  const [recuViewerLoading, setRecuViewerLoading] = useState(false);
  const [recuViewerIdx, setRecuViewerIdx] = useState(0);

  const openRecuViewer = useCallback(
    async (designation: IDesignation) => {
      const recus = ((designation as { recus?: Array<{ key: string; name?: string }> }).recus || []);
      const legacyUrl = (designation as { recuUrl?: string | null }).recuUrl;
      const legacyName = (designation as { recuFilename?: string | null }).recuFilename;
      const keys: Array<{ key: string; name: string }> =
        recus.length > 0
          ? recus.filter((r) => r.key).map((r) => ({ key: r.key, name: r.name || r.key.split('/').pop() || r.key }))
          : legacyUrl
          ? [{ key: legacyUrl, name: legacyName || legacyUrl.split('/').pop() || 'reçu' }]
          : [];
      if (keys.length === 0) return;
      setRecuViewerDesignation(designation);
      setRecuViewerUrls([]);
      setRecuViewerLoading(true);
      setRecuViewerIdx(0);
      try {
        const urls = await Promise.all(
          keys.map(async ({ key, name }) => {
            const res = await fetch(`/api/documents/${encodeURIComponent(key)}`, {
              credentials: 'include',
            });
            const d = await res.json().catch(() => null);
            return { url: d?.url || '', name, key };
          })
        );
        setRecuViewerUrls(urls.filter((u) => u.url));
      } catch {
        setError(t('common.errorNetwork'));
        setRecuViewerDesignation(null);
      } finally {
        setRecuViewerLoading(false);
      }
    },
    [t]
  );

  const openDocument = useCallback(
    async (key: string) => {
      setOpeningDocKey(key);
      setError(null);
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(key)}`,
          { credentials: 'include' }
        );
        const d = await res.json().catch(() => null);
        if (d?.success && d.url) {
          window.open(d.url, '_blank', 'noopener');
        } else {
          setError(d?.error || 'Document introuvable');
        }
      } catch {
        setError(t('common.errorNetwork'));
      } finally {
        setOpeningDocKey(null);
      }
    },
    [t]
  );

  const [creatingFacture, setCreatingFacture] = useState(false);
  const handleCreateFactureClient = useCallback(async () => {
    if (!id) return;
    setCreatingFacture(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/manutention/${encodeURIComponent(id)}/create-facture-client`,
        { method: 'POST', credentials: 'include' }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccess(
          data.message ||
            `Facture ${data.data?.numero || ''} créée (${
              data.data?.totalFinal || 0
            } MRU)`
        );
        void reload();
      } else {
        setError(data?.error || `Erreur ${res.status}`);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setCreatingFacture(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  const [validating, setValidating] = useState(false);
  const handleValiderManutention = useCallback(async () => {
    if (!id) return;
    setValidating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/manutention/${encodeURIComponent(id)}/valider`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSuccess('Manutention validée — visible côté payeur');
        void reload();
      } else {
        setError(data?.error || `Erreur ${res.status}`);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setValidating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  const handleDownloadPdf = useCallback(async () => {
    if (!id || typeof window === 'undefined') return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/manutention/${encodeURIComponent(id)}/pdf`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        setError(t('common.error'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition');
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `manutention-${id}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setPdfLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (status !== 'loading' && user && !isAdmin) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAdmin, router]);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/manutention/${id}`, {
        credentials: 'include',
      }).then((x) => x.json());
      if (!r.success) {
        setError(r.error || t('common.error'));
        setFacture(null);
        return;
      }
      const fac = r.data as IFactureManutention;
      setFacture(fac);

      const tid = (fac as { transitId?: string }).transitId;
      if (tid) {
        try {
          const tr = await fetch(`/api/transit/${tid}`, {
            credentials: 'include',
          }).then((x) => x.json());
          if (tr.success) setTransit(tr.data as ITransit);
        } catch {
          /* ignore */
        }
      } else {
        setTransit(null);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (isAdmin && id) void reload();
  }, [isAdmin, id, reload]);

  // Active le mode édition si ?edit=1 est dans l'URL (lien Modifier de la liste).
  useEffect(() => {
    if (router.query.edit === '1') setEditMode(true);
  }, [router.query.edit]);

  // Synchronise les désignations éditables quand le transit charge ou quand
  // l'utilisateur entre/sort du mode édition.
  useEffect(() => {
    if (transit && editMode) {
      setEditDesignations(
        (transit.designations || []).map((d) => ({ ...d }))
      );
      setEditInteret(String(Number(transit.interet ?? 0)));
    }
  }, [transit, editMode]);

  // Pré-remplit les champs éditables (client/objet) + charge la liste des
  // clients à chaque entrée en mode édition.
  useEffect(() => {
    if (!editMode || !facture) return;
    setEditClient(facture.client || '');
    setEditClientId(
      facture.clientId
        ? String((facture as unknown as { clientId?: unknown }).clientId)
        : ''
    );
    setEditObjet(facture.objet || '');
    setPendingRemovedDocKeys([]);
    setNewDocFile(null);

    void (async () => {
      try {
        const r = await fetch('/api/transit/clients', {
          credentials: 'include',
        }).then((x) => x.json());
        if (r?.success) {
          setClientOptions(
            (r.data || []) as { _id: string; nom: string }[]
          );
        }
      } catch {
        /* ignore : liste optionnelle */
      }
    })();
  }, [editMode, facture]);

  const handleSaveDesignations = useCallback(async () => {
    if (!facture) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // 1) Sauvegarde les désignations + intérêt sur le transit (seulement
      //    si un transit existe — pas le cas d'une manutention agent encore
      //    en EN_ATTENTE_VALIDATION, qui n'a pas encore son dossier transit).
      //    AGENT_TRANSIT ne modifie jamais les désignations même quand le
      //    transit existerait (l'admin gère ça après validation).
      if (transit && !isAgentOnly) {
        const res = await fetch(`/api/transit/${transit._id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designations: editDesignations.map((d) => ({
              ...d,
              montant: Number(d.montant) || 0,
            })),
            interet: Math.max(0, Number(editInteret) || 0),
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || t('common.error'));
          return;
        }
      }

      // 2) Sauvegarde les champs de la manutention (client/objet) + suppression
      //    des documents marqués (cascade S3 + transit côté serveur).
      const manuChanged =
        editClient.trim() !== (facture.client || '') ||
        editClientId !==
          ((facture as unknown as { clientId?: unknown }).clientId
            ? String(
                (facture as unknown as { clientId?: unknown }).clientId
              )
            : '') ||
        editObjet.trim() !== (facture.objet || '') ||
        pendingRemovedDocKeys.length > 0;
      if (manuChanged) {
        const r2 = await fetch(`/api/manutention/${facture._id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: editClient.trim(),
            clientId: editClientId || null,
            objet: editObjet.trim(),
            removeDocKeys: pendingRemovedDocKeys,
          }),
        });
        const d2 = await r2.json().catch(() => null);
        if (!r2.ok || !d2?.success) {
          setError(d2?.error || `Erreur ${r2.status}`);
          return;
        }
      }

      setSuccess('Modifications enregistrées');
      setEditMode(false);
      setPendingRemovedDocKeys([]);
      void reload();
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSaving(false);
    }
  }, [
    transit,
    facture,
    isAgentOnly,
    editDesignations,
    editInteret,
    editClient,
    editClientId,
    editObjet,
    pendingRemovedDocKeys,
    reload,
    t,
  ]);

  // Upload immédiat d'un nouveau document via le flow S3 présigné.
  const handleUploadNewDoc = useCallback(async () => {
    if (!facture || !newDocFile) return;
    setUploadingDoc(true);
    setError(null);
    setSuccess(null);
    try {
      const presignRes = await fetch(
        `/api/manutention/documents/${facture._id}/presign-upload`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: newDocFile.name,
            contentType: newDocFile.type || 'application/octet-stream',
          }),
        }
      );
      const presignData = await presignRes.json().catch(() => null);
      if (!presignRes.ok || !presignData?.success) {
        throw new Error(presignData?.error || `Presign échoué (${presignRes.status})`);
      }
      const { uploadUrl, key, headers } = presignData.data as {
        uploadUrl: string;
        key: string;
        headers: Record<string, string>;
      };
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: newDocFile,
      });
      if (!putRes.ok) {
        throw new Error(`Upload S3 échoué (${putRes.status})`);
      }
      const regRes = await fetch(
        `/api/manutention/documents/${facture._id}/register`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            name: newDocFile.name,
            size: newDocFile.size,
          }),
        }
      );
      const regData = await regRes.json().catch(() => null);
      if (!regRes.ok || !regData?.success) {
        throw new Error(regData?.error || `Enregistrement échoué (${regRes.status})`);
      }
      setSuccess('Document ajouté');
      setNewDocFile(null);
      void reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Document : ${err.message}`
          : 'Échec de l\'upload'
      );
    } finally {
      setUploadingDoc(false);
    }
  }, [facture, newDocFile, reload]);

  const handleAddDesignation = useCallback(() => {
    const nom = newName.trim();
    if (!nom) return;
    const montant = Number(newMontant) || 0;
    setEditDesignations((prev) => [
      ...prev,
      {
        nom,
        montant,
        statutDesignation: DesignationStatus.LIBRE,
      } as IDesignation,
    ]);
    setNewName('');
    setNewMontant('');
    setAddOpen(false);
  }, [newName, newMontant]);

  const handleRemoveDesignation = useCallback((idx: number) => {
    setEditDesignations((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleChangeMontant = useCallback((idx: number, value: string) => {
    const montant = Number(value) || 0;
    setEditDesignations((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, montant } : d))
    );
  }, []);

  const designationColumns = useMemo<ColumnDef<IDesignation>[]>(
    () => [
      {
        id: 'nom',
        header: t('dashboard.manutention.detail.colDesignation'),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nom}</span>
        ),
      },
      {
        accessorKey: 'montant',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.manutention.detail.colMontant'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt(Number(row.original.montant || 0))} MRU
          </span>
        ),
      },
      {
        id: 'statut',
        header: t('dashboard.manutention.detail.colStatut'),
        cell: ({ row }) => designationStatusBadge(row.original.statutDesignation, t),
      },
      {
        id: 'paye',
        header: t('dashboard.manutention.detail.colPayeur'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.payeurId ? String(row.original.payeurId).slice(-6) : '—'}
          </span>
        ),
      },
      {
        id: 'recus',
        header: t('dashboard.manutention.detail.colRecus'),
        cell: ({ row }) => {
          const d = row.original;
          const recus = ((d as { recus?: Array<{ key: string }> }).recus || []);
          const legacyUrl = (d as { recuUrl?: string | null }).recuUrl;
          const count = recus.length > 0 ? recus.length : legacyUrl ? 1 : 0;
          if (count === 0)
            return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => void openRecuViewer(d)}
            >
              <Eye className="h-3 w-3" />
              {count > 1 ? `(${count})` : ''}
            </Button>
          );
        },
      },
    ],
    [t, openRecuViewer]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.manutention.loadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;

  if (error || !facture) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.manutention.loadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin/manutention">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.transit.list')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error || t('dashboard.manutention.detail.errorFallback')}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.manutention.detailTitle', { bl: facture.bl })}
        subtitle={facture.objet || facture.client || t('dashboard.manutention.detailFallback')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/manutention">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.transit.list')}
            </Link>
          </Button>
        }
        actions={
          <div className="flex gap-2">
            {!editMode &&
              canValiderManutention &&
              (facture.statut === FactureManutentionStatus.BROUILLON ||
                facture.statut ===
                  FactureManutentionStatus.EN_ATTENTE_VALIDATION) && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void handleValiderManutention()}
                  disabled={validating}
                >
                  {validating ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">{t('dashboard.manutention.detail.btnValider')}</span>
                </Button>
              )}
            {/* Créer facture client : visible quand toutes les désignations
                sont VALIDEE_ADMIN (CLOTURE) ou que le paiement est reçu et
                en attente de validation finale (PAYE_EN_ATTENTE_VALIDATION). */}
            {!editMode &&
              canValiderManutention &&
              (facture.statut === FactureManutentionStatus.CLOTURE ||
                facture.statut ===
                  FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION) &&
              transit &&
              !transit.factureClientId && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => void handleCreateFactureClient()}
                  disabled={creatingFacture}
                >
                  {creatingFacture ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  ) : (
                    <Receipt className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">{t('dashboard.manutention.detail.btnCreateFacture')}</span>
                  <span className="sm:hidden">{t('dashboard.manutention.detail.btnCreateFactureShort')}</span>
                </Button>
              )}
            {!editMode &&
              (transit ||
                (canValiderManutention &&
                  facture.statut ===
                    FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION) ||
                (isAgentOnly &&
                  facture.statut ===
                    FactureManutentionStatus.EN_ATTENTE_VALIDATION)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(true)}
                  className={isMobile ? 'h-10 px-3' : ''}
                >
                  <Pencil className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('dashboard.manutention.detail.btnModifier')}</span>
                </Button>
              )}
            {editMode && (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => void handleSaveDesignations()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  ) : (
                    <Save className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {saving ? t('dashboard.manutention.detail.btnSaving') : t('dashboard.manutention.detail.btnSaveModifications')}
                  </span>
                  <span className="sm:hidden">{saving ? '…' : 'Save'}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditMode(false);
                    setPendingRemovedDocKeys([]);
                  }}
                  disabled={saving}
                  className={isMobile ? 'h-10 px-3' : ''}
                >
                  <XIcon className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('actions.cancel')}</span>
                </Button>
              </>
            )}
            {facture.transitId && !editMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadPdf()}
                disabled={pdfLoading}
                className={isMobile ? 'h-10 px-3' : ''}
              >
                {pdfLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                ) : (
                  <FileDown className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">{t('dashboard.manutention.detail.btnTelechargerPdf')}</span>
              </Button>
            )}
            {!editMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reload()}
                className={isMobile ? 'h-10 px-3' : ''}
              >
                <RefreshCcw className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('actions.refresh')}</span>
              </Button>
            )}
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          {/* Info card facture */}
          <div className="rounded-lg bg-white p-4 border shadow-sm grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {editMode ? (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">
                  {t('dashboard.manutention.detail.fieldClient')}
                </div>
                {clientOptions.length > 0 ? (
                  <Select
                    value={editClientId || undefined}
                    onValueChange={(v) => {
                      setEditClientId(v);
                      const found = clientOptions.find((c) => c._id === v);
                      if (found) setEditClient(found.nom);
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={t('dashboard.manutention.detail.selectClientPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {clientOptions.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={editClient}
                    onChange={(e) => setEditClient(e.target.value)}
                    className="h-8"
                  />
                )}
              </div>
            ) : (
              <Field
                label={t('dashboard.manutention.detail.fieldClient')}
                value={facture.client || '—'}
                strong
              />
            )}
            <Field label={t('dashboard.manutention.detail.fieldBl')} value={facture.bl} mono />
            <Field
              label={t('dashboard.manutention.detail.fieldBonLivret')}
              value={`${fmt(facture.bonLivret)} MRU`}
              strong
            />
            <Field
              label={t('dashboard.manutention.detail.fieldStatut')}
              value={<Badge variant="outline">{facture.statut}</Badge>}
            />
            {editMode ? (
              <div className="space-y-1.5 sm:col-span-2">
                <div className="text-xs text-muted-foreground">
                  {t('dashboard.manutention.detail.fieldObjet')}
                </div>
                <Textarea
                  value={editObjet}
                  onChange={(e) => setEditObjet(e.target.value)}
                  rows={2}
                />
              </div>
            ) : (
              <Field
                label={t('dashboard.manutention.detail.fieldObjet')}
                value={facture.objet || '—'}
                className="sm:col-span-2"
              />
            )}
            <Field
              label={t('dashboard.manutention.detail.fieldCreatedAt')}
              value={new Date(facture.createdAt).toLocaleString('fr-FR')}
            />
            <Field
              label={t('dashboard.manutention.detail.fieldUpdatedAt')}
              value={new Date(facture.updatedAt).toLocaleString('fr-FR')}
            />
          </div>

          {/* Documents joints à la manutention */}
          {(editMode ||
            (Array.isArray(facture.documents) && facture.documents.length > 0)) && (
            <div className="rounded-lg bg-white p-4 border shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  {t('dashboard.manutention.detail.documentsTitle')}
                </h3>
                <Badge variant="secondary" className="ml-1">
                  {facture.documents?.length || 0}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(facture.documents || []).map((doc, idx) => {
                  const docKey = (doc as { key?: string }).key || '';
                  const docName = (doc as { name?: string }).name || docKey;
                  const docSize = Number((doc as { size?: number }).size) || 0;
                  const docDate = (doc as { uploadedAt?: string | Date })
                    .uploadedAt;
                  const markedForRemoval =
                    pendingRemovedDocKeys.includes(docKey);
                  return (
                    <div
                      key={docKey || idx}
                      className={
                        markedForRemoval
                          ? 'flex items-start gap-2 rounded-md border-2 border-dashed border-red-300 p-2.5 bg-red-50/40 opacity-60'
                          : 'flex items-start gap-2 rounded-md border p-2.5 bg-slate-50/40'
                      }
                    >
                      <div className="rounded-md bg-white border p-2 shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {docName}
                          {markedForRemoval && (
                            <span className="ml-2 text-[10px] text-red-600">
                              {t('dashboard.manutention.detail.docWillBeDeleted')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {docSize > 0
                            ? `${(docSize / 1024).toFixed(1)} Ko`
                            : ''}
                          {docDate
                            ? ` · ${new Date(docDate).toLocaleDateString('fr-FR')}`
                            : ''}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={openingDocKey === docKey || !docKey}
                          onClick={() => void openDocument(docKey)}
                        >
                          {openingDocKey === docKey ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="mr-1 h-3 w-3" />
                          )}
                          {t('dashboard.manutention.detail.docBtnVoir')}
                        </Button>
                        {editMode && docKey && (
                          <Button
                            size="sm"
                            variant={
                              markedForRemoval ? 'outline' : 'destructive'
                            }
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setPendingRemovedDocKeys((prev) =>
                                markedForRemoval
                                  ? prev.filter((k) => k !== docKey)
                                  : [...prev, docKey]
                              );
                            }}
                          >
                            {markedForRemoval ? (
                              <>
                                <XIcon className="mr-1 h-3 w-3" />
                                {t('dashboard.manutention.detail.docBtnAnnulerSuppression')}
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-1 h-3 w-3" />
                                {t('dashboard.manutention.detail.docBtnSupprimer')}
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {editMode && (
                <div className="border-t pt-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t('dashboard.manutention.detail.docAddTitle')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      onChange={(e) =>
                        setNewDocFile(e.target.files?.[0] || null)
                      }
                      className="max-w-md h-9"
                      disabled={uploadingDoc}
                    />
                    <Button
                      size="sm"
                      onClick={() => void handleUploadNewDoc()}
                      disabled={!newDocFile || uploadingDoc}
                    >
                      {uploadingDoc ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-3 w-3" />
                      )}
                      {uploadingDoc ? t('dashboard.manutention.detail.docBtnUploading') : t('dashboard.manutention.detail.docBtnUpload')}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('dashboard.manutention.detail.docUploadHint')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Désignations du transit lié — masquées pour AGENT_TRANSIT */}
          {!isAgentOnly && (
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardHeader className="text-xl font-bold text-primary p-0">
                {t('dashboard.manutention.detail.designationsTitle')}
              </CardHeader>
              {editMode && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('dashboard.manutention.detail.editBtnAdd')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditMode(false);
                      setEditDesignations([]);
                    }}
                    disabled={saving}
                  >
                    <XIcon className="mr-2 h-4 w-4" />
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveDesignations()}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t('dashboard.manutention.detail.editBtnSave')}
                  </Button>
                </div>
              )}
            </div>

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {!transit ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.manutention.detail.noTransit')}
              </p>
            ) : editMode ? (
              <div className="space-y-2">
                {editDesignations.length === 0 ? (
                  <p className="rounded border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('dashboard.manutention.detail.editEmpty')}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">{t('dashboard.manutention.detail.editColDesignation')}</th>
                          <th className="px-3 py-2 text-right font-medium">
                            {t('dashboard.manutention.detail.editColMontant')}
                          </th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editDesignations.map((d, idx) => {
                          const lock =
                            d.statutDesignation &&
                            d.statutDesignation !== DesignationStatus.LIBRE;
                          return (
                            <tr
                              key={d._id || `new-${idx}`}
                              className="border-b last:border-0"
                            >
                              <td className="px-3 py-2 font-medium">
                                {d.nom}
                                {lock && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    ({d.statutDesignation})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={String(d.montant ?? 0)}
                                  onChange={(e) =>
                                    handleChangeMontant(idx, e.target.value)
                                  }
                                  className="ml-auto h-8 w-32 text-right tabular-nums"
                                  disabled={
                                    d.statutDesignation ===
                                    DesignationStatus.VALIDEE_ADMIN
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                {!lock && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-600"
                                    onClick={() =>
                                      handleRemoveDesignation(idx)
                                    }
                                    aria-label={t('dashboard.manutention.detail.editAriaDeleteLine')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t bg-slate-50">
                        <tr>
                          <td className="px-3 py-2 font-semibold">
                            {t('dashboard.manutention.detail.editTotalOps')}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {fmt(
                              editDesignations.reduce(
                                (s, d) => s + (Number(d.montant) || 0),
                                0
                              )
                            )}{' '}
                            MRU
                          </td>
                          <td />
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-semibold">
                            <Label htmlFor="edit-interet" className="text-sm">
                              {t('dashboard.manutention.detail.editInteret')}
                            </Label>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              id="edit-interet"
                              type="number"
                              min="0"
                              step="0.01"
                              value={editInteret}
                              onChange={(e) => setEditInteret(e.target.value)}
                              className="ml-auto h-8 w-32 text-right tabular-nums"
                            />
                          </td>
                          <td />
                        </tr>
                        <tr className="border-t bg-emerald-50">
                          <td className="px-3 py-2 font-bold">{t('dashboard.manutention.detail.editTotalFinal')}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">
                            {fmt(
                              editDesignations.reduce(
                                (s, d) => s + (Number(d.montant) || 0),
                                0
                              ) +
                                (Number(editInteret) || 0)
                            )}{' '}
                            MRU
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.manutention.detail.editHint')}
                </p>
              </div>
            ) : (
              <>
                <DataTable
                  columns={designationColumns}
                  data={transit.designations || []}
                  emptyMessage={t('dashboard.manutention.noDesignations')}
                />
                {(() => {
                  const totalOps = (transit.designations || []).reduce(
                    (s, d) => s + (Number(d.montant) || 0),
                    0
                  );
                  const interet = Number(transit.interet) || 0;
                  if (totalOps === 0 && interet === 0) return null;
                  return (
                    <div className="border-t pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('dashboard.manutention.detail.editTotalOps')}</span>
                        <span className="tabular-nums font-medium">{fmt(totalOps)} MRU</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('dashboard.manutention.detail.editInteret')}</span>
                        <span className="tabular-nums">{fmt(interet)} MRU</span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-700 pt-1 border-t">
                        <span>{t('dashboard.manutention.detail.editTotalFinal')}</span>
                        <span className="tabular-nums">{fmt(totalOps + interet)} MRU</span>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          )}
        </div>

        {/* Receipt viewer dialog */}
        <Dialog
          open={!!recuViewerDesignation}
          onOpenChange={(open) => {
            if (!open) setRecuViewerDesignation(null);
          }}
        >
          <DialogContent className="max-w-4xl flex flex-col" style={{ height: '85vh' }}>
            <DialogHeader>
              <DialogTitle>
                {t('dashboard.manutention.detail.recuViewerTitle', {
                  nom: recuViewerDesignation?.nom || '',
                })}
              </DialogTitle>
            </DialogHeader>
            {recuViewerLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : recuViewerUrls.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('dashboard.manutention.detail.recuViewerEmpty')}
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-3 overflow-hidden">
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {recuViewerUrls.length > 1 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={recuViewerIdx === 0}
                        onClick={() => setRecuViewerIdx((i) => i - 1)}
                      >
                        {t('dashboard.manutention.detail.recuViewerPrev')}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {recuViewerIdx + 1} / {recuViewerUrls.length}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={recuViewerIdx === recuViewerUrls.length - 1}
                        onClick={() => setRecuViewerIdx((i) => i + 1)}
                      >
                        {t('dashboard.manutention.detail.recuViewerNext')}
                      </Button>
                    </>
                  )}
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    {recuViewerUrls[recuViewerIdx]?.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(recuViewerUrls[recuViewerIdx]?.url, '_blank', 'noopener')
                    }
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    {t('dashboard.manutention.detail.recuViewerOpenTab')}
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden rounded border min-h-0">
                  {recuViewerUrls[recuViewerIdx]?.url &&
                    (recuViewerUrls[recuViewerIdx].key.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <img
                        src={recuViewerUrls[recuViewerIdx].url}
                        alt={recuViewerUrls[recuViewerIdx].name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={recuViewerUrls[recuViewerIdx].url}
                        title={recuViewerUrls[recuViewerIdx].name}
                        className="w-full h-full border-0"
                      />
                    ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Dialog ajout désignation */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.manutention.detail.dialogAddTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(() => {
                const existing = new Set(
                  editDesignations.map((d) => (d.nom || '').toLowerCase().trim())
                );
                const available = DESIGNATIONS_ADMIN_ONLY.filter(
                  (n) => !existing.has(n.toLowerCase())
                );
                if (available.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <Label>{t('dashboard.manutention.detail.dialogOptionalLabel')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {available.map((nom) => (
                        <Button
                          key={nom}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setNewName(nom);
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {nom}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                <Label htmlFor="new-name">{t('dashboard.manutention.detail.dialogNomLabel')}</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('dashboard.manutention.detail.dialogNomPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-montant">{t('dashboard.manutention.detail.dialogMontantLabel')}</Label>
                <Input
                  id="new-montant"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMontant}
                  onChange={(e) => setNewMontant(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAddOpen(false);
                  setNewName('');
                  setNewMontant('');
                }}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={handleAddDesignation}
                disabled={!newName.trim()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('dashboard.manutention.detail.editBtnAdd')}
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
  mono,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={[
          strong ? 'text-lg font-semibold' : 'text-sm',
          mono ? 'font-mono tabular-nums' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </div>
    </div>
  );
}
