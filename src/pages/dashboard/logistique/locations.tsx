import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageContent,
  EmptyState,
  PageSkeleton,
  SearchInput,
  MobilePagination,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  LocationStatut,
  LocationType,
  type ILocationResponse,
  type IVehiculeResponse,
  UserRole,
  VehiculeCategorie,
} from '@/types';
import { Plus, Truck, Boxes, Pencil, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type { TFunction } from 'i18next';

type VehiculeOption = Pick<IVehiculeResponse, '_id' | 'matricule'>;

function getTypeLabels(t: TFunction): Record<LocationType, string> {
  return {
    [LocationType.VEHICULE_INTERNE]: t('dashboard.logistique.locations.typeVehiculeInterne'),
    [LocationType.VEHICULE_CLIENT]: t('dashboard.logistique.locations.typeVehiculeClient'),
    [LocationType.CONTENEUR]: t('dashboard.logistique.locations.typeConteneur'),
  };
}

function statutBadge(statut: LocationStatut, t: TFunction) {
  if (statut === LocationStatut.ACTIVE) return <Badge className="bg-emerald-600">{t('dashboard.logistique.statuses.location.ACTIVE')}</Badge>;
  if (statut === LocationStatut.TERMINEE) return <Badge className="bg-blue-600">{t('dashboard.logistique.statuses.location.TERMINEE')}</Badge>;
  if (statut === LocationStatut.ANNULEE) return <Badge variant="destructive">{t('dashboard.logistique.statuses.location.ANNULEE')}</Badge>;
  return <Badge variant="secondary">{t('dashboard.logistique.statuses.location.BROUILLON')}</Badge>;
}

export default function LogistiqueLocationsPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<ILocationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ILocationResponse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [vehiculesInterne, setVehiculesInterne] = useState<VehiculeOption[]>([]);

  const [formType, setFormType] = useState<LocationType>(LocationType.VEHICULE_INTERNE);
  const [formClientNom, setFormClientNom] = useState('');
  const [formVehiculeInterneId, setFormVehiculeInterneId] = useState('');
  const [formVehiculeMatricule, setFormVehiculeMatricule] = useState('');
  const [formConteneurNumero, setFormConteneurNumero] = useState('');
  const [formDateDebut, setFormDateDebut] = useState('');
  const [formDateFin, setFormDateFin] = useState('');
  const [formMontantJournalier, setFormMontantJournalier] = useState('0');
  const [formNote, setFormNote] = useState('');

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.ADMIN_LOGISTIQUE || userRole === UserRole.COMPTABLE;
  const limit = isMobile ? 8 : 15;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, isAllowed, router]);

  const fetchRows = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/logistique/locations?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || t('dashboard.logistique.locations.errLoadFailed'));
        setRows([]);
        return;
      }

      setRows(json.data?.data || []);
      setTotalPages(json.data?.totalPages || 1);
      setTotalItems(json.data?.total || 0);
    } catch {
      setError(t('common.errorNetwork'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isAllowed, page, limit, search, t]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!isAllowed) return;

    const fetchVehiculesInterne = async () => {
      try {
        const params = new URLSearchParams({ page: '1', limit: '100', _ts: String(Date.now()) });
        params.set('categorie', VehiculeCategorie.INTERNE);
        const res = await fetch(`/api/logistique/vehicules?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json();
        if (!json.success) return;
        const options = (json.data?.data || []).map((v: IVehiculeResponse) => ({
          _id: v._id,
          matricule: v.matricule,
        }));
        setVehiculesInterne(options);
      } catch {
        setVehiculesInterne([]);
      }
    };

    void fetchVehiculesInterne();
  }, [isAllowed]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormType(LocationType.VEHICULE_INTERNE);
    setFormClientNom('');
    setFormVehiculeInterneId('');
    setFormVehiculeMatricule('');
    setFormConteneurNumero('');
    setFormDateDebut(new Date().toISOString().slice(0, 10));
    setFormDateFin('');
    setFormMontantJournalier('0');
    setFormNote('');
    setDialogOpen(true);
    setError(null);
  }, []);

  const openEdit = useCallback((row: ILocationResponse) => {
    setEditing(row);
    setFormType(row.type);
    setFormClientNom(row.clientNom || '');
    setFormVehiculeInterneId(row.vehiculeInterneId || '');
    setFormVehiculeMatricule(row.vehiculeClientMatricule || '');
    setFormConteneurNumero(row.conteneurNumero || '');
    setFormDateDebut(row.dateDebut ? new Date(row.dateDebut).toISOString().slice(0, 10) : '');
    setFormDateFin(row.dateFin ? new Date(row.dateFin).toISOString().slice(0, 10) : '');
    setFormMontantJournalier(String(row.montantJournalier ?? 0));
    setFormNote(row.note || '');
    setDialogOpen(true);
    setError(null);
  }, []);

  const submitForm = useCallback(async () => {
    setError(null);

    const payload = {
      type: formType,
      clientNom: formClientNom.trim(),
      vehiculeInterneId: formVehiculeInterneId || undefined,
      vehiculeClientMatricule: formVehiculeMatricule.trim().toUpperCase(),
      conteneurNumero: formConteneurNumero.trim().toUpperCase(),
      dateDebut: formDateDebut,
      dateFin: formDateFin || undefined,
      montantJournalier: Number(formMontantJournalier || 0),
      note: formNote.trim() || undefined,
    };

    if (!payload.clientNom) {
      setError(t('dashboard.logistique.locations.errClientRequired'));
      return;
    }

    if (!payload.dateDebut) {
      setError(t('dashboard.logistique.locations.errDateDebutRequired'));
      return;
    }

    if (formType === LocationType.VEHICULE_INTERNE && !payload.vehiculeInterneId) {
      setError(t('dashboard.logistique.locations.errVehiculeInterneRequired'));
      return;
    }

    if (formType === LocationType.VEHICULE_CLIENT && !payload.vehiculeClientMatricule) {
      setError(t('dashboard.logistique.locations.errVehiculeClientRequired'));
      return;
    }

    if (formType === LocationType.CONTENEUR && !payload.conteneurNumero) {
      setError(t('dashboard.logistique.locations.errConteneurRequired'));
      return;
    }

    try {
      const url = editing ? `/api/logistique/locations/${editing._id}` : '/api/logistique/locations';
      const method = editing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.logistique.locations.errOperationRefused'));
        return;
      }

      setDialogOpen(false);
      void fetchRows();
    } catch {
      setError(t('common.errorNetwork'));
    }
  }, [
    editing,
    fetchRows,
    formClientNom,
    formConteneurNumero,
    formDateDebut,
    formDateFin,
    formMontantJournalier,
    formNote,
    formType,
    formVehiculeInterneId,
    formVehiculeMatricule,
    t,
  ]);

  const removeRow = useCallback(
    async (row: ILocationResponse) => {
      setDeletingId(row._id);
      setError(null);
      try {
        const res = await fetch(`/api/logistique/locations/${row._id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error || t('dashboard.logistique.locations.errDeleteRefused'));
          return;
        }
        void fetchRows();
      } catch {
        setError(t('common.errorNetwork'));
      } finally {
        setDeletingId(null);
      }
    },
    [fetchRows, t]
  );

  const totalMontantEstime = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.totalEstime || 0), 0),
    [rows]
  );

  if (status === 'loading' || (status === 'authenticated' && !isAllowed)) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.locations.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  const formFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>{t('dashboard.logistique.locations.fieldType')}</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            type="button"
            variant={formType === LocationType.VEHICULE_INTERNE ? 'default' : 'outline'}
            onClick={() => setFormType(LocationType.VEHICULE_INTERNE)}
          >
            <Truck className="mr-2 h-4 w-4" />
            {t('dashboard.logistique.locations.typeVehiculeInterne')}
          </Button>
          <Button
            type="button"
            variant={formType === LocationType.VEHICULE_CLIENT ? 'default' : 'outline'}
            onClick={() => setFormType(LocationType.VEHICULE_CLIENT)}
          >
            <Truck className="mr-2 h-4 w-4" />
            {t('dashboard.logistique.locations.typeVehiculeClient')}
          </Button>
          <Button
            type="button"
            variant={formType === LocationType.CONTENEUR ? 'default' : 'outline'}
            onClick={() => setFormType(LocationType.CONTENEUR)}
          >
            <Boxes className="mr-2 h-4 w-4" />
            {t('dashboard.logistique.locations.typeConteneur')}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="clientNom">{t('dashboard.logistique.locations.fieldClient')}</Label>
        <Input
          id="clientNom"
          value={formClientNom}
          onChange={(e) => setFormClientNom(e.target.value)}
          placeholder={t('dashboard.logistique.locations.fieldClientPlaceholder')}
        />
      </div>

      {formType === LocationType.VEHICULE_INTERNE ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="vehiculeInterne">{t('dashboard.logistique.locations.fieldVehiculeInterne')}</Label>
          <select
            id="vehiculeInterne"
            value={formVehiculeInterneId}
            onChange={(e) => setFormVehiculeInterneId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('dashboard.logistique.locations.fieldVehiculePlaceholder')}</option>
            {vehiculesInterne.map((v) => (
              <option key={v._id} value={v._id}>
                {v.matricule}
              </option>
            ))}
          </select>
        </div>
      ) : formType === LocationType.VEHICULE_CLIENT ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="vehiculeClientMatricule">{t('dashboard.logistique.locations.fieldVehiculeClient')}</Label>
          <Input
            id="vehiculeClientMatricule"
            value={formVehiculeMatricule}
            onChange={(e) => setFormVehiculeMatricule(e.target.value.toUpperCase())}
            placeholder={t('dashboard.logistique.locations.fieldVehiculeClientPlaceholder')}
            className="font-mono"
          />
        </div>
      ) : (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="conteneurNumero">{t('dashboard.logistique.locations.fieldConteneur')}</Label>
          <Input
            id="conteneurNumero"
            value={formConteneurNumero}
            onChange={(e) => setFormConteneurNumero(e.target.value.toUpperCase())}
            placeholder={t('dashboard.logistique.locations.fieldConteneurPlaceholder')}
            className="font-mono"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="dateDebut">{t('dashboard.logistique.locations.fieldDateDebut')}</Label>
        <Input
          id="dateDebut"
          type="date"
          value={formDateDebut}
          onChange={(e) => setFormDateDebut(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dateFin">{t('dashboard.logistique.locations.fieldDateFin')}</Label>
        <Input
          id="dateFin"
          type="date"
          value={formDateFin}
          onChange={(e) => setFormDateFin(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="montantJournalier">{t('dashboard.logistique.locations.fieldMontantJournalier')}</Label>
        <Input
          id="montantJournalier"
          type="number"
          min="0"
          step="0.01"
          value={formMontantJournalier}
          onChange={(e) => setFormMontantJournalier(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('dashboard.logistique.locations.fieldStatut')}</Label>
        <div className="h-10 flex items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
          {t('dashboard.logistique.locations.statutAuto')}
        </div>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="note">{t('dashboard.logistique.locations.fieldNote')}</Label>
        <Textarea
          id="note"
          rows={3}
          value={formNote}
          onChange={(e) => setFormNote(e.target.value)}
          placeholder={t('dashboard.logistique.locations.fieldNotePlaceholder')}
        />
      </div>
    </div>
  );

  const TYPE_LABELS = getTypeLabels(t);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.locations.title')}
        subtitle={t('dashboard.locations.subtitle')}
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            {t('dashboard.logistique.locations.newBtn')}
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent>
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle>{t('dashboard.logistique.locations.listTitle')}</CardTitle>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchInput
                placeholder={t('dashboard.logistique.locations.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    setSearch(searchInput);
                  }
                }}
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPage(1);
                    setSearch(searchInput);
                  }}
                >
                  {t('dashboard.logistique.locations.filterBtn')}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('dashboard.logistique.locations.totalEstimePage')}{' '}
              <span className="font-semibold text-foreground">
                {totalMontantEstime.toLocaleString('fr-FR')} MRU
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-8 w-8" />}
                title={t('dashboard.locations.empty')}
                description={t('dashboard.logistique.locations.emptyDesc')}
              />
            ) : isMobile ? (
              <div className="grid gap-3">
                {rows.map((row) => (
                  <div key={row._id} className="rounded-lg border bg-card p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{row.reference}</p>
                        <p className="text-xs text-muted-foreground">{row.clientNom}</p>
                      </div>
                      <div>{statutBadge(row.statut, t)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t('dashboard.logistique.locations.labelType')}</p>
                        <p className="font-medium">{TYPE_LABELS[row.type]}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('dashboard.logistique.locations.labelUnite')}</p>
                        <p className="font-mono text-xs">
                          {row.type === LocationType.VEHICULE_INTERNE
                            ? row.vehiculeInterneMatricule || '-'
                            : row.type === LocationType.VEHICULE_CLIENT
                              ? row.vehiculeClientMatricule || '-'
                              : row.conteneurNumero || '-'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">{t('dashboard.logistique.locations.labelPeriode')}</p>
                        <p>
                          {new Date(row.dateDebut).toLocaleDateString('fr-FR')} -{' '}
                          {row.dateFin ? new Date(row.dateFin).toLocaleDateString('fr-FR') : t('dashboard.logistique.locations.enCours')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('dashboard.logistique.locations.labelMontantJour')}</p>
                        <p className="font-semibold">
                          {Number(row.montantJournalier || 0).toLocaleString('fr-FR')} MRU
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t('dashboard.logistique.locations.labelTotalEstime')}</p>
                        <p className="font-semibold">
                          {Number(row.totalEstime || 0).toLocaleString('fr-FR')} MRU
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={deletingId === row._id}
                        onClick={() => void removeRow(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">{t('dashboard.logistique.locations.colReference')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.logistique.locations.colClient')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.logistique.locations.colTypeUnit')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.logistique.locations.colPeriode')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.logistique.locations.colMontantJour')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.logistique.locations.colTotalEstime')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.logistique.locations.colStatut')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.logistique.locations.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id} className="border-b">
                        <td className="px-3 py-2 font-medium">{row.reference}</td>
                        <td className="px-3 py-2">{row.clientNom}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span>{TYPE_LABELS[row.type]}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {row.type === LocationType.VEHICULE_INTERNE
                                ? row.vehiculeInterneMatricule || '-'
                                : row.type === LocationType.VEHICULE_CLIENT
                                  ? row.vehiculeClientMatricule || '-'
                                  : row.conteneurNumero || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {new Date(row.dateDebut).toLocaleDateString('fr-FR')} -{' '}
                          {row.dateFin ? new Date(row.dateFin).toLocaleDateString('fr-FR') : t('dashboard.logistique.locations.enCours')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.montantJournalier || 0).toLocaleString('fr-FR')} MRU
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {Number(row.totalEstime || 0).toLocaleString('fr-FR')} MRU
                        </td>
                        <td className="px-3 py-2">{statutBadge(row.statut, t)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={deletingId === row._id}
                              onClick={() => void removeRow(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <MobilePagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
                itemsPerPage={limit}
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {isMobile ? (
        <Drawer open={dialogOpen} onOpenChange={setDialogOpen}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader>
              <DrawerTitle>{editing ? t('dashboard.locations.editDialog') : t('dashboard.locations.newDialog')}</DrawerTitle>
            </DrawerHeader>

            <div className="overflow-y-auto px-4 pb-2">{formFields}</div>

            <DrawerFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button onClick={() => void submitForm()}>
                {editing ? t('dashboard.logistique.locations.saveBtn') : t('dashboard.logistique.locations.createBtn')}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? t('dashboard.locations.editDialog') : t('dashboard.locations.newDialog')}</DialogTitle>
              <DialogDescription>
                {t('dashboard.logistique.locations.dialogDescription')}
              </DialogDescription>
            </DialogHeader>

            {formFields}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('actions.cancel')}
              </Button>
              <Button onClick={() => void submitForm()}>
                {editing ? t('dashboard.logistique.locations.saveBtn') : t('dashboard.logistique.locations.createBtn')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
