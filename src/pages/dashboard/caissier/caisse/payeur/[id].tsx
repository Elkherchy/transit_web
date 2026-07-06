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
import {
  UserRole,
  type ICaisseListItem,
  type ITransaction,
  TransactionType,
} from '@/types';
import {
  ArrowLeft,
  RefreshCcw,
  ArrowDownRight,
  User as UserIcon,
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

export default function CaissierPayeurHistoriquePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const id = String(router.query.id || '');

  const [caisse, setCaisse] = useState<ICaisseListItem | null>(null);
  const [alimentations, setAlimentations] = useState<ITransaction[]>([]);
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
    if (!id) return;
    setLoading(true);
    setPage(1);
    try {
      const [caissesRes, txRes] = await Promise.all([
        fetch('/api/caisse/caisses?kind=USER', { credentials: 'include' }).then(
          (r) => r.json()
        ),
        fetch(`/api/caisse/transactions?caisseId=${id}&limit=200`, {
          credentials: 'include',
        }).then((r) => r.json()),
      ]);

      if (caissesRes.success) {
        const list = (caissesRes.data || []) as ICaisseListItem[];
        const found = list.find((c) => c._id === id);
        setCaisse(found || null);
      }
      if (txRes.success) {
        const all = (txRes.data?.data || []) as ITransaction[];
        // Alimentations = crédits sur la caisse payeur
        setAlimentations(
          all.filter((tx) => tx.type === TransactionType.CREDIT)
        );
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAllowed && id) void reload();
  }, [isAllowed, id, reload]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader
          title="Historique des alimentations"
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

  const totalCredite = alimentations.reduce(
    (s, tx) => s + Number(tx.montant || 0),
    0
  );

  const pageCount = Math.max(1, Math.ceil(alimentations.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = alimentations.slice(startIdx, startIdx + PAGE_SIZE);

  const handlePrint = async () => {
    if (alimentations.length === 0 || printing) return;
    setPrinting(true);
    try {
      const nom = caisse?.payeur?.nom || caisse?.nom || '';
      const model: CaisseHistoriquePdfModel = {
        badge: 'Alimentations payeur',
        titre: nom ? `Alimentations — ${nom}` : 'Historique des alimentations',
        sousTitre: caisse?.payeur?.email || undefined,
        genereLe: new Date().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        kpis: [
          { label: 'Solde actuel', value: `${fmt(caisse?.solde ?? 0)} MRU` },
          { label: 'Total reçu', value: `+${fmt(totalCredite)} MRU`, tone: 'credit' },
          { label: "Nombre d'opérations", value: String(alimentations.length) },
        ],
        showType: false,
        rows: alimentations.map((tx) => ({
          date: new Date(tx.date).toLocaleDateString('fr-FR'),
          type: 'CREDIT',
          description: tx.description || '',
          reference: tx.reference,
          montant: Number(tx.montant || 0),
        })),
        totalLabel: 'Total reçu',
        totalMontant: totalCredite,
      };
      await printCaisseHistoriquePdf(model, window.location.origin);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title={
          caisse?.payeur?.nom
            ? `Alimentations · ${caisse.payeur.nom}`
            : 'Historique des alimentations'
        }
        subtitle={caisse?.payeur?.email || undefined}
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
              disabled={printing || alimentations.length === 0}
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
          {/* Card payeur + totaux */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">
                    {caisse?.payeur?.nom || caisse?.nom || '—'}
                  </div>
                  {caisse?.payeur?.email && (
                    <div className="truncate text-xs text-muted-foreground">
                      {caisse.payeur.email}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Solde actuel
                  </div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums">
                    {fmt(caisse?.solde ?? 0)} MRU
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total reçu
                  </div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">
                    +{fmt(totalCredite)} MRU
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Nombre d&apos;opérations
                  </div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums">
                    {alimentations.length}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Liste alimentations */}
          {alimentations.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Aucune alimentation.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile : cards */}
              <div className="space-y-2 sm:hidden">
                {pageItems.map((tx) => (
                  <Card key={tx._id} className="overflow-hidden">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <ArrowDownRight className="h-4 w-4" />
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
                      <div className="text-sm font-bold tabular-nums text-emerald-700">
                        +{fmt(tx.montant)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop : table */}
              <div className="hidden overflow-hidden rounded-lg border bg-white sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-4 py-2.5 font-medium">Référence</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((tx) => (
                      <tr
                        key={tx._id}
                        className="border-b last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5 tabular-nums">
                          {new Date(tx.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {tx.description || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                          {tx.reference || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                          +{fmt(tx.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination 10 par page */}
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {startIdx + 1}–
                    {Math.min(startIdx + PAGE_SIZE, alimentations.length)} sur{' '}
                    {alimentations.length}
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
