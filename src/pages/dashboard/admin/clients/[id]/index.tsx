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
import { UserRole, TransactionType, type ICreditCompte } from '@/types';
import { ArrowLeft, RefreshCcw, Pencil, FileDown, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

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

  const [creditComptes, setCreditComptes] = useState<ICreditCompte[]>([]);

  useEffect(() => {
    if (!id || !isAdmin) return;
    fetch(`/api/credit-compte?clientId=${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setCreditComptes(d.data as ICreditCompte[]); })
      .catch(() => {/* ignore */});
  }, [id, isAdmin]);

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

  const { client, caisse, factures, transactions } = data;
  const totalFactures = factures.reduce((s, f) => s + (f.totalFinal || 0), 0);
  const creditComptesActif = creditComptes.filter((cc) => cc.statut === 'ACTIF');
  const totalCredits = creditComptesActif.reduce((s, cc) => s + cc.montant, 0);
  const recentTx = transactions.slice(0, 10);

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
              <span className="hidden sm:inline">{t('dashboard.clients.btnImprimer')}</span>
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
          <div className="rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t('dashboard.clients.detail.fieldCaisseClient')} value={caisse?.nom || '—'} />
            <Field
              label={t('dashboard.clients.detail.fieldTotalFacture')}
              value={<span className="text-orange-600">{fmt(totalFactures)} MRU</span>}
              strong
            />
            <Field
              label="Total Crédits Compte"
              value={<span className="text-green-600">{fmt(totalCredits)} MRU</span>}
              strong
            />
            <Field
              label="Solde Net"
              value={
                <span className={caisse && caisse.solde < 0 ? 'text-red-600' : 'text-green-600'}>
                  {fmt(caisse?.solde ?? 0)} MRU
                </span>
              }
              strong
            />
          </div>

          {/* Derniers mouvements caisse */}
          {recentTx.length > 0 && (
            <div className="rounded-lg bg-white border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="text-sm font-semibold">Derniers mouvements</h3>
                <Link
                  href={`/dashboard/admin/clients/${id}/operations`}
                  className="text-xs text-primary hover:underline"
                >
                  Voir tout ({transactions.length})
                </Link>
              </div>
              <div className="divide-y">
                {recentTx.map((tx) => {
                  const isCredit = tx.type === TransactionType.CREDIT;
                  return (
                    <div key={String(tx._id)} className="px-4 py-2.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{tx.description || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span className={`font-semibold tabular-nums shrink-0 text-sm ${isCredit ? 'text-green-700' : 'text-red-600'}`}>
                        {isCredit ? '+' : '−'}{fmt(tx.montant)} MRU
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Crédits Compte */}
          {creditComptes.length > 0 && (
            <div className="rounded-lg bg-white border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-green-50">
                <h3 className="text-sm font-semibold text-green-800">Crédits Compte</h3>
              </div>
              <div className="divide-y">
                {creditComptes.map((cc) => (
                  <div key={cc._id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{cc.numero}</span>
                      <span className="text-sm truncate">{cc.reference || cc.description || '—'}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(cc.date) || '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`font-semibold tabular-nums ${cc.statut === 'ACTIF' ? 'text-green-700' : cc.statut === 'EN_ATTENTE' ? 'text-yellow-700' : 'text-red-500'}`}>
                        {fmt(cc.montant)} MRU
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        cc.statut === 'ACTIF'      ? 'bg-green-100 text-green-800' :
                        cc.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-800' :
                                                     'bg-red-100 text-red-800'
                      }`}>
                        {cc.statut === 'ACTIF' ? 'Validé' : cc.statut === 'EN_ATTENTE' ? 'En attente' : 'Annulé'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageContent>

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.clients.printDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('dashboard.clients.printDialog.hint')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pdf-debut">{t('dashboard.clients.printDialog.labelDateDebut')}</Label>
                <Input
                  id="pdf-debut"
                  type="date"
                  value={pdfDateDebut}
                  onChange={(e) => setPdfDateDebut(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdf-fin">{t('dashboard.clients.printDialog.labelDateFin')}</Label>
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
              {t('actions.cancel')}
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
              {t('dashboard.clients.btnImprimer')}
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
