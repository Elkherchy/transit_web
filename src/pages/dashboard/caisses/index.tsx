import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CaissesDataTable } from '@/components/dashboard/caisses/data-table';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader, PageContent, PageSkeleton, DatePicker } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  CaisseKind,
  CompteType,
  ICaisseListItem,
  TransactionType,
  UserRole,
} from '@/types';
import { Plus, Search } from 'lucide-react';
import { CardHeader } from '@/components/ui/card';


export default function CaissesHubPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;

  const isStaff = user?.role === UserRole.ADMIN || user?.role === UserRole.COMPTABLE;

  const [rows, setRows] = useState<ICaisseListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createNom, setCreateNom] = useState('');
  const [createType, setCreateType] = useState<CompteType>(CompteType.CAISSE);

  const [renameRow, setRenameRow] = useState<ICaisseListItem | null>(null);
  const [renameNom, setRenameNom] = useState('');

  const [deactivateRow, setDeactivateRow] = useState<ICaisseListItem | null>(null);

  const [quickRow, setQuickRow] = useState<ICaisseListItem | null>(null);
  const [quickMode, setQuickMode] = useState<'solde' | 'mouvement' | null>(null);
  const [quickMontant, setQuickMontant] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickType, setQuickType] = useState<TransactionType>(TransactionType.CREDIT);
  const [quickDate, setQuickDate] = useState('');

  const fetchCaisses = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/caisse/caisses', { credentials: 'include' });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('common.error'));
        setRows([]);
        return;
      }
      setRows(json.data);
    } catch {
      setError(t('common.errorNetwork'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isStaff, t]);

  useEffect(() => {
    if (status !== 'loading' && user?.role === UserRole.USER_PAYEUR) {
      void router.replace('/dashboard/caisses/mine');
    }
  }, [status, user, router]);

  useEffect(() => {
    void fetchCaisses();
  }, [fetchCaisses]);

  const submitCreate = async () => {
    setError(null);
    if (!createNom.trim()) {
      setError(t('dashboard.caisses.errNomRequis'));
      return;
    }
    try {
      const res = await fetch('/api/caisse/caisses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: createNom.trim(),
          kind: CaisseKind.GENERAL,
          type: createType,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.caisses.errCreationRefusee'));
        return;
      }
      setCreateOpen(false);
      setCreateNom('');
      setCreateType(CompteType.CAISSE);
      void fetchCaisses();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const submitRename = async () => {
    if (!renameRow || !renameNom.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/caisse/caisses/${renameRow._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: renameNom.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.caisses.errEchec'));
        return;
      }
      setRenameRow(null);
      void fetchCaisses();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const submitDeactivate = async () => {
    if (!deactivateRow) return;
    setError(null);
    try {
      const res = await fetch(`/api/caisse/caisses/${deactivateRow._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.caisses.errEchec'));
        return;
      }
      setDeactivateRow(null);
      void fetchCaisses();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const openQuick = useCallback((row: ICaisseListItem, mode: 'solde' | 'mouvement') => {
    setQuickRow(row);
    setQuickMode(mode);
    setQuickMontant('');
    setQuickDesc(mode === 'solde' ? t('dashboard.caisses.addSoldeDefault') : '');
    setQuickType(TransactionType.CREDIT);
    setQuickDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }, [t]);

  const handleRenameCaisse = useCallback((row: ICaisseListItem) => {
    setRenameRow(row);
    setRenameNom(row.nom);
    setError(null);
  }, []);

  const handleDeactivateRequest = useCallback((row: ICaisseListItem) => {
    setDeactivateRow(row);
    setError(null);
  }, []);

  const submitQuick = async () => {
    if (!quickRow || !quickMode) return;
    const m = parseFloat(quickMontant.replace(',', '.'));
    if (Number.isNaN(m) || m <= 0 || !quickDesc.trim()) {
      setError(t('dashboard.caisses.errMontantDescRequis'));
      return;
    }
    setError(null);
    try {
      const res = await fetch('/api/caisse/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caisseId: quickRow._id,
          type: quickMode === 'solde' ? TransactionType.CREDIT : quickType,
          montant: m,
          description: quickDesc.trim(),
          date: quickDate ? new Date(quickDate).toISOString() : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || t('dashboard.caisses.errRefuse'));
        return;
      }
      setQuickRow(null);
      setQuickMode(null);
      void fetchCaisses();
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  if (status === 'loading' || !user) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisses.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isStaff) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caisses.title')} />
        <PageContent>
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.caisses.title')}
        subtitle={t('dashboard.caisses.subtitle')}
        actions={
          <Button onClick={() => setCreateOpen(true)} className={isMobile ? 'h-10 px-3' : ''}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.caisses.createBtn')}</span>
            <span className="sm:hidden">{t('dashboard.caisses.createShort')}</span>
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>

        <div className="space-y-4 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <CardHeader className="text-xl font-bold text-primary p-0">
              {t('dashboard.caisses.list')}
            </CardHeader>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('common.search') || 'Rechercher…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>

          {error && !createOpen && !renameRow && !deactivateRow && !quickRow && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <CaissesDataTable
              data={rows.filter((r) =>
                r.nom.toLowerCase().includes(search.toLowerCase())
              )}
              openQuick={openQuick}
              onRename={handleRenameCaisse}
              onDeactivate={handleDeactivateRequest}
            />
          )}
        </div>
      </PageContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('dashboard.caisses.newCompte')}</DialogTitle>
          </DialogHeader>
          {error && createOpen && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{t('dashboard.caisses.labelNom')}</Label>
              <Input value={createNom} onChange={(e) => setCreateNom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t('dashboard.caisses.labelType')}</Label>
              <Select
                value={createType}
                onValueChange={(v) => setCreateType(v as CompteType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CompteType.GENERAL}>{t('dashboard.caisses.createTypeGeneral')}</SelectItem>
                  <SelectItem value={CompteType.CAISSE}>{t('dashboard.caisses.createTypeCaisse')}</SelectItem>
                  <SelectItem value={CompteType.BANQUE}>{t('dashboard.caisses.createTypeBanque')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitCreate()}>{t('dashboard.caisses.createShort')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameRow} onOpenChange={(o) => !o && setRenameRow(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('dashboard.caisses.renameCompte')}</DialogTitle>
          </DialogHeader>
          <Input value={renameNom} onChange={(e) => setRenameNom(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRow(null)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitRename()}>{t('actions.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateRow} onOpenChange={(o) => !o && setDeactivateRow(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('dashboard.caisses.deactivateConfirm')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.caisses.deactivateHint')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateRow(null)}>
              {t('actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void submitDeactivate()}>
              {t('dashboard.caisses.deactivateBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!quickRow && !!quickMode}
        onOpenChange={(o) => {
          if (!o) {
            setQuickRow(null);
            setQuickMode(null);
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {quickMode === 'solde'
                ? t('dashboard.caisses.addSolde')
                : t('dashboard.caisses.addMouvement')}
              {' '}— {quickRow?.nom}
            </DialogTitle>
          </DialogHeader>
          {error && quickRow && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3">
            {quickMode === 'mouvement' && (
              <div className="grid gap-2">
                <Label>{t('dashboard.caisses.labelType')}</Label>
                <Select
                  value={quickType}
                  onValueChange={(v) => setQuickType(v as TransactionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TransactionType.CREDIT}>{t('dashboard.caisses.creditLabel')}</SelectItem>
                    <SelectItem value={TransactionType.DEBIT}>{t('dashboard.caisses.debitLabel')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{t('dashboard.caisses.labelMontant')}</Label>
              <Input
                inputMode="decimal"
                value={quickMontant}
                onChange={(e) => setQuickMontant(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('dashboard.caisses.labelDescription')}</Label>
              <Input value={quickDesc} onChange={(e) => setQuickDesc(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t('dashboard.caisses.labelDate')}</Label>
              <DatePicker value={quickDate} onChange={setQuickDate} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setQuickRow(null);
                setQuickMode(null);
              }}
            >
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void submitQuick()}>{t('actions.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
