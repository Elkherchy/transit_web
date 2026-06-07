import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageContent,
  EmptyState,
  PageSkeleton,
  SearchInput,
  MobilePagination,
} from '@/components/ui';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DataTable } from '@/components/ui/data-table';
import ChauffeurCombobox from '@/components/logistique/ChauffeurCombobox';
import { createVehiculeColumns } from '@/components/dashboard/logistique/columns-vehicule';
import { IVehiculeResponse, UserRole, VehiculeCategorie } from '@/types';
import { Plus, Truck, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type SyncVehiculesResult = {
  totalMatricules: number;
  existingVehicules: number;
  created: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedInvalidMatricule: number;
  assignedToDefault: number;
};

export default function LogistiqueVehiculePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<IVehiculeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IVehiculeResponse | null>(null);
  const [trackingTarget, setTrackingTarget] = useState<IVehiculeResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IVehiculeResponse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingFromVoyages, setSyncingFromVoyages] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncVehiculesResult | null>(null);

  const [formMatricule, setFormMatricule] = useState('');
  const [formCategorie, setFormCategorie] = useState<VehiculeCategorie>(VehiculeCategorie.INTERNE);
  const [formClientNom, setFormClientNom] = useState('');
  const [formChauffeurId, setFormChauffeurId] = useState('');
  const [formCarburant, setFormCarburant] = useState('0');
  const [trackingDate, setTrackingDate] = useState('');
  const [trackingCompteurPrecedent, setTrackingCompteurPrecedent] = useState('0');
  const [trackingCompteurActuel, setTrackingCompteurActuel] = useState('0');
  const [trackingCarburantPrecedent, setTrackingCarburantPrecedent] = useState('0');
  const [trackingCarburantActuel, setTrackingCarburantActuel] = useState('0');
  const [trackingNombreTrajets, setTrackingNombreTrajets] = useState('0');
  const [trackingNote, setTrackingNote] = useState('');
  const [formActif, setFormActif] = useState(true);

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.ADMIN_LOGISTIQUE || userRole === UserRole.AGENT_TRANSIT || userRole === UserRole.COMPTABLE;
  const limit = isMobile ? 5 : 15;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, isAllowed, router]);

  const fetchVehicules = useCallback(async () => {
    if (!isAllowed) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/logistique/vehicules?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || t('dashboard.logistique.vehicule.errLoadFailed'));
        setRows([]);
        return;
      }

      setRows(json.data.data || []);
      setTotalPages(json.data.totalPages || 1);
    } catch {
      setError(t('common.errorNetwork'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isAllowed, page, limit, search, t]);

  useEffect(() => {
    void fetchVehicules();
  }, [fetchVehicules]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormMatricule('');
    setFormCategorie(VehiculeCategorie.INTERNE);
    setFormClientNom('');
    setFormChauffeurId('');
    setFormCarburant('0');
    setFormActif(true);
    setDialogOpen(true);
    setError(null);
  }, []);

  const openEdit = useCallback((row: IVehiculeResponse) => {
    setEditing(row);
    setFormMatricule(row.matricule);
    setFormCategorie(row.categorie || VehiculeCategorie.INTERNE);
    setFormClientNom(row.clientNom || '');
    setFormChauffeurId(row.chauffeurId || '');
    setFormCarburant(String(row.carburant ?? 0));
    setFormActif(row.actif);
    setDialogOpen(true);
    setError(null);
  }, []);

  const requestDelete = useCallback((row: IVehiculeResponse) => {
    setDeleteTarget(row);
    setError(null);
  }, []);

  const openTracking = useCallback(async (row: IVehiculeResponse) => {
    const today = new Date().toISOString().slice(0, 10);
    const currentFuel = Number(row.carburant || 0);

    setTrackingTarget(row);
    setTrackingDate(today);
    setTrackingCompteurPrecedent('0');
    setTrackingCompteurActuel('0');
    setTrackingCarburantPrecedent(currentFuel.toFixed(2));
    setTrackingCarburantActuel(currentFuel.toFixed(2));
    setTrackingNombreTrajets('0');
    setTrackingNote('');
    setTrackingDialogOpen(true);
    setError(null);

    // Auto-fetch dernier historique carburant
    try {
      const histRes = await fetch(
        `/api/logistique/vehicules/carburant-history?vehiculeId=${row._id}&page=1&limit=1`,
        { credentials: 'include' }
      );
      const histJson = await histRes.json();
      const lastEntry = histJson.data?.data?.[0];

      if (lastEntry) {
        // Compteur précédent = dernier compteur actuel enregistré
        if (lastEntry.compteurActuelKm != null) {
          setTrackingCompteurPrecedent(String(lastEntry.compteurActuelKm));
        }
        // Carburant précédent = niveau après la dernière opération
        if (lastEntry.after != null) {
          setTrackingCarburantPrecedent(String(lastEntry.after));
          setTrackingCarburantActuel(String(lastEntry.after));
        }

        // Nombre de trajets = voyages entre le dernier carburant et aujourd'hui
        const lastFuelDate = lastEntry.fuelDate ?? lastEntry.createdAt;
        if (lastFuelDate) {
          const voyRes = await fetch(
            `/api/logistique/voyages?search=${encodeURIComponent(row.matricule)}&limit=500`,
            { credentials: 'include' }
          );
          const voyJson = await voyRes.json();
          const voyages: Array<{ date: string; matricule: string }> = voyJson.data?.data ?? [];
          const since = new Date(lastFuelDate);
          const now = new Date();
          const count = voyages.filter((v) => {
            const d = new Date(v.date);
            return (
              d >= since &&
              d <= now &&
              v.matricule.toUpperCase() === row.matricule.toUpperCase()
            );
          }).length;
          setTrackingNombreTrajets(String(count));
        }
      }
    } catch {
      // En cas d'erreur, les valeurs par défaut déjà définies restent en place
    }
  }, []);

  const syncFromVoyages = useCallback(async () => {
    setSyncingFromVoyages(true);
    setError(null);
    setSyncSummary(null);
    try {
      const res = await fetch('/api/logistique/vehicules/sync-from-voyages', {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.logistique.vehicule.errSyncFailed'));
        return;
      }

      setSyncSummary(json.data as SyncVehiculesResult);
      void fetchVehicules();
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSyncingFromVoyages(false);
    }
  }, [fetchVehicules, t]);

  const submitForm = useCallback(async () => {
    setError(null);

    const matricule = formMatricule.trim().toUpperCase();
    const carburant = Number(formCarburant || 0);
    if (!matricule) {
      setError(t('dashboard.logistique.vehicule.errMatriculeRequired'));
      return;
    }
    if (formCategorie === VehiculeCategorie.INTERNE && !formChauffeurId) {
      setError(t('dashboard.logistique.vehicule.errChauffeurRequired'));
      return;
    }
    if (formCategorie === VehiculeCategorie.CLIENT && !formClientNom.trim()) {
      setError(t('dashboard.logistique.vehicule.errClientNomRequired'));
      return;
    }
    if (!Number.isFinite(carburant) || carburant < 0) {
      setError(t('dashboard.logistique.vehicule.errCarburantInvalid'));
      return;
    }

    try {
      const url = editing
        ? `/api/logistique/vehicules/${editing._id}`
        : '/api/logistique/vehicules';
      const method = editing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule,
          categorie: formCategorie,
          chauffeurId: formCategorie === VehiculeCategorie.INTERNE ? formChauffeurId : undefined,
          clientNom: formCategorie === VehiculeCategorie.CLIENT ? formClientNom.trim() : undefined,
          carburant,
          actif: formActif,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.logistique.vehicule.errOperationRefused'));
        return;
      }

      setDialogOpen(false);
      void fetchVehicules();
    } catch {
      setError(t('common.errorNetwork'));
    }
  }, [
    editing,
    formMatricule,
    formCategorie,
    formClientNom,
    formChauffeurId,
    formCarburant,
    formActif,
    fetchVehicules,
    t,
  ]);

  const submitTracking = useCallback(async () => {
    if (!trackingTarget) return;

    const compteurPrecedent = Number(trackingCompteurPrecedent || 0);
    const compteurActuel = Number(trackingCompteurActuel || 0);
    const carburantPrecedent = Number(trackingCarburantPrecedent || 0);
    const carburantActuel = Number(trackingCarburantActuel || 0);
    const nombreTrajets = Number(trackingNombreTrajets || 0);

    if (!trackingDate) {
      setError(t('dashboard.logistique.vehicule.errTrackingDateRequired'));
      return;
    }
    if (!Number.isFinite(compteurPrecedent) || compteurPrecedent < 0) {
      setError(t('dashboard.logistique.vehicule.errCounterPrev'));
      return;
    }
    if (!Number.isFinite(compteurActuel) || compteurActuel < compteurPrecedent) {
      setError(t('dashboard.logistique.vehicule.errCounterCurrent'));
      return;
    }
    if (!Number.isFinite(carburantPrecedent) || carburantPrecedent < 0) {
      setError(t('dashboard.logistique.vehicule.errFuelPrev'));
      return;
    }
    if (!Number.isFinite(carburantActuel) || carburantActuel < 0) {
      setError(t('dashboard.logistique.vehicule.errFuelCurrent'));
      return;
    }
    if (!Number.isFinite(nombreTrajets) || nombreTrajets <= 0) {
      setError(t('dashboard.logistique.vehicule.errTripsInvalid'));
      return;
    }

    const distanceKm = compteurActuel - compteurPrecedent;
    const quantiteConsommee = Math.max(0, carburantPrecedent - carburantActuel);
    const consommationL100 = distanceKm > 0 ? (quantiteConsommee / distanceKm) * 100 : 0;

    try {
      const res = await fetch('/api/logistique/vehicules/deduct-carburant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: trackingTarget.matricule,
          source: 'MANUEL',
          fuelDate: trackingDate,
          compteurPrecedentKm: compteurPrecedent,
          compteurActuelKm: compteurActuel,
          carburantPrecedent,
          carburantActuel,
          nombreTrajets,
          distanceKm,
          consommationL100,
          note: trackingNote,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.logistique.vehicule.errTrackingFailed'));
        return;
      }

      setRows((previous) =>
        previous.map((row) =>
          row._id === trackingTarget._id
            ? { ...row, carburant: Number(carburantActuel.toFixed(2)) }
            : row
        )
      );

      setTrackingDialogOpen(false);
      setTrackingTarget(null);
      setTrackingNote('');
      void fetchVehicules();
    } catch {
      setError(t('common.errorNetwork'));
    }
  }, [
    fetchVehicules,
    trackingCarburantActuel,
    trackingCarburantPrecedent,
    trackingCompteurActuel,
    trackingCompteurPrecedent,
    trackingDate,
    trackingNombreTrajets,
    trackingNote,
    trackingTarget,
    t,
  ]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget._id);
    setError(null);
    try {
      const res = await fetch(`/api/logistique/vehicules/${deleteTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.logistique.vehicule.errSuppression'));
        return;
      }

      setDeleteTarget(null);
      void fetchVehicules();
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, fetchVehicules, t]);

  const columns = useMemo(
    () =>
      createVehiculeColumns({
        t,
        deletingId,
        onEdit: openEdit,
        onTrackFuel: (row) => { void openTracking(row); },
        onShowHistory: (row) => {
          void router.push(`/dashboard/logistique/vehicule/${row._id}/historique-carburant`);
        },
        onDelete: requestDelete,
      }),
    [t, deletingId, openEdit, openTracking, requestDelete, router]
  );

  if (status === 'loading' || (status === 'authenticated' && !isAllowed)) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.vehicule.loadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.vehicule.title')}
        subtitle={t('dashboard.vehicule.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => void syncFromVoyages()}
              disabled={syncingFromVoyages}
              className="flex-1 sm:flex-none"
            >
              {syncingFromVoyages ? t('dashboard.logistique.vehicule.syncBtnSubmitting') : t('dashboard.logistique.vehicule.syncBtn')}
            </Button>
            <Button
              onClick={openCreate}
              className="flex-1 sm:flex-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.logistique.vehicule.newBtn')}
            </Button>
          </div>
        }
        sticky={isMobile}
      />

      <PageContent>
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle>{t('dashboard.logistique.vehicule.listTitle')}</CardTitle>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {syncSummary && (
              <Alert>
                <AlertDescription>
                  {t('dashboard.logistique.vehicule.syncSummary', {
                    created: syncSummary.created,
                    existing: syncSummary.existingVehicules,
                    noMatch: syncSummary.skippedNoMatch,
                    ambiguous: syncSummary.skippedAmbiguous,
                    assigned: syncSummary.assignedToDefault,
                    total: syncSummary.totalMatricules,
                  })}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
              <SearchInput
                className="w-full sm:flex-1"
                placeholder={t('dashboard.logistique.vehicule.searchPlaceholder')}
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
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setPage(1);
                    setSearch(searchInput);
                  }}
                >
                  {t('dashboard.logistique.vehicule.filterBtn')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Truck className="h-8 w-8" />}
                title={t('dashboard.vehicule.empty')}
                description={t('dashboard.logistique.vehicule.emptyDesc')}
              />
            ) : (
              <DataTable columns={columns} data={rows} emptyMessage={t('dashboard.vehicule.empty')} />
            )}

            {totalPages > 1 && (
              <MobilePagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={rows.length}
                itemsPerPage={limit}
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('dashboard.vehicule.editDialog') : t('dashboard.vehicule.newDialog')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editing && (
              <div className="rounded-lg border bg-muted/40 px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('dashboard.logistique.vehicule.matriculeActuel')}</span>
                <span className="font-mono font-semibold tracking-wide">{editing.matricule}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="matricule">{t('dashboard.logistique.vehicule.matriculeLabel')}</Label>
                <Input
                  id="matricule"
                  value={formMatricule}
                  onChange={(e) => setFormMatricule(e.target.value.toUpperCase())}
                  placeholder={t('dashboard.logistique.vehicule.matriculePlaceholder')}
                  className="w-full font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>{t('dashboard.logistique.vehicule.chauffeurLie')}</Label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <Button
                    type="button"
                    variant={formCategorie === VehiculeCategorie.INTERNE ? 'default' : 'outline'}
                    onClick={() => setFormCategorie(VehiculeCategorie.INTERNE)}
                  >
                    {t('dashboard.logistique.vehicule.categorieInterne')}
                  </Button>
                  <Button
                    type="button"
                    variant={formCategorie === VehiculeCategorie.CLIENT ? 'default' : 'outline'}
                    onClick={() => setFormCategorie(VehiculeCategorie.CLIENT)}
                  >
                    {t('dashboard.logistique.vehicule.categorieClient')}
                  </Button>
                </div>

                {formCategorie === VehiculeCategorie.INTERNE ? (
                  <ChauffeurCombobox value={formChauffeurId} onChange={setFormChauffeurId} />
                ) : (
                  <Input
                    value={formClientNom}
                    onChange={(e) => setFormClientNom(e.target.value)}
                    placeholder={t('dashboard.logistique.vehicule.clientNomPlaceholder')}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="carburant">{t('dashboard.logistique.vehicule.carburantLabel')}</Label>
                <Input
                  id="carburant"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formCarburant}
                  onChange={(e) => setFormCarburant(e.target.value)}
                  placeholder="0"
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={formActif}
                    onChange={(e) => setFormActif(e.target.checked)}
                    className="rounded"
                  />
                  <span>{t('dashboard.logistique.vehicule.vehiculeActif')}</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitForm()}>
              {editing ? t('dashboard.logistique.vehicule.saveBtn') : t('dashboard.logistique.vehicule.createBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {t('dashboard.logistique.vehicule.deleteTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('dashboard.logistique.vehicule.deleteFieldLabel')}</span>
              <span className="font-mono font-semibold tracking-wide">{deleteTarget?.matricule || '-'}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.logistique.vehicule.deleteHint')}
            </p>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deletingId !== null}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => void confirmDelete()}
              disabled={deletingId !== null}
            >
              {deletingId !== null
                ? t('dashboard.logistique.vehicule.deleteSubmitting')
                : t('dashboard.logistique.vehicule.deleteSubmit', { matricule: deleteTarget?.matricule ?? '' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('dashboard.logistique.vehicule.trackingTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">{t('dashboard.logistique.vehicule.trackingVehicule')}</span>
                <span className="font-mono font-semibold tracking-wide text-base">{trackingTarget?.matricule || '-'}</span>
              </div>
              <div className="col-span-1 sm:col-span-3">
                <span className="text-muted-foreground block text-xs">{t('dashboard.logistique.vehicule.trackingStockActuel')}</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 text-base">
                  {trackingTarget?.carburant ?? 0} L
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tracking-date">{t('dashboard.logistique.vehicule.trackingDate')}</Label>
                <Input
                  id="tracking-date"
                  type="date"
                  value={trackingDate}
                  onChange={(e) => setTrackingDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracking-trips">{t('dashboard.logistique.vehicule.trackingTrips')}</Label>
                <Input
                  id="tracking-trips"
                  type="number"
                  min="1"
                  step="1"
                  value={trackingNombreTrajets}
                  onChange={(e) => setTrackingNombreTrajets(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tracking-counter-prev">{t('dashboard.logistique.vehicule.trackingCounterPrev')}</Label>
                <Input
                  id="tracking-counter-prev"
                  type="number"
                  min="0"
                  step="1"
                  value={trackingCompteurPrecedent}
                  onChange={(e) => setTrackingCompteurPrecedent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracking-counter-current">{t('dashboard.logistique.vehicule.trackingCounterCurrent')}</Label>
                <Input
                  id="tracking-counter-current"
                  type="number"
                  min="0"
                  step="1"
                  value={trackingCompteurActuel}
                  onChange={(e) => setTrackingCompteurActuel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tracking-fuel-prev">{t('dashboard.logistique.vehicule.trackingFuelPrev')}</Label>
                <Input
                  id="tracking-fuel-prev"
                  type="number"
                  min="0"
                  step="0.01"
                  value={trackingCarburantPrecedent}
                  onChange={(e) => setTrackingCarburantPrecedent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tracking-fuel-current">{t('dashboard.logistique.vehicule.trackingFuelCurrent')}</Label>
                <Input
                  id="tracking-fuel-current"
                  type="number"
                  min="0"
                  step="0.01"
                  value={trackingCarburantActuel}
                  onChange={(e) => setTrackingCarburantActuel(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tracking-note">{t('dashboard.logistique.vehicule.trackingNote')}</Label>
                <Input
                  id="tracking-note"
                  value={trackingNote}
                  onChange={(e) => setTrackingNote(e.target.value)}
                  placeholder={t('dashboard.logistique.vehicule.trackingNotePlaceholder')}
                />
              </div>
            </div>

            {(() => {
              const compteurPrev = Number(trackingCompteurPrecedent || 0);
              const compteurCurrent = Number(trackingCompteurActuel || 0);
              const fuelCurrent = Number(trackingCarburantActuel || 0);
              const trips = Number(trackingNombreTrajets || 0);
              const diffCompteur = Math.max(0, compteurCurrent - compteurPrev);
              const fuelResult = trips > 0 ? fuelCurrent / trips : 0;
              const compteurResult = trips > 0 ? diffCompteur / trips : 0;

              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-muted-foreground">{t('dashboard.logistique.vehicule.trackingDiffCounter')}</p>
                      <p className="font-semibold">{diffCompteur.toFixed(0)} km</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('dashboard.logistique.vehicule.trackingResultFuel')}</p>
                      <p className="font-semibold">{fuelResult.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('dashboard.logistique.vehicule.trackingResultCounter')}</p>
                      <p className="font-semibold">{compteurResult.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialogOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitTracking()}>{t('dashboard.logistique.vehicule.trackingSubmit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
