import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MobileEntityCard,
  mobileListEmptyBoxClass,
  ResponsiveTableArea,
} from '@/components/ui/mobile-entity-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ITransaction, TransactionType, UserRole } from '@/types';
import {
  ArrowLeft,
  Eye,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Search,
  CalendarRange,
  RefreshCcw,
  X as XIcon,
} from 'lucide-react';

function getTypeLabel(type: TransactionType, t: (key: string) => string): string {
  return type === TransactionType.CREDIT
    ? t('components.caissePanel.typeCredit')
    : t('components.caissePanel.typeDebit');
}

function isRecentForEdit(createdAt: string | Date | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return (Date.now() - t) / (1000 * 60 * 60) <= 24;
}

function isMongoObjectIdString(s: string): boolean {
  return /^[a-f\d]{24}$/i.test(s.trim());
}

function ReferenceCell({ reference, paiementId }: { reference: string; paiementId?: string }) {
  const { t } = useTranslation();
  const ref = reference.trim();

  // Page détails paiement caissier supprimée — on affiche juste l'identifiant.
  if (paiementId && isMongoObjectIdString(paiementId)) {
    return (
        <span className="text-sm font-mono break-all" title={t('components.caissePanel.paymentId')}>
        {paiementId}
      </span>
    );
  }

  // Référence = URL/chemin reçu → lien de téléchargement
  if (ref.startsWith('recus/') || ref.startsWith('http')) {
    const href = ref.startsWith('http') ? ref : `/api/documents?key=${encodeURIComponent(ref)}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80 text-sm font-medium"
      >
          {t('components.caissePanel.viewReceipt')}
      </a>
    );
  }

  // Référence = ObjectId sans contexte connu → afficher comme texte
  if (isMongoObjectIdString(ref)) {
    return <span className="text-muted-foreground text-sm font-mono text-xs">{ref.slice(-8)}…</span>;
  }

  return <span className="text-muted-foreground text-sm">{reference}</span>;
}

export interface CaisseTransactionsPanelProps {
  caisseId: string;
  title: string;
  subtitle?: string;
  summary?: React.ReactNode;
  backHref?: string;
  /** Payeur connecté : peut saisir sur cette caisse uniquement */
  isPayeurOwnCaisse?: boolean;
  /** Masquer le bouton retour (ex. iframe) */
  hideBack?: boolean;
  /** Masquer le bloc titre/sous-titre (ex. page avec PageHeader) */
  hidePanelHeading?: boolean;
}

export default function CaisseTransactionsPanel({
  caisseId,
  title,
  subtitle,
  summary,
  backHref = '/dashboard/caisses',
  isPayeurOwnCaisse = false,
  hideBack = false,
  hidePanelHeading = false,
}: CaisseTransactionsPanelProps) {
  const { data: session } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const isStaff =
    user?.role === UserRole.ADMIN || user?.role === UserRole.COMPTABLE;
  const canMutate = isStaff || isPayeurOwnCaisse;

  const todayIso = useCallback(() => new Date().toISOString().slice(0, 10), []);
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Filtre date — par défaut sur aujourd'hui pour ne montrer que les opérations du jour.
  const [dateDebut, setDateDebut] = useState<string>(() => todayIso());
  const [dateFin, setDateFin] = useState<string>(() => todayIso());
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ITransaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ITransaction | null>(null);
  const [creditOnlyMode, setCreditOnlyMode] = useState(false);
  const [viewTarget, setViewTarget] = useState<ITransaction | null>(null);
  const [linkedTarget, setLinkedTarget] = useState<ITransaction | null>(null);
  const [linkedTransactions, setLinkedTransactions] = useState<ITransaction[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);

  const [formType, setFormType] = useState<TransactionType>(TransactionType.CREDIT);
  const [formMontant, setFormMontant] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formReference, setFormReference] = useState('');

  const limit = 15;

  const fetchTransactions = useCallback(async () => {
    if (!caisseId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        caisseId,
      });
      if (search.trim()) params.set('search', search.trim());
      // Filtre date : on étend dateFin à 23:59:59 pour inclure toute la journée.
      if (dateDebut) {
        params.set('dateDebut', new Date(`${dateDebut}T00:00:00`).toISOString());
      }
      if (dateFin) {
        params.set('dateFin', new Date(`${dateFin}T23:59:59.999`).toISOString());
      }
      const res = await fetch(`/api/caisse/transactions?${params}`, {
        credentials: 'include',
      });
      const json = await res.json();
        if (!json.success) {
          setError(json.error || t('components.caissePanel.loadFailed'));
        setTransactions([]);
        return;
      }
      setTransactions(json.data.data);
      setTotalPages(json.data.totalPages || 1);
    } catch {
      setError(t('common.errorNetwork'));
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [caisseId, page, search, dateDebut, dateFin, t]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const openCreate = (creditOnly = false) => {
    setEditing(null);
    setCreditOnlyMode(creditOnly);
    setFormType(TransactionType.CREDIT);
    setFormMontant('');
    setFormDescription(creditOnly ? t('dashboard.caisses.addSoldeDefault') : '');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormReference('');
    setDialogOpen(true);
    setError(null);
  };

  const openEdit = (tx: ITransaction) => {
    if (tx.mirrorSourceId) return;
    setEditing(tx);
    setCreditOnlyMode(false);
    setFormType(tx.type);
    setFormMontant(String(tx.montant));
    setFormDescription(tx.description);
    setFormDate(new Date(tx.date).toISOString().slice(0, 10));
    setFormReference(tx.reference || '');
    setDialogOpen(true);
    setError(null);
  };

  const transactionTypeBadges = (tx: ITransaction) => (
    <div className="flex flex-wrap items-center gap-1">
      <Badge
        variant={tx.type === TransactionType.CREDIT ? 'default' : 'secondary'}
      >
        {getTypeLabel(tx.type, t as (key: string) => string)}
      </Badge>
    </div>
  );

  const openLinkedOperations = async (tx: ITransaction) => {
    setLinkedTarget(tx);
    setLinkedTransactions([]);
    setLinkedLoading(true);
    setError(null);
    try {
      if (!tx.sourcePaiementId) {
        setLinkedLoading(false);
        return;
      }
      const params = new URLSearchParams({
        caisseId,
        sourcePaiementId: tx.sourcePaiementId,
        limit: '50',
      });
      const res = await fetch(`/api/caisse/transactions?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();
        if (!json.success) {
          setError(json.error || t('components.caissePanel.loadFailed'));
        setLinkedTransactions([]);
        return;
      }
      setLinkedTransactions(json.data.data || []);
    } catch {
      setError(t('common.errorNetwork'));
      setLinkedTransactions([]);
    } finally {
      setLinkedLoading(false);
    }
  };

  function renderTransactionActions(tx: ITransaction) {
    const recent = isRecentForEdit(tx.createdAt);
    const isMirror = Boolean(tx.mirrorSourceId);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <span className="sr-only">{t('common.openMenu')}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setViewTarget(tx)}>
            <Eye className="mr-2 h-4 w-4" />
              {t('actions.view')}
          </DropdownMenuItem>
          <DropdownMenuItem
              disabled={!tx.sourcePaiementId}
            onSelect={() => {
                if (!tx.sourcePaiementId) return;
                void openLinkedOperations(tx);
            }}
          >
            <Link2 className="mr-2 h-4 w-4" />
              {t('components.caissePanel.linkedTitle')}
          </DropdownMenuItem>
          {canMutate ? <DropdownMenuSeparator /> : null}
          {canMutate ? (
          <DropdownMenuItem
            disabled={!recent || isMirror}
            onSelect={() => {
              if (!recent || isMirror) return;
                openEdit(tx);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
              {t('actions.edit')}
          </DropdownMenuItem>
          ) : null}
          {canMutate ? <DropdownMenuSeparator /> : null}
          {canMutate ? (
          <DropdownMenuItem
            disabled={!recent}
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              if (!recent) return;
              setError(null);
                setDeleteTarget(tx);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
              {t('actions.delete')}
          </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const submitForm = async () => {
    setError(null);
    const montant = parseFloat(formMontant.replace(',', '.'));
    if (!formDescription.trim() || Number.isNaN(montant) || montant <= 0) {
      setError(t('components.caissePanel.errMontantDescriptionRequired'));
      return;
    }

    const body: Record<string, unknown> = {
      caisseId,
      type: creditOnlyMode ? TransactionType.CREDIT : formType,
      montant,
      description: formDescription.trim(),
      date: formDate ? new Date(formDate).toISOString() : new Date().toISOString(),
      reference: formReference.trim() || undefined,
    };

    try {
      const url = editing
        ? `/api/caisse/transactions/${editing._id}`
        : '/api/caisse/transactions';
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? {
                type: body.type,
                montant: body.montant,
                description: body.description,
                date: body.date,
                reference: body.reference,
              }
            : body
        ),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('components.caissePanel.saveRejected'));
        return;
      }
      setDialogOpen(false);
      void fetchTransactions();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      const res = await fetch(`/api/caisse/transactions/${deleteTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('components.caissePanel.deleteRejected'));
        return;
      }
      setDeleteTarget(null);
      void fetchTransactions();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  return (
    <div className="space-y-6 bg-white p-4 rounded-lg border shadow-sm">
      {(!hidePanelHeading || canMutate) && (
        <div
          className={`flex flex-col gap-4 sm:flex-row sm:items-center ${
            hidePanelHeading ? 'sm:justify-end' : 'sm:justify-between'
          }`}
        >
          {!hidePanelHeading ? (
            <div className="flex items-start gap-4">
              <div>
                <h1 className="text-xl font-bold text-primary">{title}</h1>
                {subtitle ? (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                ) : null}
              </div>
            </div>
          ) : null}
          {canMutate && (
            <Button onClick={() => openCreate(false)}>
              <Plus className="h-4 w-4 mr-2" />
                {t('components.caissePanel.newOperation')}
            </Button>
          )}
        </div>
      )}

      {error && !dialogOpen && !deleteTarget && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary}

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t('components.caissePanel.operationsTitle')}</CardTitle>
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => void fetchTransactions()}
              aria-label={t('actions.refresh')}
              className="shrink-0"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Toolbar filtres : stack mobile, ligne desktop */}
          <div className="space-y-2">
            {/* Recherche pleine largeur */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('components.caissePanel.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput.trim());
                    setPage(1);
                  }
                }}
                className="pl-9 pr-9 w-full"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                  aria-label={t('components.combobox.clear')}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Dates : grid 2 cols mobile, inline desktop */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
                <CalendarRange className="h-3.5 w-3.5" />
                {t('components.caissePanel.period')}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="date-debut"
                    className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden"
                  >
                    {t('components.caissePanel.from')}
                  </label>
                  <Input
                    id="date-debut"
                    type="date"
                    value={dateDebut}
                    onChange={(e) => {
                      setDateDebut(e.target.value);
                      setPage(1);
                    }}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="date-fin"
                    className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden"
                  >
                    {t('components.caissePanel.to')}
                  </label>
                  <Input
                    id="date-fin"
                    type="date"
                    value={dateFin}
                    onChange={(e) => {
                      setDateFin(e.target.value);
                      setPage(1);
                    }}
                    className="w-full sm:w-40"
                  />
                </div>
              </div>
              {/* Raccourcis dates */}
              <div className="flex gap-2">
                <Button
                  variant={
                    dateDebut === todayIso() && dateFin === todayIso()
                      ? 'default'
                      : 'ghost'
                  }
                  size="sm"
                  type="button"
                  onClick={() => {
                    const t = todayIso();
                    setDateDebut(t);
                    setDateFin(t);
                    setPage(1);
                  }}
                  className="flex-1 sm:flex-none"
                >
                  {t('components.caissePanel.today')}
                </Button>
                <Button
                  variant={!dateDebut && !dateFin ? 'default' : 'ghost'}
                  size="sm"
                  type="button"
                  onClick={() => {
                    setDateDebut('');
                    setDateFin('');
                    setPage(1);
                  }}
                  className="flex-1 sm:flex-none"
                >
                  {t('components.caissePanel.all')}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              <ResponsiveTableArea
                className="px-0"
                table={
                  <Table>
                    <TableHeader>
                      <TableRow>
                          <TableHead>{t('components.caissePanel.colDate')}</TableHead>
                          <TableHead>{t('components.caissePanel.colType')}</TableHead>
                          <TableHead className="text-right">{t('components.caissePanel.colMontant')}</TableHead>
                          <TableHead>{t('components.caissePanel.colDescription')}</TableHead>
                          <TableHead>{t('components.caissePanel.colReference')}</TableHead>
                          <TableHead className="text-right">{t('components.caissePanel.colActions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            {t('components.caissePanel.noOperations')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((tx) => (
                          <TableRow key={tx._id}>
                            <TableCell>
                              {new Date(tx.date).toLocaleDateString('fr-FR')}
                            </TableCell>
                            <TableCell>{transactionTypeBadges(tx)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {tx.montant.toLocaleString('fr-FR')}
                            </TableCell>
                            <TableCell className="max-w-[260px]" title={tx.description}>
                              <div className="truncate">{tx.description}</div>
                              {tx.caisseKind === 'USER' && tx.caisseNom && (
                                <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                                  Payeur · {tx.caisseNom}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="align-top">
                              {tx.reference ? (
                                <ReferenceCell reference={tx.reference} paiementId={tx.sourcePaiementId} />
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {renderTransactionActions(tx)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                }
                mobileList={
                  transactions.length === 0 ? (
                    <div className={mobileListEmptyBoxClass}>
                        {t('components.caissePanel.noOperations')}
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <MobileEntityCard
                        key={tx._id}
                        title={new Date(tx.date).toLocaleDateString('fr-FR')}
                        subtitle={transactionTypeBadges(tx)}
                        fields={[
                          {
                              label: t('components.caissePanel.colMontant'),
                            value: (
                              <span className="font-medium tabular-nums">
                                {tx.montant.toLocaleString('fr-FR')}
                              </span>
                            ),
                          },
                          {
                              label: t('components.caissePanel.colDescription'),
                            value: <span className="break-words">{tx.description}</span>,
                          },
                          {
                              label: t('components.caissePanel.colReference'),
                            value: tx.reference ? (
                              <ReferenceCell reference={tx.reference} paiementId={tx.sourcePaiementId} />
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            ),
                          },
                        ]}
                        actions={renderTransactionActions(tx)}
                      />
                    ))
                  )
                }
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                      {t('components.caissePanel.pageLabel', { page, totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        {t('components.caissePanel.prev')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                        {t('components.caissePanel.next')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('components.caissePanel.editOperation')
                : creditOnlyMode
                  ? t('dashboard.caisses.addSolde')
                  : t('components.caissePanel.addOperation')}
            </DialogTitle>
          </DialogHeader>
          {error && dialogOpen && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 py-2">
            {!creditOnlyMode && (
              <div className="grid gap-2">
                  <Label>{t('components.caissePanel.colType')}</Label>
                <Select
                  value={formType}
                  onValueChange={(v) => setFormType(v as TransactionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value={TransactionType.CREDIT}>{t('components.caissePanel.typeCreditIn')}</SelectItem>
                      <SelectItem value={TransactionType.DEBIT}>{t('components.caissePanel.typeDebitOut')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
                <Label htmlFor="montant">{t('components.caissePanel.colMontant')}</Label>
              <Input
                id="montant"
                type="text"
                inputMode="decimal"
                value={formMontant}
                onChange={(e) => setFormMontant(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="desc">{t('components.caissePanel.colDescription')}</Label>
              <Textarea
                id="desc"
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="d">{t('components.caissePanel.colDate')}</Label>
              <Input
                id="d"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="ref">{t('components.caissePanel.referenceOptional')}</Label>
              <Input
                id="ref"
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('actions.cancel')}
            </Button>
              <Button onClick={() => void submitForm()}>{t('actions.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('components.caissePanel.deleteTitle')}</DialogTitle>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
              {t('components.caissePanel.deleteHint')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {t('actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
                {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('components.caissePanel.detailTitle')}</DialogTitle>
          </DialogHeader>
          {viewTarget ? (
            <div className="grid gap-3 py-2 text-sm">
              <div>
                  <span className="font-medium">{t('components.caissePanel.colDate')}:</span>{' '}
                {new Date(viewTarget.date).toLocaleString('fr-FR')}
              </div>
              <div>
                  <span className="font-medium">{t('components.caissePanel.colType')}:</span> {getTypeLabel(viewTarget.type, t as (key: string) => string)}
              </div>
              <div>
                  <span className="font-medium">{t('components.caissePanel.colMontant')}:</span>{' '}
                {viewTarget.montant.toLocaleString('fr-FR')} MRU
              </div>
              <div>
                  <span className="font-medium">{t('components.caissePanel.colDescription')}:</span> {viewTarget.description}
              </div>
              <div className="flex items-start gap-1">
                  <span className="font-medium shrink-0">{t('components.caissePanel.colReference')}:</span>{' '}
                <ReferenceCell reference={viewTarget.reference || ''} paiementId={viewTarget.sourcePaiementId} />
              </div>
              <div className="flex items-start gap-1">
                  <span className="font-medium shrink-0">{t('components.caissePanel.linkedSource')}:</span>{' '}
                {viewTarget.sourcePaiementId ? (
                  <span className="text-sm font-mono break-all">
                    {viewTarget.sourcePaiementId}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewTarget(null)}>
                {t('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkedTarget} onOpenChange={(o) => !o && setLinkedTarget(null)}>
        <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('components.caissePanel.linkedTitle')}</DialogTitle>
          </DialogHeader>
          {linkedLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
                {t('actions.loading')}
            </div>
          ) : linkedTransactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
                {t('components.caissePanel.noLinkedOperations')}
            </div>
          ) : (
            <div className="space-y-3">
              {linkedTransactions.map((tx) => (
                <div key={tx._id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {new Date(tx.date).toLocaleDateString('fr-FR')}
                    </span>
                    {transactionTypeBadges(tx)}
                  </div>
                  <p className="mt-2">{tx.description}</p>
                  <p className="mt-1 text-muted-foreground">
                    {tx.montant.toLocaleString('fr-FR')} MRU
                    {tx.reference ? ` · ${tx.reference}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkedTarget(null)}>
                {t('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
