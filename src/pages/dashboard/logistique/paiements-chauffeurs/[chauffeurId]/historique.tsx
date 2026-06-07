import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  PageHeader,
  PageContent,
  PageSkeleton,
  EmptyState,
} from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ICarburantHistoriqueResponse,
  IUserResponse,
  IVoyage,
  UserRole,
} from '@/types';
import { ArrowLeft, Banknote, Fuel, History as HistoryIcon } from 'lucide-react';

interface DetailData {
  chauffeur: IUserResponse;
  voyagesPayes: IVoyage[];
  totalDejaPaye: number;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function PaiementsChauffeurHistorique() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;

  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;

  const chauffeurId = String(router.query.chauffeurId || '');

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [carburant, setCarburant] = useState<ICarburantHistoriqueResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    if (!chauffeurId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Détails (inclut voyagesPayes avec leurs matricules)
      const detailRes = await fetch(
        `/api/logistique/paiements-chauffeurs/${chauffeurId}`,
        { credentials: 'include' }
      ).then((x) => x.json());

      if (!detailRes.success) {
        setError(detailRes.error || t('common.error'));
        setLoading(false);
        return;
      }
      setDetail(detailRes.data as DetailData);

      // 2. Pour chaque matricule unique apparu dans les voyages, on agrège
      //    l'historique carburant. Une seule requête par matricule limite
      //    à 200 entrées (suffisant pour la plupart des cas).
      const matricules = Array.from(
        new Set(
          (detailRes.data?.voyagesPayes || [])
            .map((v: IVoyage) => v.matricule)
            .filter(Boolean) as string[]
        )
      );

      if (matricules.length === 0) {
        setCarburant([]);
        setLoading(false);
        return;
      }

      const lists = await Promise.all(
        matricules.map((m) =>
          fetch(
            `/api/logistique/vehicules/carburant-history?matricule=${encodeURIComponent(m)}&limit=200`,
            { credentials: 'include' }
          )
            .then((x) => x.json())
            .then((j) => (j.success ? j.data?.data || [] : []))
            .catch(() => [])
        )
      );

      const flat = lists.flat() as ICarburantHistoriqueResponse[];
      // Tri décroissant par date.
      flat.sort((a, b) => {
        const da = a.fuelDate ? new Date(a.fuelDate).getTime() : 0;
        const db = b.fuelDate ? new Date(b.fuelDate).getTime() : 0;
        if (da !== db) return db - da;
        const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return cb - ca;
      });
      setCarburant(flat);
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [chauffeurId, t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  /** Voyages payés regroupés par date de paiement (commissionPaidAt). */
  const paiementsByDate = useMemo(() => {
    const map = new Map<string, IVoyage[]>();
    for (const v of detail?.voyagesPayes || []) {
      const key = v.commissionPaidAt
        ? new Date(v.commissionPaidAt).toISOString().slice(0, 10)
        : 'unknown';
      const arr = map.get(key) || [];
      arr.push(v);
      map.set(key, arr);
    }
    // Tri décroissant
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [detail]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.paiementsChauffeurs.historique.title')}
        />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed || !detail) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.paiementsChauffeurs.historique.title')}
        subtitle={detail.chauffeur.nom}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/logistique/paiements-chauffeurs/${chauffeurId}`}>
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.back')}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Total déjà payé (header simple) */}
        <Card className="mb-4">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-2">
              <HistoryIcon className="h-4 w-4" />
              {t('dashboard.paiementsChauffeurs.historique.totalLabel')}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {fmt(detail.totalDejaPaye)} {t('common.mru')}
            </span>
          </CardContent>
        </Card>

        {/* Historique paiements regroupés par date */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.paiementsChauffeurs.historique.paiementsTitle')}
              <Badge variant="secondary" className="ml-1">
                {detail.voyagesPayes.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paiementsByDate.length === 0 ? (
              <EmptyState
                icon={<Banknote className="h-8 w-8" />}
                title={t('dashboard.paiementsChauffeurs.historique.noPaiement')}
              />
            ) : (
              <div className="space-y-4">
                {paiementsByDate.map(([dateKey, voyages]) => {
                  const total = voyages.reduce(
                    (s, v) => s + (Number(v.commissionChauffeur) || 0),
                    0
                  );
                  const dateLabel =
                    dateKey === 'unknown'
                      ? '—'
                      : new Date(dateKey).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                  return (
                    <div key={dateKey} className="rounded-md border">
                      <div className="bg-muted/40 px-3 py-2 flex items-center justify-between text-sm">
                        <span className="font-medium">{dateLabel}</span>
                        <span className="tabular-nums font-semibold">
                          {fmt(total)} {t('common.mru')} ·{' '}
                          {voyages.length}{' '}
                          {t('dashboard.paiementsChauffeurs.historique.voyageCount', {
                            count: voyages.length,
                          })}
                        </span>
                      </div>
                      <div className="divide-y text-sm">
                        {voyages.map((v) => (
                          <div
                            key={String(v._id)}
                            className="px-3 py-2 flex items-center justify-between gap-3"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-medium truncate">
                                {v.matricule || '—'}
                                {v.bl ? ` · BL ${v.bl}` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {v.clientSource ||
                                  v.societe ||
                                  t(
                                    'dashboard.paiementsChauffeurs.historique.unknownClient'
                                  )}
                                {v.scanRetourAt
                                  ? ` · ${new Date(v.scanRetourAt).toLocaleDateString('fr-FR')}`
                                  : ''}
                              </div>
                            </div>
                            <div className="text-right tabular-nums whitespace-nowrap">
                              <div className="font-semibold">
                                {fmt(Number(v.commissionChauffeur) || 0)}{' '}
                                {t('common.mru')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historique consommation carburant */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Fuel className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.paiementsChauffeurs.historique.carburantTitle')}
              <Badge variant="secondary" className="ml-1">
                {carburant.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {carburant.length === 0 ? (
              <EmptyState
                icon={<Fuel className="h-8 w-8" />}
                title={t('dashboard.paiementsChauffeurs.historique.noCarburant')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colDate')}
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colMatricule')}
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colType')}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colQuantite')}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colDistance')}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">
                        {t('dashboard.paiementsChauffeurs.historique.colConsommation')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {carburant.map((c) => (
                      <tr key={c._id}>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {c.fuelDate
                            ? new Date(c.fuelDate).toLocaleDateString('fr-FR')
                            : c.createdAt
                              ? new Date(c.createdAt).toLocaleDateString('fr-FR')
                              : '—'}
                        </td>
                        <td className="px-2 py-2">{c.matricule}</td>
                        <td className="px-2 py-2">
                          {c.type === 'AJOUT' ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">
                              {t(
                                'dashboard.paiementsChauffeurs.historique.typeAjout'
                              )}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {t(
                                'dashboard.paiementsChauffeurs.historique.typeDeduction'
                              )}
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {fmt(Number(c.quantite) || 0)} L
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {c.distanceKm !== undefined
                            ? `${fmt(c.distanceKm)} km`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {c.consommationL100 !== undefined
                            ? `${fmt(c.consommationL100)} L/100`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
