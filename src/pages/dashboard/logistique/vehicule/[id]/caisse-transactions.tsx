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
import { UserRole } from '@/types';
import { ArrowLeft, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type DailyRow = {
  date: string;
  credit: number;
  debit: number;
  message: string;
};

type ApiPayload = {
  data: DailyRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  vehicule: { _id: string; matricule: string };
  totalCredit: number;
  totalDebit: number;
  totalGagne: number;
};

function formatDateYmd(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(date.getTime()) ? ymd : date.toLocaleDateString('fr-FR');
}

export default function VehiculeCaisseTransactionsPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const vehiculeId = useMemo(() => {
    const raw = router.query.id;
    return Array.isArray(raw) ? raw[0] || '' : String(raw || '').trim();
  }, [router.query.id]);

  const [rows, setRows] = useState<DailyRow[]>([]);
  const [vehiculeMatricule, setVehiculeMatricule] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalGagne, setTotalGagne] = useState(0);

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
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/logistique/vehicules/${vehiculeId}/caisse-transactions?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || t('dashboard.logistique.caisseTransactions.errLoad'));
        setRows([]);
        return;
      }

      const payload = json.data as ApiPayload;
      setRows(payload.data || []);
      setVehiculeMatricule(payload.vehicule?.matricule || '');
      setTotalPages(payload.totalPages || 1);
      setTotalItems(payload.total || 0);
      setTotalCredit(Number(payload.totalCredit || 0));
      setTotalDebit(Number(payload.totalDebit || 0));
      setTotalGagne(Number(payload.totalGagne || 0));
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
        <PageHeader title={t('dashboard.vehicule.caisseLoadingTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 6 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.vehicule.caisseTitle')}
        subtitle={vehiculeMatricule ? t('dashboard.logistique.caisseTransactions.subtitleVehicule', { matricule: vehiculeMatricule }) : t('dashboard.logistique.caisseTransactions.subtitleFallback')}
        actions={
          <Button variant="outline" onClick={() => void router.push('/dashboard/logistique/vehicule')}>
            <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
            {t('dashboard.logistique.caisseTransactions.backBtn')}
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent>
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>{t('dashboard.logistique.caisseTransactions.cardTitle')}</CardTitle>
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
                icon={<Wallet className="h-8 w-8" />}
                title={t('dashboard.vehicule.noMovement')}
                description={t('dashboard.logistique.caisseTransactions.emptyDesc')}
              />
            ) : (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-2 text-left">{t('dashboard.logistique.caisseTransactions.colDate')}</th>
                        <th className="px-3 py-2 text-left">{t('dashboard.logistique.caisseTransactions.colMessage')}</th>
                        <th className="px-3 py-2 text-right">{t('dashboard.logistique.caisseTransactions.colCredit')}</th>
                        <th className="px-3 py-2 text-right">{t('dashboard.logistique.caisseTransactions.colDebit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.date} className="border-b">
                          <td className="px-3 py-2">{formatDateYmd(row.date)}</td>
                          <td className="px-3 py-2">{row.message || '-'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                            {row.credit.toLocaleString('fr-FR')} MRU
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-700">
                            {row.debit.toLocaleString('fr-FR')} MRU
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20 font-semibold">
                        <td className="px-3 py-2">{t('dashboard.logistique.caisseTransactions.totalLabel')}</td>
                        <td className="px-3 py-2">-</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {totalCredit.toLocaleString('fr-FR')} MRU
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-700">
                          {totalDebit.toLocaleString('fr-FR')} MRU
                        </td>
                      </tr>
                      <tr className="font-bold">
                        <td className="px-3 py-2">{t('dashboard.logistique.caisseTransactions.totalGagne')}</td>
                        <td colSpan={3} className={`px-3 py-2 text-right tabular-nums ${totalGagne >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {totalGagne.toLocaleString('fr-FR')} MRU
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
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
    </DashboardLayout>
  );
}
