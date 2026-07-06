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
import {
  ArrowLeft,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  printCaisseHistoriquePdf,
  type CaisseHistoriquePdfModel,
} from '@/components/caisse/caisse-historique-pdf';

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);

  const isAllowed = user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setPage(1);
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

  const pageCount = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = transactions.slice(startIdx, startIdx + PAGE_SIZE);

  const handlePrint = async () => {
    if (transactions.length === 0 || printing) return;
    setPrinting(true);
    try {
      const model: CaisseHistoriquePdfModel = {
        badge: 'Opérations de caisse',
        titre: caisse?.nom
          ? `Opérations de caisse — ${caisse.nom}`
          : 'Opérations de caisse',
        sousTitre: caisse ? `Solde actuel : ${fmt(caisse.solde ?? 0)} MRU` : undefined,
        genereLe: new Date().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        kpis: [
          { label: 'Solde actuel', value: `${fmt(caisse?.solde ?? 0)} MRU` },
          { label: 'Entrées', value: `+${fmt(totalCredit)} MRU`, tone: 'credit' },
          { label: 'Sorties', value: `−${fmt(totalDebit)} MRU`, tone: 'debit' },
        ],
        showType: true,
        rows: transactions.map((tx) => ({
          date: new Date(tx.date).toLocaleDateString('fr-FR'),
          type: tx.type === TransactionType.CREDIT ? 'CREDIT' : 'DEBIT',
          description: tx.description || '',
          reference: tx.reference,
          montant: Number(tx.montant || 0),
        })),
        totalLabel: 'Solde net des opérations',
        totalMontant: totalCredit - totalDebit,
      };
      await printCaisseHistoriquePdf(model, window.location.origin);
    } finally {
      setPrinting(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePrint()}
              disabled={printing || transactions.length === 0}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              {printing ? (
                <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
              ) : (
                <Printer className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Imprimer PDF</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-7xl space-y-4">
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
                {pageItems.map((tx) => {
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
                    {pageItems.map((tx) => {
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

              {/* Pagination 10 par page */}
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {startIdx + 1}–
                    {Math.min(startIdx + PAGE_SIZE, transactions.length)} sur{' '}
                    {transactions.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                      <span className="ml-1 hidden sm:inline">Précédent</span>
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Page {currentPage} / {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      <span className="mr-1 hidden sm:inline">Suivant</span>
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
