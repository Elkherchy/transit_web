import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';
import {
  UserRole,
  type IJourneeCaisse,
  type IUserResponse,
  JourneeCaisseStatus,
  JourneeClientPaiementStatus,
} from '@/types';

interface JourneeWithComputed extends IJourneeCaisse {
  depotsAdminTotal?: number;
  depotsAdminCount?: number;
  alimentationsTotalReal?: number;
  alimentationsCountReal?: number;
}

/**
 * Paiement manutention en attente de validation par le caissier — agrège
 * la facture (BL) et le payeur pour l'affichage dans la section
 * "Paiements manutention à valider".
 */
interface PendingPaiement {
  _id: string;
  montant: number;
  datePaiement: Date | string;
  recuUrl?: string;
  payeurNom?: string;
  payeurEmail?: string;
  factureBl?: string;
}
import { Lock, LockOpen, CheckCircle2, FileCheck2 } from 'lucide-react';

/**
 * Ligne unifiée affichée dans la DataTable :
 *   - kind='kpi'     → indicateur de la journée (date, statut, soldes, totaux)
 *   - kind='aliment' → ligne d'alimentation effectuée par le caissier
 */
type Row =
  | {
      kind: 'kpi';
      id: string;
      label: string;
      value: React.ReactNode;
      tone?: 'pos' | 'neg';
    }
  | {
      kind: 'aliment';
      id: string;
      date: Date;
      payeurLabel: string;
      payeurEmail?: string;
      montant: number;
    }
  | {
      kind: 'client-paiement';
      id: string;
      date: Date;
      clientLabel: string;
      factureNumero?: string;
      banqueNom?: string;
      montant: number;
      statut: JourneeClientPaiementStatus;
    }
  | {
      kind: 'client-facture';
      id: string;
      date: Date;
      clientLabel: string;
      factureNumero: string;
      banqueNom?: string;
      montant: number;
    }
  | {
      kind: 'payeur-paiement';
      id: string;
      date: Date;
      payeurLabel: string;
      payeurEmail?: string;
      designationNom: string;
      bl?: string;
      montant: number;
    }
  | {
      kind: 'depense';
      id: string;
      date: Date;
      categorieNom: string;
      caisseNom?: string;
      description?: string;
      montant: number;
    };

interface DepenseApi {
  _id: string;
  categorieNom: string;
  montant: number;
  description?: string;
  date: string | Date;
  caisseNom?: string;
}

interface PayeurPaiementApi {
  designationId: string;
  transitId: string;
  bl?: string;
  client?: string;
  designationNom: string;
  montant: number;
  payeurId?: string;
  payeurNom?: string;
  payeurEmail?: string;
  paidAt: string | Date;
}

function buildColumns(
  t: (k: string, opts?: Record<string, unknown>) => string
): ColumnDef<Row>[] {
  return [
    {
      id: 'libelle',
      header: t('dashboard.caissier.cloturer.elementCol'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'kpi') {
          return <span className="font-medium">{r.label}</span>;
        }
        if (r.kind === 'client-paiement') {
          return (
            <div className="space-y-0.5">
              <div className="font-medium">{r.clientLabel}</div>
              <div className="text-xs text-muted-foreground">
                {r.factureNumero || '—'}
              </div>
            </div>
          );
        }
        if (r.kind === 'client-facture') {
          return (
            <div className="space-y-0.5">
              <div className="font-medium">{r.clientLabel}</div>
              <div className="text-xs text-muted-foreground">
                {r.factureNumero}
              </div>
            </div>
          );
        }
        if (r.kind === 'payeur-paiement') {
          return (
            <div className="space-y-0.5">
              <div className="font-medium">{r.payeurLabel}</div>
              <div className="text-xs text-muted-foreground">
                {r.designationNom}
                {r.bl ? ` · BL ${r.bl}` : ''}
              </div>
            </div>
          );
        }
        if (r.kind === 'depense') {
          return (
            <div className="space-y-0.5">
              <div className="font-medium">
                {t('dashboard.depenses.rowLabel', {
                  categorie: r.categorieNom,
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.caisseNom || '—'}
                {r.description ? ` · ${r.description}` : ''}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-0.5">
            <div className="font-medium">{r.payeurLabel}</div>
            {r.payeurEmail && (
              <div className="text-xs text-muted-foreground">
                {r.payeurEmail}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'detail',
      header: t('dashboard.caissier.cloturer.detailCol'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'kpi') return null;
        if (r.kind === 'client-paiement') {
          return (
            <span className="text-sm tabular-nums text-muted-foreground">
              {r.banqueNom || '—'}
            </span>
          );
        }
        if (r.kind === 'client-facture') {
          return (
            <span className="text-sm tabular-nums text-muted-foreground">
              {r.banqueNom || '—'}
            </span>
          );
        }
        if (r.kind === 'payeur-paiement') {
          return (
            <span className="text-sm tabular-nums text-muted-foreground">
              {new Date(r.date).toLocaleString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          );
        }
        return (
          <span className="text-sm tabular-nums text-muted-foreground">
            {new Date(r.date).toLocaleString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        );
      },
    },
    {
      id: 'valeur',
      meta: { align: 'right' } satisfies DataTableColumnMeta,
      header: t('dashboard.caissier.cloturer.valueCol'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === 'kpi') {
          return (
            <span
              className={
                r.tone === 'pos'
                  ? 'font-semibold tabular-nums text-green-700'
                  : r.tone === 'neg'
                    ? 'font-semibold tabular-nums text-red-700'
                    : 'font-semibold tabular-nums'
              }
            >
              {r.value}
            </span>
          );
        }
        if (r.kind === 'client-paiement') {
          return (
            <span className="font-semibold tabular-nums text-green-700">
              +
              {Number(r.montant).toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
              })}{' '}
              MRU
            </span>
          );
        }
        if (r.kind === 'client-facture') {
          return (
            <span className="font-semibold tabular-nums text-blue-700">
              {Number(r.montant).toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
              })}{' '}
              MRU
            </span>
          );
        }
        if (r.kind === 'payeur-paiement') {
          return (
            <span className="font-semibold tabular-nums text-emerald-700">
              +
              {Number(r.montant).toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
              })}{' '}
              MRU
            </span>
          );
        }
        if (r.kind === 'depense') {
          return (
            <span className="font-semibold tabular-nums text-red-700">
              −
              {Number(r.montant).toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
              })}{' '}
              MRU
            </span>
          );
        }
        return (
          <span className="font-semibold tabular-nums text-red-700">
            −
            {Number(r.montant).toLocaleString('fr-FR', {
              minimumFractionDigits: 2,
            })}{' '}
            MRU
          </span>
        );
      },
    },
  ];
}

export default function CaissierCloturerJournee() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  const [journee, setJournee] = useState<JourneeWithComputed | null>(null);
  const [payeurs, setPayeurs] = useState<IUserResponse[]>([]);
  const [payeurPaiements, setPayeurPaiements] = useState<PayeurPaiementApi[]>([]);
  const [depenses, setDepenses] = useState<DepenseApi[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Paiements manutention en attente de validation par le caissier (étape
  // bloquante avant la clôture de la journée — cf. nouveau flow demandé).
  const [pendingPaiements, setPendingPaiements] = useState<
    PendingPaiement[]
  >([]);
  const [actingPaiementId, setActingPaiementId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [
        journeeRes,
        payeursRes,
        pendingRes,
        payeurPaiementsRes,
        depensesRes,
      ] = await Promise.all([
        fetch('/api/journee/current', { credentials: 'include' }).then((x) =>
          x.json()
        ),
        fetch('/api/users/payeurs', { credentials: 'include' }).then((x) =>
          x.json()
        ),
        fetch(
          '/api/manutention/paiements?statut=EN_VALIDATION&limit=200',
          { credentials: 'include' }
        ).then((x) => x.json()),
        fetch('/api/journee/payeur-paiements', {
          credentials: 'include',
        }).then((x) => x.json()),
        fetch(`/api/depenses?from=${today}&to=${today}&limit=200`, {
          credentials: 'include',
        }).then((x) => x.json()),
      ]);
      if (payeurPaiementsRes.success) {
        setPayeurPaiements(
          (payeurPaiementsRes.data || []) as PayeurPaiementApi[]
        );
      }
      if (depensesRes.success) {
        setDepenses((depensesRes.data || []) as DepenseApi[]);
      }

      if (journeeRes.success) setJournee(journeeRes.data);
      if (payeursRes.success) {
        const list = (payeursRes.data?.data ||
          payeursRes.data ||
          []) as IUserResponse[];
        setPayeurs(list);
      }
      if (pendingRes.success) {
        const raw = (pendingRes.data?.data || []) as Array<Record<string, unknown>>;
        const mapped: PendingPaiement[] = raw.map((p) => {
          const facture = p.factureManutentionId as
            | { _id?: string; bl?: string }
            | string
            | undefined;
          const payeur = p.payeurId as
            | { _id?: string; nom?: string; email?: string }
            | string
            | undefined;
          return {
            _id: String(p._id),
            montant: Number(p.montant) || 0,
            datePaiement: p.datePaiement as Date | string,
            recuUrl: p.recuUrl ? String(p.recuUrl) : undefined,
            payeurNom:
              typeof payeur === 'object' && payeur ? payeur.nom : undefined,
            payeurEmail:
              typeof payeur === 'object' && payeur ? payeur.email : undefined,
            factureBl:
              typeof facture === 'object' && facture ? facture.bl : undefined,
          };
        });
        setPendingPaiements(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /** Valider ou rejeter un paiement manutention. */
  const decidePaiement = async (
    paiementId: string,
    decision: 'VALIDE' | 'REJETE'
  ) => {
    setError(null);
    setSuccess(null);
    setActingPaiementId(paiementId);
    try {
      const r = await fetch(`/api/manutention/paiements/${paiementId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: decision }),
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(
          decision === 'VALIDE'
            ? t('dashboard.caissier.cloturer.paiementValideOk')
            : t('dashboard.caissier.cloturer.paiementRejeteOk')
        );
        // Retire la ligne traitée + recharge soldes/KPI.
        setPendingPaiements((prev) => prev.filter((p) => p._id !== paiementId));
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setActingPaiementId(null);
    }
  };

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const reouvrir = async () => {
    if (!journee) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/journee/${journee._id}/reouvrir`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.caissier.successReopen'));
        setJournee(r.data);
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const cloturer = async () => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/journee/cloturer', {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.caissier.successCloture'));
        setJournee(r.data);
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo(() => buildColumns(t), [t]);

  const rows = useMemo<Row[]>(() => {
    if (!journee) return [];
    const map = new Map(payeurs.map((p) => [String(p._id), p]));

    // Totaux : on privilégie les valeurs **calculées depuis Transaction**
    // (source de vérité côté API) avec fallback sur les sous-documents legacy.
    const totalAdmin =
      typeof journee.depotsAdminTotal === 'number'
        ? journee.depotsAdminTotal
        : (journee.alimentationsAdmin || []).reduce(
            (s, a) => s + (a.montant || 0),
            0
          );
    const totalPayeurs =
      typeof journee.alimentationsTotalReal === 'number'
        ? journee.alimentationsTotalReal
        : (journee.alimentationsPayeurs || []).reduce(
            (s, a) => s + (a.montant || 0),
            0
          );
    const countAdmin =
      typeof journee.depotsAdminCount === 'number'
        ? journee.depotsAdminCount
        : (journee.alimentationsAdmin || []).length;
    const countPayeurs =
      typeof journee.alimentationsCountReal === 'number'
        ? journee.alimentationsCountReal
        : (journee.alimentationsPayeurs || []).length;
    const totalPaiementsClients = (journee.clientPaiements || []).reduce(
      (s, p) => s + (Number(p.montant) || 0),
      0
    );
    const countPaiementsClients = (journee.clientPaiements || []).length;
    const totalFacturesClients = (journee.clientFactures || []).reduce(
      (s, f) => s + (Number(f.montant) || 0),
      0
    );
    const countFacturesClients = (journee.clientFactures || []).length;
    const totalClientOps = totalPaiementsClients + totalFacturesClients;
    const countClientOps = countPaiementsClients + countFacturesClients;
    const fmt = (n: number) =>
      n.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

    const kpiRows: Row[] = [
      {
        kind: 'kpi',
        id: 'date',
        label: t('dashboard.caissier.cloturer.kpiJournee'),
        value: (
          <span className="inline-flex items-center gap-2">
            {new Date(journee.date).toLocaleDateString('fr-FR')}
            <Badge
              variant={
                journee.statut === JourneeCaisseStatus.OUVERTE
                  ? 'default'
                  : 'secondary'
              }
            >
              {journee.statut}
            </Badge>
          </span>
        ),
      },
      {
        kind: 'kpi',
        id: 'soldeDebut',
        label: t('dashboard.caissier.cloturer.kpiSoldeDebut'),
        value: `${fmt(journee.soldeGeneralDebut)} MRU`,
      },
      {
        kind: 'kpi',
        id: 'depots',
        label: t('dashboard.caissier.cloturer.kpiDepots', {
          count: countAdmin,
        }),
        value: `+${fmt(totalAdmin)} MRU`,
        tone: 'pos',
      },
      {
        kind: 'kpi',
        id: 'aliments',
        label: t('dashboard.caissier.cloturer.kpiAlimentations', {
          count: countPayeurs,
        }),
        value: `−${fmt(totalPayeurs)} MRU`,
        tone: 'neg',
      },
      {
        kind: 'kpi',
        id: 'dossiers',
        label: t('dashboard.caissier.cloturer.kpiDossiers'),
        value: String(journee.transitsTraitesIds.length),
      },
      {
        kind: 'kpi',
        id: 'paiementsClients',
        label: t('dashboard.caissier.cloturer.kpiPaiementsClients', {
          count: countClientOps,
        }),
        value: `+${fmt(totalClientOps)} MRU`,
        tone: 'pos',
      },
      ...(journee.soldeGeneralFin !== undefined &&
      journee.soldeGeneralFin !== null
        ? [
            {
              kind: 'kpi' as const,
              id: 'soldeFin',
              label: t('dashboard.caissier.cloturer.kpiSoldeFin'),
              value: `${fmt(journee.soldeGeneralFin)} MRU`,
            },
          ]
        : []),
    ];

    const alimentRows: Row[] = (journee.alimentationsPayeurs || []).map(
      (a, idx) => {
        const p = map.get(String(a.payeurId));
        return {
          kind: 'aliment' as const,
          id: `aliment-${a.transactionId}-${idx}`,
          date: new Date(a.date),
          payeurLabel: p?.nom || String(a.payeurId),
          payeurEmail: p?.email,
          montant: a.montant,
        };
      }
    );

    const clientPaiementRows: Row[] = (journee.clientPaiements || []).map(
      (p, idx) => ({
        kind: 'client-paiement' as const,
        id: `client-payment-${p.paiementId}-${idx}`,
        date: new Date(p.date),
        clientLabel: p.clientNom || t('dashboard.caissier.cloturer.clientLabelFallback'),
        factureNumero: p.factureNumero,
        banqueNom: p.banqueNom,
        montant: Number(p.montant) || 0,
        statut: p.statut,
      })
    );

    const clientFactureRows: Row[] = (journee.clientFactures || []).map(
      (f, idx) => ({
        kind: 'client-facture' as const,
        id: `client-facture-${f.factureId}-${idx}`,
        date: new Date(f.date),
        clientLabel:
          f.clientNom ||
          t('dashboard.caissier.cloturer.clientLabelFallback', {
            defaultValue: 'Client',
          }),
        factureNumero: f.factureNumero,
        banqueNom: f.banqueNom,
        montant: Number(f.montant) || 0,
      })
    );

    const payeurPaiementRows: Row[] = payeurPaiements.map((p, idx) => ({
      kind: 'payeur-paiement' as const,
      id: `payeur-paiement-${p.designationId || idx}-${idx}`,
      date: new Date(p.paidAt),
      payeurLabel: p.payeurNom || (p.payeurId ? String(p.payeurId).slice(-6) : '—'),
      payeurEmail: p.payeurEmail,
      designationNom: p.designationNom,
      bl: p.bl,
      montant: Number(p.montant) || 0,
    }));

    const depenseRows: Row[] = depenses.map((d, idx) => ({
      kind: 'depense' as const,
      id: `depense-${d._id || idx}`,
      date: new Date(d.date),
      categorieNom: d.categorieNom,
      caisseNom: d.caisseNom,
      description: d.description,
      montant: Number(d.montant) || 0,
    }));

    // Les paiements payeur (désignations) ne sont PAS affichés ici : ils sont
    // gérés/validés dans /dashboard/caissier/operations-a-valider afin d'éviter
    // le doublon. On garde `payeurPaiementRows` calculé pour compatibilité mais
    // on ne l'inclut plus dans le tableau de clôture.
    void payeurPaiementRows;

    return [
      ...kpiRows,
      ...clientFactureRows,
      ...clientPaiementRows,
      ...depenseRows,
      ...alimentRows,
    ];
  }, [journee, payeurs, payeurPaiements, depenses, t]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.cloturerTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const isClosed =
    journee?.statut && journee.statut !== JourneeCaisseStatus.OUVERTE;
  // Réouverture autorisée uniquement tant que l'agent transit n'a pas
  // validé la journée (statut strictement CLOTUREE).
  const canReopen = journee?.statut === JourneeCaisseStatus.CLOTUREE;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caissier.cloturerTitle')}
        subtitle={t('dashboard.caissier.cloturerSubtitle')}
        actions={
          journee && !isClosed ? (
            <div className="flex gap-2">
            <Button
              onClick={cloturer}
              disabled={submitting || pendingPaiements.length > 0}
              title={
                pendingPaiements.length > 0
                  ? t('dashboard.caissier.cloturer.cannotCloseWhilePending', {
                      count: pendingPaiements.length,
                    })
                  : undefined
              }
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <Lock className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {submitting
                  ? t('dashboard.caissier.cloturerSubmitting')
                  : t('dashboard.caissier.cloturerBtn')}
              </span>
              <span className="sm:hidden">
                {submitting ? '…' : t('dashboard.caissier.cloturerShort')}
              </span>
            </Button>
            </div>
          ) : canReopen ? (
            <Button
              variant="outline"
              onClick={reouvrir}
              disabled={submitting}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <LockOpen className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {submitting
                  ? t('dashboard.caissier.reopenSubmitting')
                  : t('dashboard.caissier.reopenBtn')}
              </span>
              <span className="sm:hidden">
                {submitting ? '…' : t('dashboard.caissier.reopenShort')}
              </span>
            </Button>
          ) : undefined
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Étape 1 : valider les paiements manutention en attente avant
              de pouvoir clôturer la journée. */}
          {!isClosed && pendingPaiements.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-amber-600" />
                  {t('dashboard.caissier.cloturer.pendingPaiementsTitle')}
                  <Badge variant="secondary" className="ml-1">
                    {pendingPaiements.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t('dashboard.caissier.cloturer.pendingPaiementsHint')}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingPaiements.map((p) => (
                  <div
                    key={p._id}
                    className="rounded-md border bg-card p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-0.5 text-sm">
                      <div className="font-medium">
                        {p.payeurNom || t('dashboard.caissier.cloturer.unknownPayeur')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.factureBl
                          ? `BL ${p.factureBl}`
                          : t('dashboard.caissier.cloturer.unknownBl')}
                        {' · '}
                        <span className="tabular-nums font-medium text-foreground">
                          {Number(p.montant).toLocaleString('fr-FR', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          {t('common.mru')}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.recuUrl && (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                        >
                          <a
                            href={`/api/documents/${encodeURIComponent(p.recuUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('dashboard.caissier.cloturer.viewRecu')}
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                        disabled={actingPaiementId === p._id}
                        onClick={() => decidePaiement(p._id, 'VALIDE')}
                      >
                        {actingPaiementId === p._id
                          ? '…'
                          : t('dashboard.caissier.cloturer.valider')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs"
                        disabled={actingPaiementId === p._id}
                        onClick={() => decidePaiement(p._id, 'REJETE')}
                      >
                        {actingPaiementId === p._id
                          ? '…'
                          : t('dashboard.caissier.cloturer.rejeter')}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {journee && (
            <>
              <DataTable
                columns={columns}
                data={rows}
                emptyMessage={t('dashboard.caissier.cloturerEmpty')}
              />

              {isClosed && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    {t('dashboard.caissier.closedAlert')}
                    {canReopen && (
                      <> {t('dashboard.caissier.closedReopenHint')}</>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
