import React, { useEffect, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminClientCombobox } from '@/components/dashboard/admin/clients/AdminClientCombobox';
import { isAdminTransit } from '@/lib/roles';
import { UserRole } from '@/types';
import { ArrowLeft, FileText, Upload, X } from 'lucide-react';

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ClientOption {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
}

export default function AdminCreateManutention() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [bl, setBl] = useState('');
  const [numeroConteneur, setNumeroConteneur] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(
    null
  );
  const [objet, setObjet] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = isAdminTransit(user?.role);
  const canAccess = isAdmin || user?.role === UserRole.AGENT_TRANSIT;

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!bl.trim()) return setError(t('dashboard.manutention.create.errorBlRequired'));
    if (!clientId) return setError(t('dashboard.manutention.create.errorClientRequired'));
    if (!objet.trim()) return setError(t('dashboard.manutention.create.errorObjetRequired'));
    if (!selectedDocument) {
      return setError(
        t('dashboard.manutention.create.errorDocumentRequired', {
          defaultValue: 'Le document justificatif est obligatoire',
        })
      );
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/manutention', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bl: bl.trim(),
          client: selectedClient?.nom || '',
          clientId,
          objet: objet.trim(),
          numeroConteneur: numeroConteneur.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(
          data.error || t('dashboard.manutention.create.errorCreateFailed')
        );
        return;
      }
      const rawId = (data?.data?._id ?? data?.data?.id) as unknown;
      const createdFactureId =
        typeof rawId === 'string'
          ? rawId.trim()
          : rawId
            ? String(rawId).trim()
            : '';
      console.log('[manutention create] response data:', data?.data);
      console.log('[manutention create] resolved id:', createdFactureId);
      if (!createdFactureId) {
        setError(
          'Manutention créée mais ID manquant côté serveur. Recharge la liste pour la retrouver.'
        );
        return;
      }

      // Upload du justificatif via URL S3 présignée (contourne la limite
      // Vercel 4,5 Mo : le fichier va direct au bucket, pas via la fonction).
      // Étapes : presign → PUT S3 → register (clé enregistrée en base).
      try {
        const presignRes = await fetch(
          `/api/manutention/documents/${createdFactureId}/presign-upload`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: selectedDocument.name,
              contentType:
                selectedDocument.type || 'application/octet-stream',
            }),
          }
        );
        const presignData = await presignRes.json().catch(() => null);
        if (!presignRes.ok || !presignData?.success) {
          throw new Error(
            presignData?.error || `Presign échoué (${presignRes.status})`
          );
        }
        const { uploadUrl, key, headers } = presignData.data as {
          uploadUrl: string;
          key: string;
          headers: Record<string, string>;
        };

        let putRes: Response;
        try {
          putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers,
            body: selectedDocument,
          });
        } catch (netErr) {
          // Erreur réseau (CORS bloqué, DNS, offline, etc.)
          console.error('[manutention upload] PUT S3 network error:', netErr);
          throw new Error(
            'Connexion S3 bloquée (probable CORS du bucket). Vérifie la configuration CORS de DigitalOcean Spaces.'
          );
        }
        if (!putRes.ok) {
          let s3body = '';
          try {
            s3body = await putRes.text();
          } catch {
            /* ignore */
          }
          console.error('[manutention upload] S3 PUT failed', {
            status: putRes.status,
            body: s3body,
          });
          throw new Error(
            `Upload S3 échoué (${putRes.status}). ${s3body.slice(0, 200)}`
          );
        }

        const registerRes = await fetch(
          `/api/manutention/documents/${createdFactureId}/register`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              name: selectedDocument.name,
              size: selectedDocument.size,
            }),
          }
        );
        const registerData = await registerRes.json().catch(() => null);
        if (!registerRes.ok || !registerData?.success) {
          throw new Error(
            registerData?.error ||
              `Enregistrement échoué (${registerRes.status})`
          );
        }
      } catch (uploadErr) {
        // Rollback : supprime la facture pour ne pas laisser de dossier
        // sans justificatif obligatoire.
        try {
          await fetch(`/api/manutention/${createdFactureId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        } catch {
          /* ignore cleanup error */
        }
        setError(
          uploadErr instanceof Error
            ? `Document : ${uploadErr.message}`
            : 'Échec de l\'upload du justificatif'
        );
        return;
      }

      if (data.data?.transitId) {
        void router.push(`/dashboard/transit/${data.data.transitId}`);
      } else {
        void router.push('/dashboard/admin/manutention');
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedDocument(null);
      return;
    }

    if (file.size > MAX_DOCUMENT_SIZE) {
      setSelectedDocument(null);
      setError(t('dashboard.manutention.create.errorDocumentTooLarge'));
      e.target.value = '';
      return;
    }

    setError(null);
    setSelectedDocument(file);
  };

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.manutention.newTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!canAccess) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.manutention.newTitle')} />
        <PageContent>
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.manutention.newTitle')}
        subtitle={t('dashboard.manutention.newSubtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/manutention">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.back')}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.manutention.infoCard')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client">
                    {t('dashboard.manutention.create.fieldClient')} <span className="text-destructive">*</span>
                  </Label>
                  <AdminClientCombobox
                    valueId={clientId}
                    onChange={(id, c) => {
                      setClientId(id);
                      setSelectedClient(c);
                    }}
                    placeholder={t('dashboard.manutention.create.clientPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl">{t('dashboard.manutention.create.fieldBl')}</Label>
                  <Input
                    id="bl"
                    value={bl}
                    onChange={(e) => setBl(e.target.value.toUpperCase())}
                    placeholder={t('dashboard.manutention.create.blPlaceholder')}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numeroConteneur">
                    Numéro Conteneur <span className="text-xs text-muted-foreground">(optionnel)</span>
                  </Label>
                  <Input
                    id="numeroConteneur"
                    value={numeroConteneur}
                    onChange={(e) => setNumeroConteneur(e.target.value.toUpperCase())}
                    placeholder="ex: MSCU1234567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="objet">{t('dashboard.manutention.create.fieldObjet')}</Label>
                  <Textarea
                    id="objet"
                    value={objet}
                    onChange={(e) => setObjet(e.target.value)}
                    placeholder={t('dashboard.manutention.create.objetPlaceholder')}
                    rows={2}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="document">
                      {t('dashboard.manutention.create.documentTitle')} *
                    </Label>
                    <span className="text-xs font-medium text-red-600">
                      {t('dashboard.manutention.create.documentRequiredTag', {
                        defaultValue: 'Obligatoire',
                      })}
                    </span>
                  </div>

                  <label
                    htmlFor="document"
                    className={
                      selectedDocument
                        ? 'group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-muted/40'
                        : 'group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-red-300 bg-red-50/40 p-4 transition-colors hover:border-red-500 hover:bg-red-50'
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-md border bg-background p-2 text-muted-foreground group-hover:text-primary transition-colors">
                        <Upload className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {t('dashboard.manutention.create.documentDropzone')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('dashboard.manutention.create.documentHint')}
                        </p>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm">
                      {t('dashboard.manutention.create.documentSelectBtn')}
                    </Button>
                  </label>

                  <Input
                    id="document"
                    type="file"
                    className="sr-only"
                    onChange={handleDocumentChange}
                    disabled={submitting}
                    ref={documentInputRef}
                  />

                  {selectedDocument && (
                    <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{selectedDocument.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('dashboard.manutention.create.documentSelected')} · {formatFileSize(selectedDocument.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedDocument(null);
                          if (documentInputRef.current) {
                            documentInputRef.current.value = '';
                          }
                        }}
                        aria-label={t('dashboard.manutention.create.documentRemove')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('dashboard.manutention.create.hint')}
                </p>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/admin/manutention">{t('dashboard.manutention.create.cancelBtn')}</Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !selectedDocument}
                    title={
                      !selectedDocument
                        ? t('dashboard.manutention.create.errorDocumentRequired', {
                            defaultValue: 'Le document justificatif est obligatoire',
                          })
                        : undefined
                    }
                  >
                    {submitting
                      ? selectedDocument
                        ? t('dashboard.manutention.create.documentUploading')
                        : t('dashboard.manutention.create.submittingBtn')
                      : t('dashboard.manutention.create.submitBtn')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
