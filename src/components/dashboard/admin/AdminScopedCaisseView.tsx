import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  PageContent,
  PageHeader,
  PageSkeleton,
  EmptyState,
  ResponsiveTableArea,
  MobileEntityCard,
} from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  type DataTableColumnMeta,
} from '@/components/ui/data-table';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  CaisseKind,
  CaisseType,
  CompteType,
  ICaisseListItem,
  TransactionType,
  UserRole,
} from '@/types';
import {
  Wallet,
  Banknote,
  Eye,
  Building2,
  Plus,
  Coins,
  ArrowRightLeft,
  ShieldCheck,
  XCircle,
  Clock,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface Props {
  caisseType: CaisseType;
  /** Rôles autorisés à voir cette page (ex: ADMIN + ADMIN_TRANSIT). */
  allowedRoles: UserRole[];
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export default function AdminScopedCaisseView({
  caisseType,
  allowedRoles,
}: Props) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed = !!user?.role && allowedRoles.includes(user.role as UserRole);
  /** AGENT_TRANSIT crée des mouvements EN_ATTENTE avec image obligatoire,
   *  validés par ADMIN/ADMIN_TRANSIT. Les admins peuvent aussi voir la liste
   *  et valider/rejeter. */
  const isAgentTransit = user?.role === UserRole.AGENT_TRANSIT;
  const isAdminTransitOrSuper =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT;

  /** Préfixe URL pour les pages détail caisse (scopées par domaine). */
  const detailBase =
    caisseType === CaisseType.TRANSIT
      ? '/dashboard/admin/transit/caisse'
      : '/dashboard/admin/transit/caisse';

  const [rows, setRows] = useState<ICaisseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mouvements en attente (visible AGENT_TRANSIT pour suivi, ADMIN_TRANSIT
  // pour validation/rejet).
  interface MouvementPendingRow {
    _id: string;
    kind: 'CREDIT' | 'DEBIT' | 'TRANSFER';
    sourceCaisseId: string;
    sourceCaisseNom?: string;
    destinationCaisseId?: string;
    destinationCaisseNom?: string;
    montant: number;
    description: string;
    date: string | Date;
    recuUrl?: string;
    statut: 'EN_ATTENTE' | 'VALIDE' | 'REJETE';
    createdBy: string;
    createdAt: string | Date;
  }
  const [pending, setPending] = useState<MouvementPendingRow[]>([]);
  const [actingPendingId, setActingPendingId] = useState<string | null>(null);

  // Dialog : modifier le solde d'une caisse utilisateur (correction directe).
  const [corrRow, setCorrRow] = useState<ICaisseListItem | null>(null);
  const [corrSolde, setCorrSolde] = useState('');
  const [corrDesc, setCorrDesc] = useState('');
  const [corrError, setCorrError] = useState<string | null>(null);
  const [submittingCorr, setSubmittingCorr] = useState(false);

  const openSetSolde = (row: ICaisseListItem) => {
    setCorrRow(row);
    setCorrSolde(String(Number(row.solde) || 0));
    setCorrDesc('Correction manuelle de solde');
    setCorrError(null);
  };

  const submitSetSolde = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!corrRow) return;
    setCorrError(null);
    const newSolde = parseFloat(corrSolde.replace(',', '.'));
    if (!Number.isFinite(newSolde)) {
      setCorrError('Solde invalide');
      return;
    }
    setSubmittingCorr(true);
    try {
      const r = await fetch(`/api/admin/caisses/${corrRow._id}/set-solde`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSolde, description: corrDesc.trim() || undefined }),
      });
      const data = await r.json();
      if (data.success) {
        const savedSolde: number = typeof data.data?.solde === 'number' ? data.data.solde : newSolde;
        setSuccess(`Solde mis à jour : ${savedSolde.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} MRU`);
        // Update immediately in local state (bypass 304 cache on reload)
        setRows((prev) => prev.map((row) => row._id === corrRow!._id ? { ...row, solde: savedSolde } : row));
        setCorrRow(null);
        void reload();
      } else {
        setCorrError(data.error || t('common.error'));
      }
    } catch {
      setCorrError(t('common.errorNetwork'));
    } finally {
      setSubmittingCorr(false);
    }
  };

  // Dialog création nouveau compte bancaire (BMP, BMI, BMCI, …)
  const [createOpen, setCreateOpen] = useState(false);
  const [createNom, setCreateNom] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog : ajouter du solde sur un compte (caisse générale ou banque).
  const [soldeRow, setSoldeRow] = useState<ICaisseListItem | null>(null);
  const [soldeMontant, setSoldeMontant] = useState('');
  const [soldeDesc, setSoldeDesc] = useState('');
  const [soldeDate, setSoldeDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [soldeFile, setSoldeFile] = useState<File | null>(null);
  const [soldeSubmitting, setSoldeSubmitting] = useState(false);
  const [soldeError, setSoldeError] = useState<string | null>(null);

  // Dialog : transfert entre comptes (général ↔ banques OU vers un client).
  const [transferSource, setTransferSource] = useState<ICaisseListItem | null>(
    null
  );
  /** Type de destination : compte (banque/générale) ou client validé. */
  const [transferDestKind, setTransferDestKind] = useState<'BANQUE' | 'CLIENT'>(
    'BANQUE'
  );
  const [transferDestId, setTransferDestId] = useState<string>('');
  const [transferClientId, setTransferClientId] = useState<string>('');
  const [clientOptions, setClientOptions] = useState<
    { _id: string; nom: string }[]
  >([]);
  const [transferMontant, setTransferMontant] = useState('');
  const [transferDesc, setTransferDesc] = useState('');
  const [transferDate, setTransferDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const openTransferDialog = (row: ICaisseListItem) => {
    setTransferSource(row);
    setTransferDestKind('BANQUE');
    setTransferDestId('');
    setTransferClientId('');
    setTransferMontant('');
    setTransferDesc('');
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferFile(null);
    setTransferError(null);
    // Charge en arrière-plan la liste des clients validés (utilisée si
    // l'utilisateur choisit destination « Client »).
    void fetch('/api/transit/clients', { credentials: 'include' })
      .then((x) => x.json())
      .then((r) => {
        if (r?.success) {
          setClientOptions(
            (r.data || []) as { _id: string; nom: string }[]
          );
        }
      })
      .catch(() => null);
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSource) return;
    setTransferError(null);
    // Selon le type de destination choisi :
    //  - BANQUE : transferDestId pointe directement vers une caisse banque/générale
    //  - CLIENT : transferClientId pointe vers un Client (résolu côté serveur
    //             vers sa caisse CLIENT, créée si nécessaire)
    if (transferDestKind === 'BANQUE' && !transferDestId) {
      setTransferError('Sélectionnez un compte destination');
      return;
    }
    if (transferDestKind === 'CLIENT' && !transferClientId) {
      setTransferError('Sélectionnez un client destination');
      return;
    }
    const m = parseFloat(transferMontant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      setTransferError(t('dashboard.adminScopedCaisse.errMontantInvalid'));
      return;
    }
    if (isAgentTransit && !transferFile) {
      setTransferError(t('dashboard.adminScopedCaisse.errJustificatifRequired'));
      return;
    }
    setTransferSubmitting(true);
    try {
      if (isAgentTransit) {
        const fd = new FormData();
        fd.append('kind', 'TRANSFER');
        fd.append('sourceCaisseId', transferSource._id);
        if (transferDestKind === 'BANQUE') {
          fd.append('destinationCaisseId', transferDestId);
        } else {
          fd.append('destinationClientId', transferClientId);
        }
        fd.append('montant', String(m));
        const destItems = [general, ...banques].filter(
          (b): b is ICaisseListItem => Boolean(b)
        );
        const destName =
          transferDestKind === 'BANQUE'
            ? destItems.find((b) => b._id === transferDestId)?.nom || ''
            : `Client — ${
                clientOptions.find((c) => c._id === transferClientId)?.nom || ''
              }`;
        fd.append(
          'description',
          transferDesc.trim() || `Transfert ${transferSource.nom} → ${destName}`
        );
        if (transferDate)
          fd.append('date', new Date(transferDate).toISOString());
        if (transferFile) fd.append('file', transferFile);
        const r = await fetch('/api/caisse/mouvement-pending', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const data = await r.json();
        if (data.success) {
          setSuccess('Transfert créé — en attente de validation admin');
          setTransferSource(null);
          void reload();
          void reloadPending();
        } else {
          setTransferError(data.error || t('common.error'));
        }
      } else {
        const body: Record<string, unknown> = {
          sourceId: transferSource._id,
          montant: m,
          description: transferDesc.trim() || undefined,
          date: transferDate ? new Date(transferDate).toISOString() : undefined,
        };
        if (transferDestKind === 'BANQUE') {
          body.destinationId = transferDestId;
        } else {
          body.destinationClientId = transferClientId;
        }
        const r = await fetch('/api/caisse/transfer', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (data.success) {
          setSuccess('Transfert effectué avec succès');
          setTransferSource(null);
          void reload();
        } else {
          setTransferError(data.error || t('common.error'));
        }
      }
    } catch {
      setTransferError(t('common.errorNetwork'));
    } finally {
      setTransferSubmitting(false);
    }
  };

  const openSoldeDialog = (row: ICaisseListItem) => {
    setSoldeRow(row);
    setSoldeMontant('');
    setSoldeDesc(t('dashboard.adminScopedCaisse.soldeDescDefault'));
    setSoldeDate(new Date().toISOString().slice(0, 10));
    setSoldeFile(null);
    setSoldeError(null);
  };

  const submitSolde = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soldeRow) return;
    setSoldeError(null);
    const m = parseFloat(soldeMontant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      setSoldeError(t('dashboard.adminScopedCaisse.errMontantInvalid'));
      return;
    }
    if (!soldeDesc.trim()) {
      setSoldeError(t('dashboard.adminScopedCaisse.errDescRequired'));
      return;
    }
    // AGENT_TRANSIT : exige une image justificative, mouvement EN_ATTENTE.
    if (isAgentTransit && !soldeFile) {
      setSoldeError(t('dashboard.adminScopedCaisse.errJustificatifRequired'));
      return;
    }
    setSoldeSubmitting(true);
    try {
      if (isAgentTransit) {
        const fd = new FormData();
        fd.append('kind', 'CREDIT');
        fd.append('sourceCaisseId', soldeRow._id);
        fd.append('montant', String(m));
        fd.append('description', soldeDesc.trim());
        if (soldeDate) fd.append('date', new Date(soldeDate).toISOString());
        if (soldeFile) fd.append('file', soldeFile);
        const r = await fetch('/api/caisse/mouvement-pending', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        const data = await r.json();
        if (data.success) {
          setSuccess('Mouvement créé — en attente de validation admin');
          setSoldeRow(null);
          void reload();
          void reloadPending();
        } else {
          setSoldeError(data.error || t('common.error'));
        }
      } else {
        const r = await fetch('/api/caisse/transactions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caisseId: soldeRow._id,
            type: TransactionType.CREDIT,
            montant: m,
            description: soldeDesc.trim(),
            date: soldeDate ? new Date(soldeDate).toISOString() : undefined,
          }),
        });
        const data = await r.json();
        if (data.success) {
          setSuccess(t('dashboard.adminScopedCaisse.soldeSuccess'));
          setSoldeRow(null);
          void reload();
        } else {
          setSoldeError(data.error || t('common.error'));
        }
      }
    } catch {
      setSoldeError(t('common.errorNetwork'));
    } finally {
      setSoldeSubmitting(false);
    }
  };

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // includeUser=true pour récupérer aussi les caisses des payeurs.
      // Le backend filtre automatiquement par caisseType pour les admins scopés ;
      // on passe quand même le query param pour le super-ADMIN qui consulte
      // cette page.
      const r = await fetch(
        `/api/caisse/caisses?includeUser=true&caisseType=${caisseType}&_t=${Date.now()}`,
        { credentials: 'include' }
      );
      const data = await r.json();
      if (data.success) {
        setRows((data.data || []) as ICaisseListItem[]);
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [caisseType, t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const reloadPending = useCallback(async () => {
    if (!isAllowed) return;
    try {
      const r = await fetch(
        `/api/caisse/mouvement-pending?statut=EN_ATTENTE&caisseType=${caisseType}&limit=200`,
        { credentials: 'include' }
      );
      const data = await r.json();
      if (data.success) {
        setPending((data.data || []) as MouvementPendingRow[]);
      }
    } catch {
      // silencieux
    }
  }, [isAllowed, caisseType]);

  useEffect(() => {
    if (isAllowed) void reloadPending();
  }, [isAllowed, reloadPending]);

  const validerPending = async (id: string) => {
    setActingPendingId(id);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/caisse/mouvement-pending/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success) {
        setSuccess('Mouvement validé');
        void reload();
        void reloadPending();
      } else {
        const msg = data?.error || `Erreur ${r.status}`;
        console.error('validerPending failed:', msg, data);
        setError(msg);
      }
    } catch (err) {
      console.error('validerPending exception:', err);
      setError(t('common.errorNetwork'));
    } finally {
      setActingPendingId(null);
    }
  };

  const validerCompte = async (id: string) => {
    try {
      const r = await fetch(`/api/caisse/caisses/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess('Compte validé');
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const rejeterCompte = async (id: string, nom: string) => {
    if (!window.confirm(`Rejeter et supprimer le compte « ${nom} » ?`)) return;
    try {
      const r = await fetch(`/api/caisse/caisses/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess('Compte rejeté et supprimé');
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const rejeterPending = async (id: string) => {
    const motif = window.prompt('Motif du rejet (optionnel) :') || '';
    setActingPendingId(id);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/caisse/mouvement-pending/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire: motif }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success) {
        setSuccess('Mouvement rejeté');
        void reloadPending();
      } else {
        const msg = data?.error || `Erreur ${r.status}`;
        console.error('rejeterPending failed:', msg, data);
        setError(msg);
      }
    } catch (err) {
      console.error('rejeterPending exception:', err);
      setError(t('common.errorNetwork'));
    } finally {
      setActingPendingId(null);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!createNom.trim()) {
      setCreateError(t('dashboard.adminScopedCaisse.errNomRequired'));
      return;
    }
    setCreating(true);
    try {
      const r = await fetch('/api/caisse/caisses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: createNom.trim(),
          kind: CaisseKind.GENERAL,
          type: CompteType.BANQUE,
          caisseType,
        }),
      });
      const data = await r.json();
      if (data.success) {
        setSuccess(t('dashboard.adminScopedCaisse.successCreate'));
        setCreateOpen(false);
        setCreateNom('');
        void reload();
      } else {
        setCreateError(data.error || t('common.error'));
      }
    } catch {
      setCreateError(t('common.errorNetwork'));
    } finally {
      setCreating(false);
    }
  };

  const general = useMemo(
    () =>
      rows.find(
        (c) =>
          c.kind === CaisseKind.GENERAL && c.type === CompteType.GENERAL
      ),
    [rows]
  );
  /** Tous les comptes bancaires du domaine (Banque_Transit
   *  + BMP, BMI, BMCI, etc. créés par l'admin). */
  const banques = useMemo(
    () => rows.filter((c) => c.type === CompteType.BANQUE),
    [rows]
  );

  const userCaisses = useMemo(
    () => rows.filter((c) => c.kind === CaisseKind.USER),
    [rows]
  );

  const userCaisseColumns = useMemo<ColumnDef<ICaisseListItem>[]>(
    () => [
      {
        id: 'nom',
        header: t('dashboard.caisses.colName'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.nom}</div>
            {row.original.payeur && (
              <div className="text-xs text-muted-foreground">
                {row.original.payeur.email}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'kind',
        header: t('dashboard.caisses.colKind'),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.kind}</Badge>
        ),
      },
      {
        id: 'solde',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: t('dashboard.caisses.colSolde'),
        cell: ({ row }) => (
          <span className="font-semibold tabular-nums">
            {fmt(Number(row.original.solde) || 0)} {t('common.mru')}
          </span>
        ),
      },
      {
        id: 'actions',
        meta: { align: 'right' } satisfies DataTableColumnMeta,
        header: '',
        cell: ({ row }) => (
          <div className="flex gap-1.5 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={() => openSetSolde(row.original)}
            >
              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
              {t('dashboard.adminScopedCaisse.btnSetSolde', 'Modifier solde')}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`${detailBase}/${row.original._id}`}>
                <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                {t('actions.view')}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t]
  );

  const titleKey = 'dashboard.adminScopedCaisse.titleTransit';
  const subtitleKey = 'dashboard.adminScopedCaisse.subtitleTransit';

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t(titleKey)} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t(titleKey)}
        subtitle={t(subtitleKey)}
        actions={
          <Button
            onClick={() => {
              setCreateError(null);
              setCreateNom('');
              setCreateOpen(true);
            }}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {t('dashboard.adminScopedCaisse.newAccountBtn')}
            </span>
            <span className="sm:hidden">
              {t('dashboard.adminScopedCaisse.newAccountShort')}
            </span>
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
        {success && (
          <Alert className="mb-4">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Caisse générale */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.adminScopedCaisse.generalCaisse')}
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {general ? (
              <>
                <div className="text-2xl font-bold tabular-nums">
                  {fmt(Number(general.solde) || 0)} {t('common.mru')}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{general.nom}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => openSoldeDialog(general)}
                  >
                    <Coins className="mr-1.5 h-3.5 w-3.5" />
                    {t('dashboard.adminScopedCaisse.addSoldeBtn')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openTransferDialog(general)}
                  >
                    <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                    {t('dashboard.adminScopedCaisse.btnTransfer')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openSetSolde(general)}
                  >
                    <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                    {t('dashboard.adminScopedCaisse.btnSetSolde', 'Modifier solde')}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${detailBase}/${general._id}`}>
                      <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                      {t('dashboard.adminScopedCaisse.viewOperations')}
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('dashboard.adminScopedCaisse.notCreated')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Comptes bancaires du domaine (Banque_X par défaut + comptes ajoutés) */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.adminScopedCaisse.bankAccounts')}
              <Badge variant="secondary" className="ml-1">
                {banques.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {banques.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.adminScopedCaisse.noBankYet')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {banques.map((c) => {
                  const isPending = c.statut === 'EN_ATTENTE';
                  return (
                    <div
                      key={c._id}
                      className={
                        isPending
                          ? 'rounded-md border border-amber-300 bg-amber-50/40 p-3 transition-colors'
                          : 'rounded-md border bg-card p-3 transition-colors'
                      }
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium">{c.nom}</span>
                        {isPending ? (
                          <Badge className="text-[10px] bg-amber-500 text-white hover:bg-amber-500">
                            En attente
                          </Badge>
                        ) : c.isDefaultBanque ? (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            {t('dashboard.adminScopedCaisse.defaultBanqueTag')}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="font-semibold tabular-nums mb-2">
                        {fmt(Number(c.solde) || 0)} {t('common.mru')}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {isPending ? (
                          isAdminTransitOrSuper ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => void validerCompte(c._id)}
                              >
                                <ShieldCheck className="mr-1 h-3 w-3" />
                                Valider
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                onClick={() => void rejeterCompte(c._id, c.nom)}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Rejeter
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              En attente de validation admin
                            </span>
                          )
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 text-xs"
                              onClick={() => openSoldeDialog(c)}
                            >
                              <Coins className="mr-1 h-3 w-3" />
                              {t('dashboard.adminScopedCaisse.addSoldeBtn')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => openTransferDialog(c)}
                            >
                              <ArrowRightLeft className="mr-1 h-3 w-3" />
                              {t('dashboard.adminScopedCaisse.btnTransfer')}
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                            >
                              <Link href={`${detailBase}/${c._id}`}>
                                <Eye className="mr-1 h-3 w-3 rtl:rotate-180" />
                                {t('actions.view')}
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mouvements en attente de validation */}
        {pending.length > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Mouvements en attente
                <Badge className="ml-1 bg-amber-500 text-white hover:bg-amber-500">
                  {pending.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pending.map((p) => (
                  <div
                    key={p._id}
                    className="rounded-md border bg-white p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {p.kind === 'TRANSFER'
                            ? `${p.sourceCaisseNom} → ${p.destinationCaisseNom}`
                            : `${p.kind === 'CREDIT' ? '+' : '−'} ${p.sourceCaisseNom}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.description}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {new Date(p.date).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <div className="text-base font-bold tabular-nums">
                        {fmt(p.montant)} {t('common.mru')}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.recuUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                `/api/documents/${encodeURIComponent(p.recuUrl as string)}`,
                                { credentials: 'include' }
                              );
                              const data = await res.json();
                              if (data.success && data.url) {
                                window.open(data.url, '_blank', 'noopener');
                              } else {
                                setError(data.error || 'Image introuvable');
                              }
                            } catch {
                              setError(t('common.errorNetwork'));
                            }
                          }}
                        >
                          <Eye className="mr-1 h-3 w-3" />
                          Voir image
                        </Button>
                      )}
                      {isAdminTransitOrSuper && (
                        <>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                            disabled={actingPendingId === p._id}
                            onClick={() => void validerPending(p._id)}
                          >
                            {actingPendingId === p._id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-1 h-3 w-3" />
                            )}
                            Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            disabled={actingPendingId === p._id}
                            onClick={() => void rejeterPending(p._id)}
                          >
                            {actingPendingId === p._id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <XCircle className="mr-1 h-3 w-3" />
                            )}
                            Rejeter
                          </Button>
                        </>
                      )}
                      {isAgentTransit && (
                        <Badge variant="outline" className="text-[10px]">
                          En attente
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Caisses utilisateurs (payeurs / chauffeurs / véhicules) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              {t('dashboard.adminScopedCaisse.userCaissesTransit')}
              <Badge variant="secondary" className="ml-1">
                {userCaisses.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userCaisses.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-8 w-8" />}
                title={t('dashboard.adminScopedCaisse.noUserCaisse')}
              />
            ) : (
              <ResponsiveTableArea
                table={
                  <DataTable columns={userCaisseColumns} data={userCaisses} />
                }
                mobileList={
                  <div className="space-y-3">
                    {userCaisses.map((c) => (
                      <MobileEntityCard
                        key={c._id}
                        title={c.nom}
                        subtitle={c.payeur?.email || c.kind}
                        fields={[
                          {
                            label: t('dashboard.caisses.colKind'),
                            value: c.kind,
                          },
                          {
                            label: t('dashboard.caisses.colSolde'),
                            value: `${fmt(Number(c.solde) || 0)} ${t('common.mru')}`,
                          },
                        ]}
                        actions={
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              onClick={() => openSetSolde(c)}
                            >
                              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                              {t('dashboard.adminScopedCaisse.btnSetSolde', 'Modifier solde')}
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`${detailBase}/${c._id}`}>
                                <Eye className="mr-1.5 h-3.5 w-3.5 rtl:rotate-180" />
                                {t('actions.view')}
                              </Link>
                            </Button>
                          </div>
                        }
                      />
                    ))}
                  </div>
                }
              />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Dialog : nouveau compte bancaire (BMP / BMI / BMCI / …) du domaine */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.adminScopedCaisse.newAccountDialogTitle')}
            </DialogTitle>
          </DialogHeader>
          {createError && (
            <Alert variant="destructive">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="bank-nom">
                {t('dashboard.adminScopedCaisse.bankNomLabel')} *
              </Label>
              <Input
                id="bank-nom"
                value={createNom}
                onChange={(e) => setCreateNom(e.target.value)}
                placeholder={t(
                  'dashboard.adminScopedCaisse.bankNomPlaceholder',
                  'Ex : BMP, BMI, BMCI, BCI, …'
                )}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t('dashboard.adminScopedCaisse.bankCreateHint', {
                  domaine: 'Transit',
                })}
              </p>
            </div>
            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="w-full sm:w-auto"
              >
                {creating
                  ? t('actions.loading')
                  : t('dashboard.adminScopedCaisse.createBtn')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog : ajouter du solde sur un compte (caisse générale ou banque). */}
      <Dialog
        open={!!soldeRow}
        onOpenChange={(o) => {
          if (!o) setSoldeRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.adminScopedCaisse.addSoldeDialogTitle')}
            </DialogTitle>
          </DialogHeader>
          {soldeError && (
            <Alert variant="destructive">
              <AlertDescription>{soldeError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submitSolde} className="space-y-3">
            {soldeRow && (
              <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{soldeRow.nom}</div>
                <div>
                  {t('dashboard.caisses.colSolde')} :{' '}
                  <span className="tabular-nums font-medium">
                    {fmt(Number(soldeRow.solde) || 0)} {t('common.mru')}
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="solde-montant">
                {t('dashboard.adminScopedCaisse.soldeMontantLabel')} *
              </Label>
              <Input
                id="solde-montant"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={soldeMontant}
                onChange={(e) => setSoldeMontant(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="solde-desc">
                {t('dashboard.adminScopedCaisse.soldeDescLabel')} *
              </Label>
              <Input
                id="solde-desc"
                value={soldeDesc}
                onChange={(e) => setSoldeDesc(e.target.value)}
                placeholder={t('dashboard.adminScopedCaisse.soldeDescPlaceholder')}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="solde-date">
                {t('dashboard.adminScopedCaisse.soldeDateLabel')} *
              </Label>
              <Input
                id="solde-date"
                type="date"
                value={soldeDate}
                onChange={(e) => setSoldeDate(e.target.value)}
                required
              />
            </div>
            {isAgentTransit && (
              <div className="grid gap-2">
                <Label htmlFor="solde-file">
                  {t('dashboard.adminScopedCaisse.labelJustificatif')} *
                </Label>
                <Input
                  id="solde-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setSoldeFile(e.target.files?.[0] || null)}
                  required
                />
                {soldeFile && (
                  <span className="text-xs text-muted-foreground truncate">
                    {soldeFile.name}
                  </span>
                )}
              </div>
            )}
            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={soldeSubmitting}
                onClick={() => setSoldeRow(null)}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={soldeSubmitting}
                className="w-full sm:w-auto"
              >
                {soldeSubmitting
                  ? t('actions.loading')
                  : t('dashboard.adminScopedCaisse.addSoldeBtn')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog : modifier le solde d'une caisse utilisateur (correction directe) */}
      <Dialog
        open={!!corrRow}
        onOpenChange={(o) => {
          if (!o) setCorrRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.adminScopedCaisse.setSoldeDialogTitle', 'Modifier le solde')}
            </DialogTitle>
          </DialogHeader>
          {corrError && (
            <Alert variant="destructive">
              <AlertDescription>{corrError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={submitSetSolde} className="space-y-3">
            {corrRow && (
              <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{corrRow.nom}</div>
                <div>
                  {t('dashboard.caisses.colSolde')} :{' '}
                  <span className="tabular-nums font-medium">
                    {fmt(Number(corrRow.solde) || 0)} {t('common.mru')}
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="set-solde-value">
                {t('dashboard.adminScopedCaisse.setSoldeNewLabel', 'Nouveau solde')} ({t('common.mru')}) *
              </Label>
              <Input
                id="set-solde-value"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={corrSolde}
                onChange={(e) => setCorrSolde(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="set-solde-desc">
                {t('dashboard.adminScopedCaisse.setSoldeDescLabel', 'Description')}
              </Label>
              <Input
                id="set-solde-desc"
                value={corrDesc}
                onChange={(e) => setCorrDesc(e.target.value)}
                placeholder={t('dashboard.adminScopedCaisse.setSoldeDescPlaceholder', 'Correction manuelle de solde')}
              />
            </div>
            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={submittingCorr}
                onClick={() => setCorrRow(null)}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submittingCorr}
                className="w-full sm:w-auto"
              >
                {submittingCorr
                  ? t('actions.loading')
                  : t('dashboard.adminScopedCaisse.setSoldeBtn', 'Appliquer')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog : transfert entre comptes */}
      <Dialog
        open={!!transferSource}
        onOpenChange={(o) => {
          if (!o) setTransferSource(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('dashboard.adminScopedCaisse.transfer.dialogTitle', { nom: transferSource?.nom })}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitTransfer} className="space-y-3">
            {transferError && (
              <Alert variant="destructive">
                <AlertDescription>{transferError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>{t('dashboard.adminScopedCaisse.transfer.labelSource')}</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">{transferSource?.nom}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {t('dashboard.adminScopedCaisse.transfer.labelSolde')} {fmt(Number(transferSource?.solde) || 0)}{' '}
                  {t('common.mru')}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('dashboard.adminScopedCaisse.transfer.labelDestType')} *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={
                    transferDestKind === 'BANQUE' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => {
                    setTransferDestKind('BANQUE');
                    setTransferClientId('');
                  }}
                  className="flex-1"
                >
                  {t('dashboard.adminScopedCaisse.transfer.btnBanque')}
                </Button>
                <Button
                  type="button"
                  variant={
                    transferDestKind === 'CLIENT' ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() => {
                    setTransferDestKind('CLIENT');
                    setTransferDestId('');
                  }}
                  className="flex-1"
                >
                  {t('dashboard.adminScopedCaisse.transfer.btnClient')}
                </Button>
              </div>
            </div>
            {transferDestKind === 'BANQUE' ? (
              <div className="space-y-1.5">
                <Label htmlFor="transfer-dest">{t('dashboard.adminScopedCaisse.transfer.labelDest')} *</Label>
                <Select
                  value={transferDestId || undefined}
                  onValueChange={(v) => setTransferDestId(v)}
                >
                  <SelectTrigger id="transfer-dest" className="w-full">
                    <SelectValue placeholder={t('dashboard.adminScopedCaisse.transfer.selectAccountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {[
                      ...(general && general._id !== transferSource?._id
                        ? [general]
                        : []),
                      ...banques.filter((b) => b._id !== transferSource?._id),
                    ].map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.nom} · {fmt(Number(c.solde) || 0)} {t('common.mru')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="transfer-client">{t('dashboard.adminScopedCaisse.transfer.labelClientDest')} *</Label>
                <Select
                  value={transferClientId || undefined}
                  onValueChange={(v) => setTransferClientId(v)}
                >
                  <SelectTrigger id="transfer-client" className="w-full">
                    <SelectValue placeholder={t('dashboard.adminScopedCaisse.transfer.selectClientPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[60vh]">
                    {clientOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {t('dashboard.adminScopedCaisse.transfer.noClientAvailable')}
                      </div>
                    ) : (
                      clientOptions.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.nom}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="transfer-montant">Montant ({t('common.mru')}) *</Label>
              <Input
                id="transfer-montant"
                type="number"
                min="0"
                step="0.01"
                value={transferMontant}
                onChange={(e) => setTransferMontant(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-desc">{t('dashboard.adminScopedCaisse.transfer.labelDesc')}</Label>
              <Input
                id="transfer-desc"
                value={transferDesc}
                onChange={(e) => setTransferDesc(e.target.value)}
                placeholder={t('dashboard.adminScopedCaisse.transfer.descPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-date">{t('dashboard.adminScopedCaisse.transfer.labelDate')}</Label>
              <Input
                id="transfer-date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>
            {isAgentTransit && (
              <div className="space-y-1.5">
                <Label htmlFor="transfer-file">
                  {t('dashboard.adminScopedCaisse.transfer.labelJustificatif')} *
                </Label>
                <Input
                  id="transfer-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) =>
                    setTransferFile(e.target.files?.[0] || null)
                  }
                  required
                />
                {transferFile && (
                  <span className="text-xs text-muted-foreground truncate">
                    {transferFile.name}
                  </span>
                )}
              </div>
            )}
            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={transferSubmitting}
                onClick={() => setTransferSource(null)}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={transferSubmitting}
                className="w-full sm:w-auto"
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {transferSubmitting ? t('actions.loading') : t('dashboard.adminScopedCaisse.transfer.btnSubmit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
