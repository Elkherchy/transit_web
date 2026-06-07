import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';


import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  UserRole,
  type ICaisseListItem,
  type ITransaction,
  TransactionType,
} from '@/types';
import { ArrowLeft, RefreshCcw, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function CaissierHistoriquePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const [caisse, setCaisse] = useState<ICaisseListItem | null>(null);
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
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
      const caisseRes = await fetch('/api/caisse/caisses', {
        credentials: 'include',
      }).then((r) => r.json());

      if (caisseRes.success) {
        const list = (caisseRes.data || []) as ICaisseListItem[];
        const me = list[0];
        setCaisse(me || null);
        if (me) {
          const txRes = await fetch(
            `/api/caisse/transactions?caisseId=${me._id}&limit=200`,
            { credentials: 'include' }
          ).then((r) => r.json());
          if (txRes.success) {
            setTransactions((txRes.data?.data || []) as ITransaction[]);
          }
        }
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
        <PageHeader
          title="Opérations de caisse"
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/caissier/caisse">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                Retour
              </Link>
            </Button>
          }
        />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const totalCredit = transactions
    .filter((t) => t.type === TransactionType.CREDIT)
    .reduce((s, t) => s + Number(t.montant || 0), 0);
  const totalDebit = transactions
    .filter((t) => t.type === TransactionType.DEBIT)
    .reduce((s, t) => s + Number(t.montant || 0), 0);

  return (
    <DashboardLayout>
      <PageHeader
        title="Opérations de caisse"
        subtitle={caisse ? `${caisse.nom} · ${fmt(caisse.solde ?? 0)} MRU` : '—'}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/caissier/caisse">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              Retour
            </Link>
          </Button>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <RefreshCcw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-5xl space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Solde actuel
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums">
                  {fmt(caisse?.solde ?? 0)} MRU
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Entrées
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                  +{fmt(totalCredit)} MRU
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sorties
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-red-700">
                  −{fmt(totalDebit)} MRU
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Liste des transactions */}
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Aucune opération.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Vue mobile : cards empilées */}
              <div className="space-y-2 sm:hidden">
                {transactions.map((tx) => {
                  const isCredit = tx.type === TransactionType.CREDIT;
                  return (
                    <Card key={tx._id} className="overflow-hidden">
                      <CardContent className="flex items-center gap-3 p-3">
                        <div
                          className={
                            isCredit
                              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
                              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700'
                          }
                        >
                          {isCredit ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {tx.description || '—'}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {new Date(tx.date).toLocaleDateString('fr-FR')}
                            {tx.reference ? ` · ${tx.reference}` : ''}
                          </div>
                        </div>
                        <div
                          className={
                            isCredit
                              ? 'text-sm font-bold tabular-nums text-emerald-700'
                              : 'text-sm font-bold tabular-nums text-red-700'
                          }
                        >
                          {isCredit ? '+' : '−'}
                          {fmt(tx.montant)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Vue desktop : table */}
              <div className="hidden overflow-hidden rounded-lg border bg-white sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-4 py-2.5 font-medium">Référence</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const isCredit = tx.type === TransactionType.CREDIT;
                      return (
                        <tr
                          key={tx._id}
                          className="border-b last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-2.5 tabular-nums">
                            {new Date(tx.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              className={
                                isCredit
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs'
                                  : 'bg-red-100 text-red-700 hover:bg-red-100 text-xs'
                              }
                            >
                              {isCredit ? 'Entrée' : 'Sortie'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {tx.description || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                            {tx.reference || '—'}
                          </td>
                          <td
                            className={
                              isCredit
                                ? 'px-4 py-2.5 text-right font-bold tabular-nums text-emerald-700'
                                : 'px-4 py-2.5 text-right font-bold tabular-nums text-red-700'
                            }
                          >
                            {isCredit ? '+' : '−'}
                            {fmt(tx.montant)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
