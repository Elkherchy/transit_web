import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  EmptyState,
  MobilePagination,
  PageContent,
  PageHeader,
  PageSkeleton,
} from '@/components/ui';
import { ICarburantHistoriqueResponse, IVehiculeResponse, UserRole } from '@/types';
import { ArrowLeft, History } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

export default function VehiculeCarburantHistoryPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const vehiculeId = useMemo(() => {
    const raw = router.query.id;
    return Array.isArray(raw) ? raw[0] || '' : String(raw || '').trim();
  }, [router.query.id]);

  const [vehicule, setVehicule] = useState<IVehiculeResponse | null>(null);
  const [rows, setRows] = useState<ICarburantHistoriqueResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.ADMIN_LOGISTIQUE || userRole === UserRole.AGENT_TRANSIT || userRole === UserRole.COMPTABLE;
  const limit = isMobile ? 10 : 20;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [isAllowed, router, status]);

  const fetchData = useCallback(async () => {
    if (!isAllowed || !vehiculeId) return;

    setLoading(true);
    setError(null);
    try {
      const historyParams = new URLSearchParams({
        vehiculeId,
        page: String(page),
        limit: String(limit),
      });

      const [vehiculeRes, historyRes] = await Promise.all([
        fetch(`/api/logistique/vehicules/${vehiculeId}`, { credentials: 'include' }),
        fetch(`/api/logistique/vehicules/carburant-history?${historyParams.toString()}`, {
          credentials: 'include',
        }),
      ]);

      const vehiculeJson = await vehiculeRes.json();
      const historyJson = await historyRes.json();

      if (!vehiculeJson.success) {
        setError(vehiculeJson.error || t('dashboard.logistique.fuelHistory.errVehicule'));
        setVehicule(null);
        setRows([]);
        return;
      }

      if (!historyJson.success) {
        setError(historyJson.error || t('dashboard.logistique.fuelHistory.errLoad'));
        setVehicule(vehiculeJson.data || null);
        setRows([]);
        return;
      }

      setVehicule(vehiculeJson.data || null);
      setRows(historyJson.data?.data || []);
      setTotalPages(historyJson.data?.totalPages || 1);
      setTotalItems(historyJson.data?.total || 0);
    } catch {
      setError(t('common.errorNetwork'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isAllowed, limit, page, vehiculeId, t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (status === 'loading' || (status === 'authenticated' && !isAllowed)) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.vehicule.fuelHistoryTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 6 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.vehicule.fuelHistoryTitle')}
        subtitle={vehicule ? t('dashboard.logistique.fuelHistory.subtitleVehicule', { matricule: vehicule.matricule }) : t('dashboard.logistique.fuelHistory.subtitleFallback')}
        actions={
          <Button variant="outline" onClick={() => void router.push('/dashboard/logistique/vehicule')}>
            <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
            {t('dashboard.logistique.fuelHistory.backBtn')}
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent>
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>{t('dashboard.logistique.fuelHistory.cardTitle')}</CardTitle>
            {vehicule && (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.logistique.fuelHistory.currentLevel', { level: Number(vehicule.carburant || 0).toFixed(2) })}
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 6 : 10} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<History className="h-8 w-8" />}
                title={t('dashboard.vehicule.noFuelHistory')}
                description={t('dashboard.logistique.fuelHistory.emptyDesc')}
              />
            ) : (
              <>
                {isMobile ? (
                  <div className="space-y-3">
                    {rows.map((row) => {
                      const counterPrev = Number(row.compteurPrecedentKm ?? 0);
                      const counterCurrent = Number(row.compteurActuelKm ?? 0);
                      const counterDiff =
                        row.compteurPrecedentKm !== undefined || row.compteurActuelKm !== undefined
                          ? Math.max(0, counterCurrent - counterPrev)
                          : Number(row.distanceKm || 0);
                      const trips = Number(row.nombreTrajets || 0);
                      const fuelResult =
                        row.rendementCarburantParTrajet !== undefined
                          ? Number(row.rendementCarburantParTrajet)
                          : trips > 0
                            ? Number(row.after || 0) / trips
                            : 0;
                      const counterResult =
                        row.rendementCompteurParTrajet !== undefined
                          ? Number(row.rendementCompteurParTrajet)
                          : trips > 0
                            ? counterDiff / trips
                            : 0;

                      return (
                        <div key={row._id} className="rounded-lg border bg-card p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelDate')}</span>
                            <span className="font-medium">
                              {row.fuelDate
                                ? new Date(row.fuelDate).toLocaleDateString('fr-FR')
                                : row.createdAt
                                  ? new Date(row.createdAt).toLocaleDateString('fr-FR')
                                  : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelCounter')}</span>
                            <span className="font-mono text-xs">
                              {row.compteurPrecedentKm !== undefined ? `${counterPrev.toFixed(0)}` : '-'} →{' '}
                              {row.compteurActuelKm !== undefined ? `${counterCurrent.toFixed(0)} km` : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelEcart')}</span>
                            <span className="font-mono">{counterDiff.toFixed(0)} km</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelFuel')}</span>
                            <span className="font-mono text-xs">
                              {Number(row.before || 0).toFixed(2)} → {Number(row.after || 0).toFixed(2)} L
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelTrips')}</span>
                            <span className="font-mono">{trips > 0 ? trips : '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelResultFuel')}</span>
                            <span className="font-mono">{trips > 0 ? fuelResult.toFixed(2) : '-'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{t('dashboard.logistique.fuelHistory.labelResultCounter')}</span>
                            <span className="font-mono">{trips > 0 ? counterResult.toFixed(2) : '-'}</span>
                          </div>
                          {row.note && (
                            <div className="text-xs text-muted-foreground pt-2 border-t">
                              {t('dashboard.logistique.fuelHistory.labelNote', { note: row.note })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="px-3 py-2 text-left">{t('dashboard.logistique.fuelHistory.colDate')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colCounterPrev')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colCounterCurrent')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colCounterDiff')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colFuelPrev')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colFuelCurrent')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colTrips')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colResultFuel')}</th>
                          <th className="px-3 py-2 text-right">{t('dashboard.logistique.fuelHistory.colResultCounter')}</th>
                          <th className="px-3 py-2 text-left">{t('dashboard.logistique.fuelHistory.colNote')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const counterPrev = Number(row.compteurPrecedentKm ?? 0);
                          const counterCurrent = Number(row.compteurActuelKm ?? 0);
                          const counterDiff =
                            row.compteurPrecedentKm !== undefined || row.compteurActuelKm !== undefined
                              ? Math.max(0, counterCurrent - counterPrev)
                              : Number(row.distanceKm || 0);
                          const trips = Number(row.nombreTrajets || 0);
                          const fuelResult =
                            row.rendementCarburantParTrajet !== undefined
                              ? Number(row.rendementCarburantParTrajet)
                              : trips > 0
                                ? Number(row.after || 0) / trips
                                : 0;
                          const counterResult =
                            row.rendementCompteurParTrajet !== undefined
                              ? Number(row.rendementCompteurParTrajet)
                              : trips > 0
                                ? counterDiff / trips
                                : 0;

                          return (
                            <tr key={row._id} className="border-b">
                              <td className="px-3 py-2">
                                {row.fuelDate
                                  ? new Date(row.fuelDate).toLocaleDateString('fr-FR')
                                  : row.createdAt
                                    ? new Date(row.createdAt).toLocaleDateString('fr-FR')
                                    : '-'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.compteurPrecedentKm !== undefined ? `${counterPrev.toFixed(0)} km` : '-'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.compteurActuelKm !== undefined ? `${counterCurrent.toFixed(0)} km` : '-'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{counterDiff.toFixed(0)} km</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(row.before || 0).toFixed(2)} L</td>
                              <td className="px-3 py-2 text-right tabular-nums">{Number(row.after || 0).toFixed(2)} L</td>
                              <td className="px-3 py-2 text-right tabular-nums">{trips > 0 ? trips : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{trips > 0 ? fuelResult.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{trips > 0 ? counterResult.toFixed(2) : '-'}</td>
                              <td className="px-3 py-2">{row.note || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
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
    </DashboardLayout>
  );
}
