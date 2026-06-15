import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { UserRole, type ICreditCompte, type ITransitClient } from '@/types';
import { Plus, Printer, Download, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import {
  buildCreditComptePdfModel,
  downloadCreditComptePdf,
  printCreditComptePdf,
} from '@/components/factures/credit-compte-pdf';
import { formatCurrency, formatDate } from '@/lib/utils';

interface FormData {
  clientId: string;
  montant: string;
  reference: string;
  description: string;
}

export default function CreditComptePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const isAdmin        = user?.role === UserRole.ADMIN || user?.role === UserRole.ADMIN_TRANSIT;
  const isAgentTransit = user?.role === UserRole.AGENT_TRANSIT;
  const canCreate      = isAdmin || isAgentTransit;
  const isAllowed      = canCreate || user?.role === UserRole.COMPTABLE;

  const [docs, setDocs]               = useState<ICreditCompte[]>([]);
  const [clients, setClients]         = useState<ITransitClient[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [form, setForm]               = useState<FormData>({ clientId: '', montant: '', reference: '', description: '' });
  const [submitting, setSubmitting]   = useState(false);
  const [actionId, setActionId]       = useState<string | null>(null);
  const [printingId, setPrintingId]   = useState<string | null>(null);
  const [dlId, setDlId]               = useState<string | null>(null);

  const T = (key: string, opts?: Record<string, unknown>) =>
    t(`dashboard.factures.creditCompte.${key}`, opts as Record<string, unknown>);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/credit-compte', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setDocs(data.data as ICreditCompte[]);
      else setError(data.error || T('errorNetwork'));
    } catch {
      setError(T('errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchClients = useCallback(async () => {
    try {
      const res  = await fetch('/api/transit/clients?limit=500', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setClients(data.data as ITransitClient[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isAllowed) {
      void fetchDocs();
      if (canCreate) void fetchClients();
    }
  }, [isAllowed, canCreate, fetchDocs, fetchClients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.clientId || !form.montant || parseFloat(form.montant) <= 0) {
      setError(T('errorClientMontant'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/credit-compte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId:    form.clientId,
          montant:     parseFloat(form.montant),
          reference:   form.reference.trim() || undefined,
          description: form.description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateOpen(false);
        setForm({ clientId: '', montant: '', reference: '', description: '' });
        void fetchDocs();
      } else {
        setError(data.error || T('errorNetwork'));
      }
    } catch {
      setError(T('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidation = async (doc: ICreditCompte, action: 'valider' | 'rejeter') => {
    setActionId(doc._id);
    try {
      const res  = await fetch(`/api/credit-compte/${doc._id}/valider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setDocs((prev) =>
          prev.map((d) => (d._id === doc._id ? (data.data as ICreditCompte) : d))
        );
      }
    } catch { /* ignore */ }
    finally { setActionId(null); }
  };

  const handlePrint = async (doc: ICreditCompte) => {
    setPrintingId(doc._id);
    try {
      const model = buildCreditComptePdfModel({
        numero:      doc.numero,
        clientNom:   doc.clientNom,
        montant:     doc.montant,
        date:        formatDate(doc.date) || '',
        reference:   doc.reference,
        description: doc.description,
      });
      await printCreditComptePdf(model, window.location.origin);
    } finally { setPrintingId(null); }
  };

  const handleDownload = async (doc: ICreditCompte) => {
    setDlId(doc._id);
    try {
      const model = buildCreditComptePdfModel({
        numero:      doc.numero,
        clientNom:   doc.clientNom,
        montant:     doc.montant,
        date:        formatDate(doc.date) || '',
        reference:   doc.reference,
        description: doc.description,
      });
      await downloadCreditComptePdf(model, window.location.origin);
    } finally { setDlId(null); }
  };

  if (status === 'loading' || loading) {
    return <DashboardLayout><PageSkeleton /></DashboardLayout>;
  }
  if (!isAllowed) return null;

  const pendingCount = docs.filter((d) => d.statut === 'EN_ATTENTE').length;

  const statutLabels: Record<string, string> = {
    EN_ATTENTE: T('statutEnAttente'),
    ACTIF:      T('statutActif'),
    ANNULE:     T('statutAnnule'),
  };
  const statutClasses: Record<string, string> = {
    EN_ATTENTE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    ACTIF:      'bg-green-100 text-green-800 border-green-200',
    ANNULE:     'bg-red-100 text-red-800 border-red-200',
  };

  const columns: ColumnDef<ICreditCompte>[] = [
    {
      accessorKey: 'numero',
      header: T('colNumero'),
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">{row.original.numero}</span>
      ),
    },
    {
      accessorKey: 'clientNom',
      header: T('colClient'),
      cell: ({ row }) => <span className="font-medium">{row.original.clientNom}</span>,
    },
    {
      accessorKey: 'montant',
      header: T('colMontant'),
      cell: ({ row }) => (
        <span className="font-bold text-green-700">{formatCurrency(row.original.montant)}</span>
      ),
    },
    {
      accessorKey: 'date',
      header: T('colDate'),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{formatDate(row.original.date) || '—'}</span>
      ),
    },
    {
      accessorKey: 'reference',
      header: T('colReference'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.reference || '—'}</span>
      ),
    },
    {
      accessorKey: 'statut',
      header: T('colStatut'),
      cell: ({ row }) => (
        <Badge
          className={statutClasses[row.original.statut] ?? statutClasses['EN_ATTENTE']}
          variant="outline"
        >
          {statutLabels[row.original.statut] ?? row.original.statut}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: T('colActions'),
      cell: ({ row }) => {
        const doc  = row.original;
        const busy = actionId === doc._id;
        return (
          <div className="flex items-center gap-1">
            {isAdmin && doc.statut === 'EN_ATTENTE' && (
              <>
                <Button
                  variant="ghost" size="sm"
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  disabled={busy}
                  title={T('tooltipValider')}
                  onClick={() => void handleValidation(doc, 'valider')}
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  disabled={busy}
                  title={T('tooltipRejeter')}
                  onClick={() => void handleValidation(doc, 'rejeter')}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost" size="sm"
              disabled={printingId === doc._id}
              title={T('tooltipPrint')}
              onClick={() => void handlePrint(doc)}
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              disabled={dlId === doc._id}
              title={T('tooltipDownload')}
              onClick={() => void handleDownload(doc)}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title={T('title')}
        backButton={
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/dashboard/factures">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {T('backToFactures')}
            </Link>
          </Button>
        }
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{T('newButton')}</span>
            </Button>
          ) : undefined
        }
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isAdmin && pendingCount > 0 && (
          <Alert className="mb-4 border-yellow-200 bg-yellow-50 text-yellow-800">
            <AlertDescription>
              {t('dashboard.factures.creditCompte.pendingAlert', { count: pendingCount })}
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">{T('listTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {docs.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">{T('empty')}</div>
            ) : (
              <DataTable columns={columns} data={docs} />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{T('createDialog.title')}</DialogTitle>
            <DialogDescription>
              {isAgentTransit ? T('createDialog.descAgent') : T('createDialog.descAdmin')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-client">{T('createDialog.clientLabel')}</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
              >
                <SelectTrigger id="cc-client">
                  <SelectValue placeholder={T('createDialog.clientPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-montant">{T('createDialog.montantLabel')}</Label>
              <Input
                id="cc-montant"
                type="number" step="0.01" min="0" placeholder="0.00"
                value={form.montant}
                onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-ref">{T('createDialog.referenceLabel')}</Label>
              <Input
                id="cc-ref"
                placeholder={T('createDialog.referencePlaceholder')}
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-desc">{T('createDialog.descriptionLabel')}</Label>
              <Input
                id="cc-desc"
                placeholder={T('createDialog.descriptionPlaceholder')}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button" variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                {T('createDialog.cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? T('createDialog.submitting')
                  : isAgentTransit
                    ? T('createDialog.submitAgent')
                    : T('createDialog.submitAdmin')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
