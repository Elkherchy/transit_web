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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClientSubNav } from '@/components/dashboard/admin/clients/ClientSubNav';
import { useClientDetail } from '@/components/dashboard/admin/clients/useClientDetail';
import { isAdminTransit } from '@/lib/roles';
import { UserRole } from '@/types';
import { ArrowLeft, RefreshCcw, Pencil, FileDown, Loader2 } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function AdminClientDetails() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAdmin =
    isAdminTransit(user?.role) || user?.role === UserRole.AGENT_TRANSIT;
  const id = String(router.query.id || '');

  useEffect(() => {
    if (status !== 'loading' && user && !isAdmin) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAdmin, router]);

  const { data, loading, error, reload } = useClientDetail(id, isAdmin);

  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfDateDebut, setPdfDateDebut] = useState<string>('');
  const [pdfDateFin, setPdfDateFin] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePrint = useCallback(async () => {
    if (!id || typeof window === 'undefined') return;
    setPdfLoading(true);
    try {
      const params = new URLSearchParams();
      if (pdfDateDebut) params.set('dateDebut', pdfDateDebut);
      if (pdfDateFin) params.set('dateFin', pdfDateFin);
      const qs = params.toString();
      const url = `/api/admin/clients/${encodeURIComponent(id)}/pdf${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!res.ok) return;
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const cd = res.headers.get('Content-Disposition');
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `operations-client-${id}.pdf`;
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
      setPdfDialogOpen(false);
    } finally {
      setPdfLoading(false);
    }
  }, [id, pdfDateDebut, pdfDateFin]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.clients.loadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;

  if (error || !data) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.clients.loadingTitle')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin/clients">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('dashboard.transit.list')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>{error || t('dashboard.clients.detail.errorFallback')}</AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  const { client, caisse, factures } = data;
  const totalFactures = factures.reduce((s, f) => s + (f.totalFinal || 0), 0);

  return (
    <DashboardLayout>
      <PageHeader
        title={client.nom}
        subtitle={t('dashboard.clients.detailSubtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/clients">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('dashboard.transit.list')}
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
              <span className="hidden sm:inline">{t('actions.refresh')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPdfDateDebut('');
                setPdfDateFin('');
                setPdfDialogOpen(true);
              }}
              disabled={pdfLoading}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <FileDown className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Imprimer</span>
            </Button>
            <Button asChild size="sm" className={isMobile ? 'h-10 px-3' : ''}>
              <Link href={`/dashboard/admin/clients/${id}/modifier`}>
                <Pencil className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('actions.edit')}</span>
              </Link>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          <ClientSubNav clientId={id} />

          {/* Info client */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('dashboard.clients.detail.fieldNom')} value={client.nom} strong />
            <Field
              label={t('dashboard.clients.detail.fieldStatut')}
              value={
                <Badge variant={client.actif ? 'default' : 'secondary'}>
                  {client.actif ? t('dashboard.clients.detail.statutActif') : t('dashboard.clients.detail.statutInactif')}
                </Badge>
              }
            />
            <Field label={t('dashboard.clients.detail.fieldTelephone')} value={client.telephone || '—'} />
            <Field label={t('dashboard.clients.detail.fieldEmail')} value={client.email || '—'} />
            <Field
              label={t('dashboard.clients.detail.fieldCreatedAt')}
              value={
                client.createdAt
                  ? new Date(client.createdAt).toLocaleString('fr-FR')
                  : '—'
              }
            />
            <Field
              label={t('dashboard.clients.detail.fieldUpdatedAt')}
              value={
                client.updatedAt
                  ? new Date(client.updatedAt).toLocaleString('fr-FR')
                  : '—'
              }
            />
          </div>

          {/* Récap caisse */}
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t('dashboard.clients.detail.fieldCaisseClient')} value={caisse?.nom || '—'} />
            <Field
              label={t('dashboard.clients.detail.fieldSoldeCaisse')}
              value={`${fmt(caisse?.solde ?? 0)} MRU`}
              strong
            />
            <Field
              label={t('dashboard.clients.detail.fieldTotalFacture')}
              value={`${fmt(totalFactures)} MRU`}
              strong
            />
          </div>
        </div>
      </PageContent>

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimer le relevé d&apos;opérations</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sélectionne une période (optionnel). Laisse vide pour imprimer
              toutes les opérations du client.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pdf-debut">Date début</Label>
                <Input
                  id="pdf-debut"
                  type="date"
                  value={pdfDateDebut}
                  onChange={(e) => setPdfDateDebut(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdf-fin">Date fin</Label>
                <Input
                  id="pdf-fin"
                  type="date"
                  value={pdfDateFin}
                  onChange={(e) => setPdfDateFin(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pdfLoading}
              onClick={() => setPdfDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              disabled={pdfLoading}
              onClick={() => void handlePrint()}
            >
              {pdfLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Imprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={strong ? 'text-lg font-semibold tabular-nums' : 'text-sm'}>
        {value}
      </div>
    </div>
  );
}
