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
import {
  UserRole,
  FactureStatus,
  type IFacture,
  type ICaisse,
  type ITransitClient,
} from '@/types';
import { Plus, Eye, Upload } from 'lucide-react';

interface ClientFactureSummary {
  clientId: string;
  clientNom: string;
  /** Nombre total de dépôts visibles (hors rejetés — supprimés). */
  totalOperations: number;
  /** Somme des dépôts VALIDÉS par l'agent transit (statut PAYE) — réellement en caisse. */
  totalDepot: number;
  factures: IFacture[];
}

interface CreateFactureFormData {
  clientId: string;
  banqueId: string;
  montant: string;
  justification: File | null;
}

type Row = ClientFactureSummary;

export default function CaissierFacturesClientPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [clients, setClients] = useState<ClientFactureSummary[]>([]);
  const [allClients, setAllClients] = useState<ITransitClient[]>([]);
  const [banques, setBanques] = useState<ICaisse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState<CreateFactureFormData>({
    clientId: '',
    banqueId: '',
    montant: '',
    justification: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const isCaissier =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (status !== 'loading' && user && !isCaissier) {
      void router.replace('/dashboard');
    }
  }, [status, user, isCaissier, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [facturesRes, banquesPayload, clientsPayload] = await Promise.all([
        fetch('/api/transit/factures', { credentials: 'include' }).then((r) =>
          r.json()
        ),
        fetch('/api/caisse/caisses?type=BANQUE', {
          credentials: 'include',
        }).then((r) => r.json()),
        fetch('/api/transit/clients?limit=500', { credentials: 'include' }).then((r) =>
          r.json()
        ),
      ]);

      if (clientsPayload.success) {
        setAllClients(clientsPayload.data || []);
      }

      if (facturesRes.success) {
        const factures: IFacture[] = facturesRes.data.data || [];
        const grouped = new Map<string, ClientFactureSummary>();

        factures.forEach((f) => {
          // Les dépôts rejetés sont supprimés côté serveur ; par sécurité on
          // exclut aussi tout statut REJETEE résiduel.
          if (f.statut === FactureStatus.REJETEE) return;

          const clientId = String(f.clientId || '').trim();
          const clientNom =
            String(f.transitClient || '').trim() ||
            t('dashboard.caissier.facturesClient.noClient', {
              defaultValue: 'No client',
            });
          const groupKey = clientId ? `id:${clientId}` : `nom:${clientNom.toLowerCase()}`;

          if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
              clientId,
              clientNom,
              totalOperations: 0,
              totalDepot: 0,
              factures: [],
            });
          }
          const summary = grouped.get(groupKey)!;

          if (!summary.clientId && clientId) {
            summary.clientId = clientId;
          }

          summary.totalOperations += 1;
          // Total Dépôt = uniquement les dépôts VALIDÉS par l'agent transit
          // (statut PAYE) — ceux réellement en caisse client.
          if (f.statut === FactureStatus.PAYE) {
            summary.totalDepot += Number(f.totalFinal || 0);
          }
          summary.factures.push(f);
        });

        const groupedClients = Array.from(grouped.values()).sort((a, b) =>
          a.clientNom.localeCompare(b.clientNom, 'fr', { sensitivity: 'base' })
        );
        setClients(groupedClients);
      }

      if (banquesPayload.success) {
        const banquesList = ((banquesPayload.data || []) as ICaisse[])
          .filter((b) => (b as { type?: string }).type === 'BANQUE')
          .map((b) => ({ ...b, _id: String(b._id) }));
        setBanques(banquesList);
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isCaissier) void fetchData();
  }, [isCaissier, fetchData]);

  const handleCreateFacture = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.clientId || !formData.banqueId || !formData.montant) {
      setError(t('dashboard.caissier.facturesClient.errorFormIncomplete'));
      return;
    }

    setSubmitting(true);
    try {
      // multipart/form-data — permet de joindre le justificatif du dépôt.
      const fd = new FormData();
      fd.append('clientId', formData.clientId);
      fd.append('banqueId', formData.banqueId);
      fd.append('montant', String(parseFloat(formData.montant)));
      if (formData.justification) {
        fd.append('justification', formData.justification);
      }

      const res = await fetch('/api/factures/create', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      const data = await res.json();
      if (data.success) {
        setCreateOpen(false);
        setFormData({ clientId: '', banqueId: '', montant: '', justification: null });
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

  if (!isCaissier) {
    return null;
  }

  const columns: ColumnDef<Row>[] = [
    {
      accessorKey: 'clientNom',
      header: t('dashboard.caissier.facturesClient.colClient'),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.clientNom}</div>
      ),
    },
    {
      accessorKey: 'totalOperations',
      header: t('dashboard.caissier.facturesClient.colTotalOperations'),
      cell: ({ row }) => (
        <span className="font-semibold text-blue-600">
          {row.original.totalOperations}
        </span>
      ),
    },
    {
      accessorKey: 'totalDepot',
      header: t('dashboard.caissier.facturesClient.colTotalDepot', { defaultValue: 'Total Dépôt' }),
      cell: ({ row }) => (
        <span className="text-green-600 font-medium tabular-nums">
          {row.original.totalDepot.toFixed(2)} MRU
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions') || 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={!row.original.clientId}
          onClick={() =>
            void router.push(
              `/dashboard/caissier/factures-client/${row.original.clientId}`
            )
          }
        >
          <Eye className="h-4 w-4 mr-2" />
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
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">
              {t('dashboard.caissier.facturesClient.createButton') || 'Créer facture'}
            </span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {t('dashboard.caissier.facturesClient.listTitle') || 'Liste des factures par client'}
            </CardTitle>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {clients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('dashboard.caissier.facturesClient.empty') || 'Aucune facture'}
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={clients}
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Dialog Créer Facture */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.caissier.facturesClient.createDialog.title') ||
                'Créer une facture client'}
            </DialogTitle>
            <DialogDescription>
              {t('dashboard.caissier.facturesClient.createDialog.description') ||
                'Sélectionnez un client, une banque et le montant à payer'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateFacture} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-select">
                {t('dashboard.caissier.facturesClient.formClientLabel') ||
                  'Client *'}
              </Label>
              <Select
                value={formData.clientId || undefined}
                onValueChange={(value) =>
                  setFormData({ ...formData, clientId: value })
                }
              >
                <SelectTrigger id="client-select" className="w-full">
                  <SelectValue
                    placeholder={
                      t('dashboard.caissier.facturesClient.formClientPlaceholder') ||
                      'Sélectionner un client'
                    }
                  />
                </SelectTrigger>
                <SelectContent position="popper">
                  {allClients
                    .filter((c) => c._id && c.nom && c.nom.trim())
                    .map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.nom}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="banque-select">
                {t('dashboard.caissier.facturesClient.formBanqueLabel') ||
                  'Banque *'}
              </Label>
              <Select
                value={formData.banqueId || undefined}
                onValueChange={(value) =>
                  setFormData({ ...formData, banqueId: value })
                }
              >
                <SelectTrigger id="banque-select" className="w-full">
                  <SelectValue
                    placeholder={
                      t('dashboard.caissier.facturesClient.formBanquePlaceholder') ||
                      'Sélectionner une banque'
                    }
                  />
                </SelectTrigger>
                <SelectContent position="popper">
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
                {t('dashboard.caissier.facturesClient.formMontantLabel') ||
                  'Montant (MRU) *'}
              </Label>
              <Input
                id="montant-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.montant}
                onChange={(e) =>
                  setFormData({ ...formData, montant: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="justif-input">
                {t('dashboard.caissier.facturesClient.formJustificationLabel', { defaultValue: 'Justificatif (PDF/JPG/PNG)' })}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="justif-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) =>
                    setFormData({ ...formData, justification: e.target.files?.[0] || null })
                  }
                  className="cursor-pointer"
                />
                <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              {formData.justification && (
                <p className="text-xs text-muted-foreground truncate">
                  {formData.justification.name}
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                {t('actions.cancel') || 'Annuler'}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t('actions.loading') || 'Chargement…'
                  : t('actions.create') || 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
