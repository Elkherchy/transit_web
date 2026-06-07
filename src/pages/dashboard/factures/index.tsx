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
import { UserRole, type IFacture, type ICaisse } from '@/types';
import { Plus, Eye } from 'lucide-react';

interface ClientFactureSummary {
  clientId: string;
  clientNom: string;
  totalOperations: number;
  totalDebit: number;
  totalCredit: number;
}

interface CreateFactureFormData {
  clientId: string;
  banqueId: string;
  montant: string;
}

type Row = ClientFactureSummary;

export default function FacturesClientList() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [clients, setClients] = useState<ClientFactureSummary[]>([]);
  const [banques, setBanques] = useState<ICaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState<CreateFactureFormData>({
    clientId: '',
    banqueId: '',
    montant: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;

  const canCreateFacture =
    user?.role === UserRole.ADMIN || user?.role === UserRole.ADMIN_TRANSIT;

  useEffect(() => {
    if (user?.role === UserRole.CAISSIER) {
      void router.replace('/dashboard/caissier/factures-client');
      return;
    }
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [facturesRes, banquesRes] = await Promise.all([
        fetch('/api/transit/factures', { credentials: 'include' }).then((r) =>
          r.json()
        ),
        fetch('/api/caisse/caisses', {
          credentials: 'include',
        }).then((r) => r.json()),
      ]);

      if (facturesRes.success) {
        const factures: IFacture[] = facturesRes.data.data || [];
        const grouped = new Map<string, ClientFactureSummary>();

        factures.forEach((f) => {
          const clientId = String(f.clientId || '').trim();
          if (!clientId) return;

          const clientNom = f.transitClient || 'Inconnu';
          if (!grouped.has(clientId)) {
            grouped.set(clientId, {
              clientId,
              clientNom,
              totalOperations: 0,
              totalDebit: 0,
              totalCredit: 0,
            });
          }
          const summary = grouped.get(clientId)!;
          summary.totalOperations += 1;
          summary.totalDebit += f.montantPaye || 0;
          summary.totalCredit += Math.max(
            0,
            (f.totalFinal || 0) - (f.montantPaye || 0)
          );
        });

        setClients(Array.from(grouped.values()));
      }

      if (banquesRes.success) {
        const banquesList = (banquesRes.data || [])
          .filter((b: any) => b.type === 'BANQUE')
          .map((b: any) => ({
            ...b,
            _id: String(b._id),
          }));
        setBanques(banquesList);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAllowed) void fetchData();
  }, [isAllowed, fetchData]);

  const handleCreateFacture = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.clientId || !formData.banqueId || !formData.montant) {
      setError(t('dashboard.caissier.facturesClient.errorFormIncomplete'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/factures/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          clientId: formData.clientId,
          banqueId: formData.banqueId,
          montant: parseFloat(formData.montant),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreateOpen(false);
        setFormData({ clientId: '', banqueId: '', montant: '' });
        void fetchData();
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageSkeleton />
      </DashboardLayout>
    );
  }

  if (!isAllowed) {
    return null;
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'clientNom',
      header: t('dashboard.caissier.facturesClient.colClient'),
      cell: ({ row }) => <div className="font-medium">{row.original.clientNom}</div>,
    },
    {
      accessorKey: 'totalOperations',
      header: t('dashboard.caissier.facturesClient.colTotalOperations'),
      cell: ({ row }) => (
        <span className="font-semibold text-blue-600">{row.original.totalOperations}</span>
      ),
    },
    {
      accessorKey: 'totalDebit',
      header: t('dashboard.caissier.facturesClient.colTotalDebit'),
      cell: ({ row }) => (
        <span className="font-medium text-green-600">{row.original.totalDebit.toFixed(2)} MRU</span>
      ),
    },
    {
      accessorKey: 'totalCredit',
      header: t('dashboard.caissier.facturesClient.colTotalCredit'),
      cell: ({ row }) => (
        <span className="font-medium text-orange-600">{row.original.totalCredit.toFixed(2)} MRU</span>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions') || 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void router.push(`/dashboard/factures/client/${row.original.clientId}`)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {t('dashboard.caissier.facturesClient.actionView') || t('common.view') || 'Voir'}
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.facturesClient.title') || 'Factures Clients'}
        actions={
          canCreateFacture ? (
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t('dashboard.caissier.facturesClient.createButton') || 'Créer facture'}
              </span>
            </Button>
          ) : undefined
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {t('dashboard.caissier.facturesClient.listTitle') || 'Liste des factures par client'}
            </CardTitle>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {clients.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('dashboard.caissier.facturesClient.empty') || 'Aucune facture'}
              </div>
            ) : (
              <DataTable columns={columns} data={clients} />
            )}
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.caissier.facturesClient.createDialog.title') || 'Créer une facture client'}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.caissier.facturesClient.createDialog.description') ||
                'Sélectionnez un client, une banque et le montant à payer'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFacture} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-select">
                {t('dashboard.caissier.facturesClient.formClientLabel') || 'Client *'}
              </Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => setFormData({ ...formData, clientId: value })}
              >
                <SelectTrigger id="client-select">
                  <SelectValue
                    placeholder={
                      t('dashboard.caissier.facturesClient.formClientPlaceholder') ||
                      'Sélectionner un client'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((c) => c.clientId && c.clientId.trim())
                    .map((c) => (
                      <SelectItem key={c.clientId} value={c.clientId}>
                        {c.clientNom}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="banque-select">
                {t('dashboard.caissier.facturesClient.formBanqueLabel') || 'Banque *'}
              </Label>
              <Select
                value={formData.banqueId}
                onValueChange={(value) => setFormData({ ...formData, banqueId: value })}
              >
                <SelectTrigger id="banque-select">
                  <SelectValue
                    placeholder={
                      t('dashboard.caissier.facturesClient.formBanquePlaceholder') ||
                      'Sélectionner une banque'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {banques
                    .filter((b) => b._id && String(b._id).trim())
                    .map((b) => (
                      <SelectItem key={b._id} value={String(b._id)}>
                        {b.nom || String((b as unknown as { libelle?: string }).libelle || b._id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="montant-input">
                {t('dashboard.caissier.facturesClient.formMontantLabel') || 'Montant (MRU) *'}
              </Label>
              <Input
                id="montant-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.montant}
                onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                {t('actions.cancel') || 'Annuler'}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('actions.loading') || 'Chargement…' : t('actions.create') || 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
