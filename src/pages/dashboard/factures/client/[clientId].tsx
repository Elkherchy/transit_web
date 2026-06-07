import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { UserRole, type IFacture, FactureStatus } from '@/types';
import { ArrowLeft, Eye } from 'lucide-react';

type FactureRow = IFacture;

export default function FacturesClientDetailPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const { clientId } = router.query;

  const [factures, setFactures] = useState<IFacture[]>([]);
  const [clientNom, setClientNom] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.COMPTABLE;

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const fetchFactures = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transit/factures?clientId=${clientId}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (data.success) {
        const facturesList: IFacture[] = data.data.data || [];
        setFactures(facturesList);
        if (facturesList.length > 0) {
          setClientNom(facturesList[0].transitClient || 'Inconnu');
        }
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [clientId, t]);

  useEffect(() => {
    if (isAllowed && clientId) void fetchFactures();
  }, [isAllowed, clientId, fetchFactures]);

  const totalDebit = factures.reduce((sum, f) => sum + (f.montantPaye || 0), 0);
  const totalCredit = factures.reduce(
    (sum, f) => sum + Math.max(0, (f.totalFinal || 0) - (f.montantPaye || 0)),
    0
  );

  const getStatusBadge = (status: FactureStatus) => {
    const statusMap: Record<
      string,
      {
        variant: 'default' | 'secondary' | 'destructive' | 'outline';
        label: string;
      }
    > = {
      [FactureStatus.BROUILLON]: {
        variant: 'secondary',
        label: t('dashboard.factures.statusBrouillon'),
      },
      [FactureStatus.EMIS]: {
        variant: 'default',
        label: t('dashboard.factures.statusEmis'),
      },
      [FactureStatus.EN_VALIDATION]: {
        variant: 'secondary',
        label: t('dashboard.factures.statusEnValidation'),
      },
      [FactureStatus.EN_PAYE]: {
        variant: 'outline',
        label: t('dashboard.factures.statusEnPaye'),
      },
      [FactureStatus.PAYE]: {
        variant: 'default',
        label: t('dashboard.factures.statusPaye'),
      },
    };

    const config = statusMap[status] || {
      variant: 'secondary',
      label: String(status),
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const columns: ColumnDef<FactureRow>[] = [
    {
      accessorKey: 'numero',
      header: t('dashboard.caissier.facturesClient.colNumero') || 'Numéro',
      cell: ({ row }) => <span className="font-medium">{row.original.numero}</span>,
    },
    {
      accessorKey: 'totalFinal',
      header: t('dashboard.caissier.facturesClient.colTotal') || 'Total',
      cell: ({ row }) => <span>{(row.original.totalFinal || 0).toFixed(2)} MRU</span>,
    },
    {
      accessorKey: 'montantPaye',
      header: t('dashboard.caissier.facturesClient.colPaid') || 'Payé',
      cell: ({ row }) => (
        <span className="font-medium text-green-600">{(row.original.montantPaye || 0).toFixed(2)} MRU</span>
      ),
    },
    {
      accessorKey: 'statut',
      header: t('dashboard.caissier.facturesClient.colStatus') || 'Statut',
      cell: ({ row }) => getStatusBadge(row.original.statut),
    },
    {
      id: 'actions',
      header: t('common.actions') || 'Actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => void router.push(`/dashboard/factures/${row.original._id}`)}>
          <Eye className="mr-2 h-4 w-4" />
          {t('dashboard.caissier.facturesClient.actionView') || t('common.view') || 'Voir'}
        </Button>
      ),
    },
  ];

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

  return (
    <DashboardLayout>
      <PageHeader
        title={clientNom}
        subtitle={t('dashboard.caissier.facturesClient.detailSubtitle') || 'Opérations du client'}
        actions={
          <Button
            variant="outline"
            onClick={() => void router.push('/dashboard/factures')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('actions.back') || 'Retour'}</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.caissier.facturesClient.summaryOperations') || 'Opérations'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{factures.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.caissier.facturesClient.summaryDebit') || 'Débits'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{totalDebit.toFixed(2)} MRU</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('dashboard.caissier.facturesClient.summaryCredit') || 'Crédits'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{totalCredit.toFixed(2)} MRU</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {t('dashboard.caissier.facturesClient.operationsListTitle') || 'Liste des opérations'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {error ? (
              <div className="py-8 text-center text-destructive">{error}</div>
            ) : factures.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('dashboard.caissier.facturesClient.empty') || 'Aucune opération'}
              </div>
            ) : (
              <DataTable columns={columns} data={factures} />
            )}
          </CardContent>
        </Card>
      </PageContent>
    </DashboardLayout>
  );
}
