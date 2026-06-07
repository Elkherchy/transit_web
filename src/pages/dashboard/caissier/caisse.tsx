import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRole, type ICaisseListItem } from '@/types';
import { Wallet, User as UserIcon, History } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function CaissierCaissePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [maCaisse, setMaCaisse] = useState<ICaisseListItem | null>(null);
  const [payeursCaisses, setPayeursCaisses] = useState<ICaisseListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isAllowed = user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, payeursRes] = await Promise.all([
        fetch('/api/caisse/caisses', { credentials: 'include' }).then((r) =>
          r.json()
        ),
        fetch('/api/caisse/caisses?kind=USER', { credentials: 'include' }).then(
          (r) => r.json()
        ),
      ]);

      if (meRes.success) {
        const list = (meRes.data || []) as ICaisseListItem[];
        setMaCaisse(list[0] || null);
      }
      if (payeursRes.success) {
        setPayeursCaisses((payeursRes.data || []) as ICaisseListItem[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('nav.items.maCaisse')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const totalPayeurs = payeursCaisses.reduce(
    (acc, c) => acc + Number(c.solde || 0),
    0
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={t('nav.items.maCaisse')}
        subtitle={t('dashboard.caissier.alimentations.balanceLine', {
          solde: fmt(maCaisse?.solde ?? 0),
        })}
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/caissier/caisse/historique">
              <History className="mr-2 h-4 w-4" />
              {t('dashboard.caissier.alimentations.viewOperations', {
                defaultValue: 'Voir les opérations de caisse',
              })}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-7xl space-y-6">
          {maCaisse && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  {t('dashboard.caissier.alimentations.myCaisseLabel')} ·{' '}
                  {maCaisse.nom}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0 text-sm sm:grid-cols-3">
                <div className="space-y-0.5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('dashboard.caissier.alimentations.fields.currentBalance')}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmt(maCaisse.solde ?? 0)} MRU
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('dashboard.caissier.alimentations.fields.type')}
                  </div>
                  <div className="font-medium">
                    {maCaisse.type === 'BANQUE'
                      ? t('dashboard.caissier.alimentations.typeBank')
                      : t('dashboard.caissier.alimentations.typeCaisse')}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('dashboard.caissier.alimentations.fields.status')}
                  </div>
                  <div
                    className={
                      maCaisse.actif
                        ? 'font-medium text-green-600'
                        : 'font-medium text-red-600'
                    }
                  >
                    {maCaisse.actif
                      ? t('dashboard.caissier.alimentations.active')
                      : t('dashboard.caissier.alimentations.inactive')}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section: caisses des payeurs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-primary">
                {t('dashboard.caissier.caisse.payeursTitle')} ({payeursCaisses.length})
              </h2>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {t('dashboard.caissier.caisse.payeursTotal', { total: fmt(totalPayeurs) })}
              </span>
            </div>
            {payeursCaisses.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t('dashboard.caissier.caisse.noPayeur')}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {payeursCaisses.map((c) => (
                  <Card key={c._id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">
                          {c.payeur?.nom || c.nom}
                        </span>
                      </CardTitle>
                      {c.payeur?.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {c.payeur.email}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {t('dashboard.caissier.caisse.fieldSolde')}
                        </div>
                        <div className="text-lg font-bold tabular-nums">
                          {fmt(c.solde ?? 0)} MRU
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <Link href={`/dashboard/caissier/caisse/payeur/${c._id}`}>
                          <History className="mr-2 h-4 w-4" />
                          {t('dashboard.caissier.caisse.btnHistorique')}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
