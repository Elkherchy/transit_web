import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  TransitStatus,
  ITransit,
  IDesignation,
  UserRole,
  DESIGNATIONS_DEFAULT,
} from '@/types';
import {
  ArrowLeft,
  Plus,
  Save,
  CheckCircle,
  Loader2,
  Trash2,
  FileText,
  Upload,
  Download,
  RefreshCw,
  Receipt,
  Printer,
  FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClientCombobox } from '@/components/transit/ClientCombobox';
import {
  PrintableTransitDoc,
  buildPrintableTransitModel,
  type PrintableTransitModel,
} from '@/components/transit/PrintableTransitDoc';

interface TransitWithDocs extends ITransit {
  documents?: IDocument[];
  facture?: { _id?: string; interet?: number } | null;
}

interface IDocument {
  _id?: string;
  key: string;
  name: string;
  size: number;
  uploadedAt: Date;
}

const emptyForm = (designations: IDesignation[]) => ({
  clientId: '',
  client: '',
  bl: '',
  objet: '',
  designations,
  interet: 0,
});

/** Dans la fenêtre d’impression, le contenu n’est plus positionné hors écran (cf. globals.css). */
const TRANSIT_PRINT_POPUP_ROOT_FIX_CSS = `
html,body{margin:0;background:#fff;}
#transit-print-root{
  position:static!important;left:auto!important;top:auto!important;
  width:100%!important;max-width:100%!important;
  pointer-events:auto!important;visibility:visible!important;height:auto!important;
  z-index:auto!important;
}
`;

function collectStylesheetLinksForPrintDoc(origin: string): string {
  const parts: string[] = [];
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('chrome-extension:')) continue;
    try {
      const abs = new URL(href, origin).href;
      parts.push(`<link rel="stylesheet" href="${abs.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`);
    } catch {
      /* ignore invalid href */
    }
  }
  return parts.join('');
}

function waitForStylesheetsIn(doc: Document): Promise<void> {
  const links = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
  if (links.length === 0) return Promise.resolve();
  return Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          const done = () => resolve();
          link.addEventListener('load', done, { once: true });
          link.addEventListener('error', done, { once: true });
          window.setTimeout(done, 5000);
        })
    )
  ).then(() => undefined);
}

function waitForImagesIn(doc: Document): Promise<void> {
  return Promise.all(
    [...doc.images].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
    )
  ).then(() => undefined);
}

/** Document HTML complet pour impression hors page (iframe ou nouvelle fenêtre). */
function buildPrintableTransitHtmlDocument(snapshotHtml: string): string {
  const origin = window.location.origin;
  const baseEsc = `${origin}/`.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const links = collectStylesheetLinksForPrintDoc(origin);
  return (
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>SNTS</title>` +
    `<base href="${baseEsc}"><style>${TRANSIT_PRINT_POPUP_ROOT_FIX_CSS}</style>${links}</head>` +
    `<body class="printing-transit">${snapshotHtml}</body></html>`
  );
}

/**
 * Impression depuis une iframe cachée (srcdoc → URL about:srcdoc dans le pied du navigateur,
 * pas l’URL du dashboard). Ne nécessite pas d’autoriser les popups.
 */
function printTransitSnapshotViaHiddenIframe(
  snapshotHtml: string,
  isCancelled: () => boolean
): Promise<'printed' | 'failed'> {
  const html = buildPrintableTransitHtmlDocument(snapshotHtml);

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'SNTS');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
    });

    let settled = false;
    const hangGuard = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve('failed');
    }, 25_000);

    const fail = () => {
      clearTimeout(hangGuard);
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve('failed');
    };

    iframe.onload = () => {
      clearTimeout(hangGuard);
      void (async () => {
        try {
          const w = iframe.contentWindow;
          const d = iframe.contentDocument;
          if (!w || !d) {
            fail();
            return;
          }
          if (isCancelled()) {
            fail();
            return;
          }
          await waitForStylesheetsIn(d);
          if (isCancelled()) {
            fail();
            return;
          }
          await waitForImagesIn(d);
          if (isCancelled()) {
            fail();
            return;
          }

          const removeIframe = () => {
            try {
              iframe.remove();
            } catch {
              /* ignore */
            }
          };
          const safety = window.setTimeout(removeIframe, 90_000);
          w.addEventListener(
            'afterprint',
            () => {
              clearTimeout(safety);
              removeIframe();
            },
            { once: true }
          );

          try {
            w.focus();
            w.print();
            resolve('printed');
          } catch {
            clearTimeout(safety);
            removeIframe();
            fail();
          }
        } catch {
          fail();
        }
      })();
    };

    iframe.onerror = () => fail();
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

/**
 * Nouvelle fenêtre about:blank (évite l’URL longue du dashboard dans le pied d’impression).
 */
async function printTransitSnapshotInDetachedWindow(
  snapshotHtml: string,
  isCancelled: () => boolean
): Promise<'printed' | 'popup_blocked' | 'aborted'> {
  const win = window.open('about:blank', '_blank', 'noopener,noreferrer,width=900,height=1120');
  if (!win) return 'popup_blocked';

  win.document.open();
  win.document.write(buildPrintableTransitHtmlDocument(snapshotHtml));
  win.document.close();

  await waitForStylesheetsIn(win.document);
  if (isCancelled()) {
    win.close();
    return 'aborted';
  }
  await waitForImagesIn(win.document);
  if (isCancelled()) {
    win.close();
    return 'aborted';
  }

  const closeWin = () => {
    try {
      if (!win.closed) win.close();
    } catch {
      /* ignore */
    }
  };
  win.addEventListener('afterprint', closeWin, { once: true });
  const safetyClose = window.setTimeout(closeWin, 90_000);
  win.addEventListener('afterprint', () => clearTimeout(safetyClose), { once: true });

  win.focus();
  win.print();
  return 'printed';
}

/** Iframe d’abord (pas de popup), puis fenêtre dédiée, pour masquer l’URL du dossier dans le pied du navigateur. */
async function printTransitSnapshotOffMainPage(
  snapshotHtml: string,
  isCancelled: () => boolean
): Promise<'printed' | 'popup_blocked' | 'aborted'> {
  const viaIframe = await printTransitSnapshotViaHiddenIframe(snapshotHtml, isCancelled);
  if (viaIframe === 'printed') return 'printed';
  if (isCancelled()) return 'aborted';
  return printTransitSnapshotInDetachedWindow(snapshotHtml, isCancelled);
}

export type TransitFormMode = 'create' | 'edit';

interface TransitDossierFormProps {
  mode: TransitFormMode;
  transitId?: string;
  readOnly?: boolean;
  /** Page `/dashboard/transit/details` : masque retour + titre + sous-titre du formulaire */
  hideListHeader?: boolean;
}

export default function TransitDossierForm({
  mode,
  transitId,
  readOnly = false,
  hideListHeader = false,
}: TransitDossierFormProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceDocIdRef = useRef<string | null>(null);

  const MAX_DOC_BYTES = 10 * 1024 * 1024;

  /** Fichiers choisis en mode création, uploadés juste après POST /api/transit */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const defaultDesignations = useMemo(
    () => DESIGNATIONS_DEFAULT.map((nom) => ({ nom, montant: 0 })),
    []
  );

  const [transit, setTransit] = useState<TransitWithDocs | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [formData, setFormData] = useState(() => emptyForm(defaultDesignations));
  const [documents, setDocuments] = useState<IDocument[]>([]);
  const [docNames, setDocNames] = useState<Record<string, string>>({});
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [isAddDesignationOpen, setIsAddDesignationOpen] = useState(false);
  const [newDesignationName, setNewDesignationName] = useState('');
  const [generatingFacture, setGeneratingFacture] = useState(false);
  const [printModel, setPrintModel] = useState<PrintableTransitModel | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN;
  const isAgentTransit = user?.role === UserRole.AGENT_TRANSIT;
  const isAgentOrAdmin =
    user?.role === UserRole.ADMIN || user?.role === UserRole.AGENT_TRANSIT;
  const isReadOnlyView = mode === 'edit' && readOnly;
  const transitLocked =
    transit &&
    (transit.statut === TransitStatus.VALIDE ||
      transit.statut === TransitStatus.CLOTURE);
  const canEdit =
    !readOnly &&
    (mode === 'create' ||
      (transit != null && isAgentOrAdmin && !transitLocked));
  const hasFacture = Boolean(
    transit?.facture &&
      typeof transit.facture === 'object' &&
      transit.facture._id
  );
  const canGenerateFacture =
    mode === 'edit' &&
    !readOnly &&
    isAgentOrAdmin &&
    transit != null &&
    !hasFacture &&
    (transit.statut === TransitStatus.EN_COURS ||
      transit.statut === TransitStatus.BROUILLON);

  const fetchTransit = useCallback(async () => {
    if (mode !== 'edit' || !transitId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/transit/${transitId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setTransit(data.data);
        setFormData({
          clientId: data.data.clientId ? String(data.data.clientId) : '',
          client: data.data.client || '',
          bl: data.data.bl || '',
          objet: data.data.objet || '',
          designations:
            data.data.designations?.length > 0
              ? data.data.designations
              : defaultDesignations,
          interet:
            data.data.facture?.interet ??
            data.data.interet ??
            0,
        });
        setDocuments(data.data.documents || []);
      } else {
        setTransit(null);
      }
    } catch {
      setTransit(null);
    } finally {
      setLoading(false);
    }
  }, [mode, transitId, defaultDesignations]);

  useEffect(() => {
    if (mode === 'edit' && transitId) {
      void fetchTransit();
    }
  }, [mode, transitId, fetchTransit]);

  useEffect(() => {
    if (mode !== 'edit' || !transitId || typeof window === 'undefined') return;
    const key = `transitDocUploadWarn:${transitId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    const n = parseInt(raw, 10) || 0;
    if (n > 0) {
      setFeedback({
        type: 'err',
        text: `${n} pièce(s) jointe(s) n’ont pas pu être envoyée(s) à la création. Ajoutez-les à nouveau ci-dessous.`,
      });
    }
  }, [mode, transitId]);

  useLayoutEffect(() => {
    if (!printModel) return;
    let cancelled = false;

    void (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      const root = document.getElementById('transit-print-root');
      if (!root) {
        setPrintModel(null);
        return;
      }

      const snapshot = root.outerHTML;
      const detached = await printTransitSnapshotOffMainPage(snapshot, () => cancelled);

      if (cancelled) {
        setPrintModel(null);
        return;
      }

      if (detached === 'printed' || detached === 'aborted') {
        setPrintModel(null);
        return;
      }

      /* Fenêtre bloquée : retour à l’impression sur la page courante */
      document.body.classList.add('printing-transit');
      const imgs = root.querySelectorAll('img');
      await Promise.all(
        [...imgs].map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  img.addEventListener('load', () => res(), { once: true });
                  img.addEventListener('error', () => res(), { once: true });
                })
        )
      );
      if (cancelled) {
        document.body.classList.remove('printing-transit');
        setPrintModel(null);
        return;
      }
      window.print();
      document.body.classList.remove('printing-transit');
      setPrintModel(null);
    })();

    return () => {
      cancelled = true;
      document.body.classList.remove('printing-transit');
    };
  }, [printModel]);

  useEffect(() => {
    if (
      mode === 'edit' &&
      transit &&
      transit.designations.length === 0 &&
      canEdit
    ) {
      setFormData((prev) => ({
        ...prev,
        designations: defaultDesignations,
      }));
    }
  }, [mode, transit, canEdit, defaultDesignations]);

  useEffect(() => {
    const m: Record<string, string> = {};
    documents.forEach((d) => {
      if (d._id) m[d._id] = d.name;
    });
    setDocNames(m);
  }, [documents]);

  const calculateTotalOperations = () =>
    formData.designations.reduce((sum, d) => sum + (d.montant || 0), 0);

  const calculateTotalFinal = () => calculateTotalOperations() + formData.interet;

  const handleSave = async () => {
    if (mode !== 'edit' || !transitId || readOnly) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/transit/${transitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId: formData.clientId || undefined,
          client: formData.client,
          bl: formData.bl,
          objet: formData.objet,
          designations: formData.designations,
          interet: formData.interet,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setTransit(data.data as TransitWithDocs);
        setFeedback({ type: 'ok', text: 'Dossier enregistré.' });
      } else {
        setFeedback({ type: 'err', text: data.error || 'Erreur enregistrement' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (
      !formData.clientId?.trim() ||
      !formData.client?.trim() ||
      !formData.bl?.trim() ||
      !formData.objet?.trim()
    ) {
      setFeedback({
        type: 'err',
        text: 'Choisissez ou créez un client, puis renseignez BL et objet.',
      });
      return;
    }
    setCreating(true);
    setFeedback(null);
    setUploadError(null);
    try {
      const response = await fetch('/api/transit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId: formData.clientId.trim(),
          client: formData.client.trim(),
          bl: formData.bl.trim(),
          objet: formData.objet.trim(),
          designations: formData.designations,
          date: new Date(),
        }),
      });
      const data = await response.json();
      if (data.success && data.data?._id) {
        const newId = data.data._id as string;
        const toUpload = [...pendingFiles];
        if (toUpload.length > 0) {
          setPendingFiles([]);
          let failed = 0;
          for (const file of toUpload) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              const up = await fetch(`/api/transit/${newId}/document`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
              });
              const uj = await up.json();
              if (!uj.success) failed += 1;
            } catch {
              failed += 1;
            }
          }
          if (failed > 0) {
            sessionStorage.setItem(
              `transitDocUploadWarn:${newId}`,
              String(failed)
            );
          }
        }
        await router.push(`/dashboard/transit/edit/${newId}`);
        return;
      }
      setFeedback({ type: 'err', text: data.error || 'Création impossible' });
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    if (mode !== 'edit' || !transitId) return;
    if (!formData.client || !formData.bl || !formData.objet) {
      setFeedback({
        type: 'err',
        text: 'Renseignez client, BL et objet.',
      });
      return;
    }
    if (formData.designations.length === 0) {
      setFeedback({ type: 'err', text: 'Ajoutez au moins une désignation.' });
      return;
    }
    setConfirming(true);
    setFeedback(null);
    try {
      const saveResponse = await fetch(`/api/transit/${transitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId: formData.clientId || undefined,
          client: formData.client,
          bl: formData.bl,
          objet: formData.objet,
          designations: formData.designations,
          interet: formData.interet,
          statut: TransitStatus.BROUILLON,
        }),
      });
      const saveData = await saveResponse.json();
      if (saveData.success) {
        setFeedback({ type: 'ok', text: 'Dossier confirmé.' });
        await router.push('/dashboard/transit');
      } else {
        setFeedback({ type: 'err', text: saveData.error || 'Erreur confirmation' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setConfirming(false);
    }
  };

  const handleGenerateFacture = async () => {
    if (mode !== 'edit' || !transitId || !canGenerateFacture) return;
    setGeneratingFacture(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/transit/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          transitId,
          interet: formData.interet,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'ok',
          text: 'Facture générée. Retrouvez-la dans Factures.',
        });
        await fetchTransit();
      } else {
        setFeedback({
          type: 'err',
          text: data.error || 'Impossible de générer la facture',
        });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setGeneratingFacture(false);
    }
  };

  const handleUpdateDesignationMontant = (index: number, montant: number) => {
    setFormData((prev) => ({
      ...prev,
      designations: prev.designations.map((d, i) =>
        i === index ? { ...d, montant } : d
      ),
    }));
  };

  const handleAddDesignation = () => {
    if (!newDesignationName.trim()) return;
    setFormData((prev) => ({
      ...prev,
      designations: [
        ...prev.designations,
        { nom: newDesignationName.trim(), montant: 0 },
      ],
    }));
    setNewDesignationName('');
    setIsAddDesignationOpen(false);
  };

  const handleRemoveDesignation = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      designations: prev.designations.filter((_, i) => i !== index),
    }));
  };

  const handlePendingFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (mode !== 'create') return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadError(null);
    const tooBig = files.filter((f) => f.size > MAX_DOC_BYTES);
    const ok = files.filter((f) => f.size <= MAX_DOC_BYTES);
    if (tooBig.length > 0) {
      setUploadError(
        `Fichier(s) trop volumineux (max 10 Mo) : ${tooBig.map((f) => f.name).join(', ')}`
      );
    }
    if (ok.length > 0) {
      setPendingFiles((prev) => [...prev, ...ok]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (mode !== 'edit' || !transitId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      setUploadError('Ce fichier dépasse 10 Mo.');
      e.target.value = '';
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const response = await fetch(`/api/transit/${transitId}/document`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await response.json();
      if (data.success) {
        setDocuments((prev) => [
          ...prev,
          {
            _id: data.data._id,
            key: data.data.key,
            name: data.data.name,
            size: data.data.size,
            uploadedAt: new Date(data.data.uploadedAt),
          },
        ]);
      } else {
        setUploadError(data.error || 'Erreur upload');
      }
    } catch {
      setUploadError('Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!transitId || !docId) return;
    setDeletingId(docId);
    try {
      const response = await fetch(`/api/transit/${transitId}/document/${docId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        setDocuments((prev) => prev.filter((d) => d._id !== docId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameDocument = async (docId: string, name: string) => {
    if (!transitId || !docId) return;
    const t = name.trim();
    if (!t) return;
    const current = documents.find((d) => d._id === docId)?.name;
    if (current === t) return;
    setUploadError(null);
    try {
      const res = await fetch(`/api/transit/${transitId}/document/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: t }),
      });
      const data = await res.json();
      if (data.success) {
        setDocuments((prev) =>
          prev.map((d) => (d._id === docId ? { ...d, name: t } : d))
        );
      } else {
        setUploadError(data.error || 'Renommage impossible');
      }
    } catch {
      setUploadError('Erreur réseau');
    }
  };

  const openReplaceDocument = (docId: string) => {
    replaceDocIdRef.current = docId;
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const docId = replaceDocIdRef.current;
    const file = e.target.files?.[0];
    replaceDocIdRef.current = null;
    e.target.value = '';
    if (!docId || !file || !transitId) return;
    if (file.size > MAX_DOC_BYTES) {
      setUploadError('Ce fichier dépasse 10 Mo.');
      return;
    }
    setReplacingId(docId);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/transit/${transitId}/document/${docId}`, {
        method: 'PUT',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDocuments((prev) =>
          prev.map((d) =>
            d._id === docId
              ? {
                  ...d,
                  key: data.data.key,
                  name: data.data.name,
                  size: data.data.size,
                  uploadedAt: new Date(data.data.uploadedAt),
                }
              : d
          )
        );
      } else {
        setUploadError(data.error || 'Remplacement impossible');
      }
    } catch {
      setUploadError('Erreur réseau');
    } finally {
      setReplacingId(null);
    }
  };

  const handleDownloadDocument = async (key: string) => {
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.url) window.open(data.url, '_blank');
    } catch {
      /* ignore */
    }
  };

  const handleDownloadPdf = useCallback(async () => {
    if (!transit || typeof window === 'undefined') return;
    const id = String((transit as { _id?: unknown })._id ?? '');
    if (!id) return;
    setFeedback(null);
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/transit/${encodeURIComponent(id)}/pdf`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        setFeedback({ type: 'err', text: 'Téléchargement PDF impossible' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition');
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `transit-${id}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setPdfLoading(false);
    }
  }, [transit]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const formatTime = (date: Date) => new Date(date).toLocaleString('fr-FR');

  const getStatusBadge = (status: TransitStatus) => {
    const statusConfig: Record<
      TransitStatus,
      { color: string; label: string }
    > = {
      [TransitStatus.EN_COURS]: { color: 'bg-primary', label: 'En cours' },
      [TransitStatus.BROUILLON]: { color: 'bg-gray-500', label: 'Brouillon' },
      [TransitStatus.FACTURE_EMISE]: {
        color: 'bg-yellow-500',
        label: 'Facture émise',
      },
      [TransitStatus.EN_VALIDATION]: {
        color: 'bg-orange-500',
        label: 'En validation',
      },
      [TransitStatus.VALIDE_TRANSIT]: {
        color: 'bg-emerald-500',
        label: 'Validé transit',
      },
      [TransitStatus.VALIDE]: { color: 'bg-green-500', label: 'Validé' },
      [TransitStatus.CLOTURE]: { color: 'bg-purple-500', label: 'Clôturé' },
    };
    const config = statusConfig[status];
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && canEdit) {
      void handleCreate();
    }
  };

  if (mode === 'edit' && loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (mode === 'edit' && !transit) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Dossier non trouvé</p>
        <Button
          variant="outline"
          className="mt-4"
          type="button"
          onClick={() => void router.push('/dashboard/transit')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la liste
        </Button>
      </div>
    );
  }

  if (!isAgentOrAdmin && mode === 'create') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Accès réservé aux agents transit et administrateurs.
      </div>
    );
  }

  const hasDesignations = formData.designations.length > 0;
  const sectionClass = 'px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7';
  const formId = 'transit-dossier-form';

  const compactDetailsChrome = Boolean(hideListHeader && mode === 'edit');

  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0 max-w-7xl bg-white border shadow-sm',
        compactDetailsChrome
          ? 'rounded-xl px-2 py-3 sm:px-3 sm:py-4 pb-6'
          : 'rounded-lg px-3 sm:px-4 lg:px-6 p-4 pb-8'
      )}
    >
      {printModel &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="transit-print-root">
            <PrintableTransitDoc
              model={printModel}
              assetOrigin={
                typeof window !== 'undefined' ? window.location.origin : ''
              }
            />
          </div>,
          document.body
        )}
      {feedback && (
        <div
          role="status"
          className={`mb-4 rounded-xl border px-4 py-3 text-sm shadow-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800'
              : 'border-red-200/80 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <header
        className={cn(
          compactDetailsChrome ? 'mb-3' : 'mb-5 space-y-4 lg:mb-6'
        )}
      >
        <div
          className={cn(
            'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6',
            compactDetailsChrome && 'gap-2'
          )}
        >
          {!compactDetailsChrome && (
            <div className="min-w-0 flex-1 space-y-1">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="-ml-2 text-muted-foreground hover:bg-transparent hover:text-foreground hover:border-gray-200 border border-gray-200"
                onClick={() => void router.push('/dashboard/transit')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Liste des dossiers
              </Button>
              <h1 className="text-xl font-semibold tracking-tight text-primary sm:text-xl">
                {mode === 'create'
                  ? 'Nouveau dossier'
                  : isReadOnlyView
                    ? 'Détails du dossier transit'
                    : 'Dossier transit'}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {mode === 'create'
                  ? 'Renseignez le dossier. Pièces jointes : sélectionnez-les à droite (envoi au moment de la création) ou ajoutez-les après sur cette même page.'
                  : canEdit
                    ? 'Identité, montants et pièces jointes : tout est regroupé ci-dessous.'
                    : 'Consultation — les champs ne sont plus modifiables.'}
              </p>
            </div>
          )}
          <div
            className={cn(
              'flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
              compactDetailsChrome
                ? 'w-full flex-row flex-wrap justify-end gap-2'
                : 'w-full sm:w-auto'
            )}
          >
            {mode === 'create' && canEdit && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void router.push('/dashboard/transit')}
                >
                  Annuler
                </Button>
                <Button type="submit" form={formId} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {pendingFiles.length > 0
                        ? 'Création et envoi des pièces…'
                        : 'Création…'}
                    </>
                  ) : (
                    'Créer le dossier'
                  )}
                </Button>
              </div>
            )}
            {mode === 'edit' && transit && (
              <div
                className={cn(
                  'flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center',
                  compactDetailsChrome
                    ? 'justify-end'
                    : 'sm:justify-between lg:max-w-none'
                )}
              >
                <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="no-print"
                    onClick={() => {
                    const m = buildPrintableTransitModel(transit);
                    if (isAgentTransit) { m.interet = 0; m.total = m.totalOperations; }
                    setPrintModel(m);
                  }}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="no-print"
                    disabled={pdfLoading}
                    onClick={() => void handleDownloadPdf()}
                  >
                    {pdfLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="mr-2 h-4 w-4" />
                    )}
                    PDF
                  </Button>
                  {getStatusBadge(transit.statut)}
                </div>
                {canEdit && (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end lg:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void handleSave()}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Enregistrer
                    </Button>
                    {transit?.statut === TransitStatus.EN_COURS && (
                      <Button
                        type="button"
                        className="border-0 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={confirming}
                        onClick={() => void handleConfirm()}
                      >
                        {confirming ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Confirmer le dossier
                      </Button>
                    )}
                    {canGenerateFacture && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={generatingFacture}
                        onClick={() => void handleGenerateFacture()}
                      >
                        {generatingFacture ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Receipt className="mr-2 h-4 w-4" />
                        )}
                        Générer facture
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <form
        id={formId}
        onSubmit={onFormSubmit}
        className="rounded-2xl border border-border/80 bg-card text-card-foreground shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] lg:overflow-hidden"
      >
        <div className="flex flex-col">
          <div className="min-w-0 divide-y divide-border/70">
          {/* Identification */}
          <fieldset disabled={!canEdit} className={`${sectionClass} space-y-5 min-w-0 border-0`}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <span className="text-sm font-bold">1</span>
              </span>
              <div>
                <legend className="text-base font-semibold text-foreground">
                  Identification
                </legend>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client, connaissement et objet du dossier
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 xl:gap-6">
              <div className="space-y-2">
                <ClientCombobox
                  valueId={formData.clientId}
                  valueName={formData.client}
                  onChange={(id, name) =>
                    setFormData((prev) => ({ ...prev, clientId: id, client: name }))
                  }
                  disabled={!canEdit}
                  label="Client"
                  required
                  placeholder="Rechercher ou créer un client"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bl" className="text-sm font-medium">
                  N° BL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="bl"
                  name="bl"
                  className="h-11"
                  value={formData.bl}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, bl: e.target.value }))
                  }
                  placeholder="Ex. MAEU1234567"
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                <Label htmlFor="objet" className="text-sm font-medium">
                  Objet <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="objet"
                  name="objet"
                  className="h-11"
                  value={formData.objet}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, objet: e.target.value }))
                  }
                  placeholder="Description courte du dossier"
                  required
                />
              </div>
            </div>
          </fieldset>

          {/* Désignations */}
          <fieldset disabled={!canEdit} className={`${sectionClass} space-y-5 min-w-0 border-0`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-sm font-bold">2</span>
                </span>
                <div className="min-w-0">
                  <legend className="text-base font-semibold text-foreground">
                    Désignations & montants
                  </legend>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Montants en MRU
                  </p>
                </div>
              </div>
              {canEdit && isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setIsAddDesignationOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter une ligne
                </Button>
              )}
            </div>

            {formData.designations.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune désignation pour l’instant.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/80">
                <div className="hidden sm:grid sm:grid-cols-[1fr_8rem_6rem_2.75rem] sm:gap-0 sm:bg-muted/40 sm:px-3 sm:py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="pl-1">Libellé</span>
                  <span className="text-right pr-2">Montant</span>
                  <span />
                  <span />
                </div>
                <ul className="divide-y divide-border/80">
                  {formData.designations.map((designation, index) => (
                    <li
                      key={`${designation.nom}-${index}`}
                      className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_8rem_6rem_2.75rem] sm:items-center sm:gap-2 sm:px-3 sm:py-3 bg-background/50"
                    >
                      <span className="text-sm font-medium leading-snug sm:pl-1">
                        <span className="text-muted-foreground sm:hidden text-xs font-normal block mb-1">
                          Libellé
                        </span>
                        {designation.nom}
                      </span>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <span className="text-muted-foreground text-xs sm:hidden shrink-0">
                          Montant (MRU)
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-11 sm:h-10 text-right tabular-nums sm:max-w-[7rem]"
                          aria-label={`Montant ${designation.nom}`}
                          value={designation.montant}
                          onChange={(e) =>
                            handleUpdateDesignationMontant(
                              index,
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                      <span className="hidden sm:block text-xs text-muted-foreground text-right pr-1">
                        MRU
                      </span>
                      {canEdit && isAdmin ? (
                        <div className="flex justify-end sm:justify-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            className="h-11 w-11 sm:h-10 sm:w-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemoveDesignation(index)}
                            aria-label={`Retirer ${designation.nom}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasDesignations && (
              <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Total opérations
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                      {calculateTotalOperations().toLocaleString('fr-FR')}{' '}
                      <span className="text-base font-normal text-muted-foreground">MRU</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                    {!isAgentTransit && (
                    <div className="space-y-2">
                      <Label htmlFor="interet" className="text-sm font-medium">
                        Intérêts (MRU)
                      </Label>
                      <Input
                        id="interet"
                        name="interet"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        className="h-11 w-full sm:w-36 text-right tabular-nums"
                        value={formData.interet}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            interet: parseFloat(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    )}
                    <div className="sm:border-l sm:border-border/80 sm:pl-6">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Total final
                      </p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-primary sm:text-3xl">
                        {calculateTotalFinal().toLocaleString('fr-FR')}{' '}
                        <span className="text-lg font-semibold text-primary/80">MRU</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </fieldset>
          </div>

          {/* Pièces jointes : sous identification & désignations (pleine largeur) */}
          <div className="min-w-0 border-t border-border/70 bg-muted/20">
          <div className={sectionClass}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Pièces jointes
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                    PDF, Word, Excel ou images · 10 Mo max · renommer, remplacer ou supprimer à tout moment
                  </p>
                </div>
              </div>
              {(mode === 'edit' && transitId) || mode === 'create' ? (
                <span className="text-sm font-medium tabular-nums text-muted-foreground sm:mt-1">
                  {mode === 'create'
                    ? `${pendingFiles.length} fichier${pendingFiles.length !== 1 ? 's' : ''} en attente`
                    : `${documents.length} fichier${documents.length !== 1 ? 's' : ''}`}
                </span>
              ) : null}
            </div>

            <input
              ref={replaceInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={handleReplaceFile}
              disabled={!!replacingId}
            />

            {mode === 'create' ? (
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/15 px-4 py-5">
                  <input
                    ref={pendingDocInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                    onChange={handlePendingFilesChange}
                  />
                  <div className="flex flex-col gap-3 sm:flex-col sm:items-center sm:justify-between">
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {pendingFiles.length === 0
                          ? 'Aucun fichier choisi'
                          : `${pendingFiles.length} fichier${pendingFiles.length !== 1 ? 's' : ''} sélectionné${pendingFiles.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => pendingDocInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Choisir des fichiers
                    </Button>
                  </div>
                </div>
                {pendingFiles.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {pendingFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-3 py-2 text-sm"
                      >
                        <span className="truncate font-medium" title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatFileSize(file.size)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removePendingFile(index)}
                            aria-label="Retirer de la liste"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {uploadError ? (
                  <p className="text-sm text-destructive">{uploadError}</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {documents.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:gap-4">
                    {documents.map((doc) => (
                      <li
                        key={doc._id || doc.key}
                        className="group rounded-xl border border-border/80 bg-muted/10 p-4 transition-colors hover:border-primary/25 hover:bg-muted/20"
                      >
                        {doc._id && canEdit ? (
                          <div className="space-y-2 mb-3">
                            <Label className="text-xs text-muted-foreground">
                              Nom affiché
                            </Label>
                            <Input
                              className="h-10 text-sm"
                              value={doc._id ? (docNames[doc._id] ?? doc.name) : doc.name}
                              onChange={(e) =>
                                doc._id &&
                                setDocNames((prev) => ({
                                  ...prev,
                                  [doc._id!]: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                doc._id &&
                                void handleRenameDocument(
                                  doc._id,
                                  docNames[doc._id] ?? doc.name
                                )
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-sm font-medium line-clamp-2 mb-2" title={doc.name}>
                            {doc.name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mb-3">
                          {formatFileSize(doc.size)} · {formatTime(doc.uploadedAt)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="flex-1 min-w-[7rem] sm:flex-initial"
                            onClick={() => void handleDownloadDocument(doc.key)}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Télécharger
                          </Button>
                          {doc._id && canEdit && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="flex-1 min-w-[7rem] sm:flex-initial"
                                onClick={() => openReplaceDocument(doc._id!)}
                                disabled={replacingId === doc._id}
                              >
                                {replacingId === doc._id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Remplacer
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="shrink-0 text-destructive border-destructive/30"
                                onClick={() => void handleDeleteDocument(doc._id!)}
                                disabled={deletingId === doc._id}
                                aria-label="Supprimer"
                              >
                                {deletingId === doc._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : canEdit ? (
                  <div className="rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/15 px-4 py-8 text-center">
                    <FileText className="mx-auto h-9 w-9 text-muted-foreground/45 mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      Aucun fichier choisi
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
                      Utilisez le bouton ci-dessous pour joindre des fichiers au dossier transit. PDF,
                      Word, Excel ou images · 10 Mo max · renommer, remplacer ou supprimer à tout
                      moment après envoi.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6 rounded-xl bg-muted/15">
                    Aucune pièce jointe pour ce dossier.
                  </p>
                )}
                {canEdit && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading ? 'Envoi en cours…' : 'Ajouter un fichier'}
                    </Button>
                  </div>
                )}
                {uploadError && (
                  <p className="text-sm text-destructive">{uploadError}</p>
                )}
              </div>
            )}
          </div>
          </div>

          {mode === 'edit' &&
            transit &&
            !canEdit &&
            !isReadOnlyView && (
            <div
              className={`${sectionClass} border-t border-border/70 bg-muted/10 w-full`}
            >
              <p className="rounded-xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-center text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-800">
                Statut « {transit.statut} » — ce dossier n’est plus modifiable.
              </p>
            </div>
          )}
        </div>
      </form>

      <Dialog open={isAddDesignationOpen} onOpenChange={setIsAddDesignationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une désignation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-desig">Nom</Label>
              <Input
                id="new-desig"
                value={newDesignationName}
                onChange={(e) => setNewDesignationName(e.target.value)}
                placeholder="Ex. Frais de dossier"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsAddDesignationOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleAddDesignation}
              disabled={!newDesignationName.trim()}
            >
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
