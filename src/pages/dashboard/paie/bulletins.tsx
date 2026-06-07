import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageContent,
  EmptyState,
  PageSkeleton,
  MobilePagination,
} from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  BulletinStatut,
  IBulletinSalaireResponse,
  ISalarieResponse,
  ISalarieLigne,
  IUserResponse,
  UserRole,
} from '@/types';
import { Plus, FileText, Trash2, CheckCircle, Banknote, X } from 'lucide-react';

import { useIsMobile } from '@/hooks/use-mobile';

const STATUT_COLORS: Record<BulletinStatut, string> = {
  [BulletinStatut.BROUILLON]: 'secondary',
  [BulletinStatut.VALIDE]: 'default',
  [BulletinStatut.PAYE]: 'default',
};

function statutBadge(s: BulletinStatut) {
  if (s === BulletinStatut.PAYE) return <Badge className="bg-emerald-600">Paye</Badge>;
  if (s === BulletinStatut.VALIDE) return <Badge className="bg-blue-600">Valide</Badge>;
  return <Badge variant="secondary">Brouillon</Badge>;
}

const MOIS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

function periodeLabel(p: string) {
  const [y, m] = p.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MOIS[idx] ?? m} ${y}`;
}

export default function BulletinsPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<IBulletinSalaireResponse[]>([]);
  const [salaries, setSalaries] = useState<ISalarieResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterPeriode, setFilterPeriode] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payingRow, setPayingRow] = useState<IBulletinSalaireResponse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [fSalarieId, setFSalarieId] = useState('');
  const [fPeriode, setFPeriode] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fSalaireBrut, setFSalaireBrut] = useState('0');
  const [fPrimes, setFPrimes] = useState<ISalarieLigne[]>([]);
  const [fRetenues, setFRetenues] = useState<ISalarieLigne[]>([]);
  const [fNote, setFNote] = useState('');

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.COMPTABLE;
  const limit = isMobile ? 8 : 15;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) void router.replace('/dashboard');
  }, [status, isAllowed, router]);

  // Handle ?statut= from URL
  useEffect(() => {
    if (router.query.statut) setFilterStatut(String(router.query.statut));
  }, [router.query.statut]);

  const fetchRows = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterStatut) params.set('statut', filterStatut);
      if (filterPeriode) params.set('periode', filterPeriode);
      const res = await fetch(`/api/paie/bulletins?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erreur'); setRows([]); return; }
      setRows(json.data?.data || []);
      setTotalPages(json.data?.totalPages || 1);
      setTotalItems(json.data?.total || 0);
    } catch { setError('Erreur reseau'); setRows([]); }
    finally { setLoading(false); }
  }, [isAllowed, page, limit, filterStatut, filterPeriode]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!isAllowed) return;
    void (async () => {
      try {
        const res = await fetch('/api/paie/salaries?limit=200', { credentials: 'include' });
        const json = await res.json();
        if (json.success) setSalaries(json.data?.data || []);
      } catch { setSalaries([]); }
    })();
  }, [isAllowed]);

  const openCreate = useCallback(() => {
    setFSalarieId(''); setFPrimes([]); setFRetenues([]); setFNote('');
    setFSalaireBrut('0');
    const now = new Date();
    setFPeriode(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setError(null);
    setDialogOpen(true);
  }, []);

  // When salarie changes, prefill salaire brut
  useEffect(() => {
    if (fSalarieId) {
      const sal = salaries.find((s) => s._id === fSalarieId);
      if (sal) setFSalaireBrut(String(sal.salaireBrut ?? 0));
    }
  }, [fSalarieId, salaries]);

  const totalPrimes = useMemo(() => fPrimes.reduce((s, l) => s + Number(l.montant || 0), 0), [fPrimes]);
  const totalRetenues = useMemo(() => fRetenues.reduce((s, l) => s + Number(l.montant || 0), 0), [fRetenues]);
  const salaireNet = useMemo(() => Number(fSalaireBrut || 0) + totalPrimes - totalRetenues, [fSalaireBrut, totalPrimes, totalRetenues]);

  const addPrime = useCallback(() => setFPrimes((p) => [...p, { libelle: '', montant: 0 }]), []);
  const removePrime = useCallback((i: number) => setFPrimes((p) => p.filter((_, idx) => idx !== i)), []);
  const updatePrime = useCallback((i: number, field: keyof ISalarieLigne, value: string) => {
    setFPrimes((p) => p.map((l, idx) => idx === i ? { ...l, [field]: field === 'montant' ? Number(value) : value } : l));
  }, []);

  const addRetenue = useCallback(() => setFRetenues((r) => [...r, { libelle: '', montant: 0 }]), []);
  const removeRetenue = useCallback((i: number) => setFRetenues((r) => r.filter((_, idx) => idx !== i)), []);
  const updateRetenue = useCallback((i: number, field: keyof ISalarieLigne, value: string) => {
    setFRetenues((r) => r.map((l, idx) => idx === i ? { ...l, [field]: field === 'montant' ? Number(value) : value } : l));
  }, []);

  const submitCreate = useCallback(async () => {
    setError(null);
    if (!fSalarieId) { setError('Selectionnez un salarie'); return; }
    if (!fPeriode || !/^\d{4}-\d{2}$/.test(fPeriode)) { setError('Periode invalide'); return; }
    try {
      const res = await fetch('/api/paie/bulletins', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salarieId: fSalarieId, periode: fPeriode, salaireBrut: Number(fSalaireBrut), primes: fPrimes, retenues: fRetenues, note: fNote.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erreur'); return; }
      setDialogOpen(false);
      void fetchRows();
    } catch { setError('Erreur reseau'); }
  }, [fSalarieId, fPeriode, fSalaireBrut, fPrimes, fRetenues, fNote, fetchRows]);

  const validateBulletin = useCallback(async (row: IBulletinSalaireResponse) => {
    try {
      const res = await fetch(`/api/paie/bulletins/${row._id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: BulletinStatut.VALIDE }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erreur'); return; }
      void fetchRows();
    } catch { setError('Erreur reseau'); }
  }, [fetchRows]);

  const openPay = useCallback((row: IBulletinSalaireResponse) => {
    setPayingRow(row); setError(null); setPayDialogOpen(true);
  }, []);

  const submitPay = useCallback(async () => {
    if (!payingRow) return;
    setError(null);
    try {
      const res = await fetch(`/api/paie/bulletins/${payingRow._id}?action=payer`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || t('common.error')); return; }
      setPayDialogOpen(false);
      void fetchRows();
    } catch { setError(t('common.errorNetwork')); }
  }, [payingRow, fetchRows]);

  const removeRow = useCallback(async (row: IBulletinSalaireResponse) => {
    setDeletingId(row._id); setError(null);
    try {
      const res = await fetch(`/api/paie/bulletins/${row._id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!json.success) { setError(json.error || t('common.error')); return; }
      void fetchRows();
    } catch { setError(t('common.errorNetwork')); }
    finally { setDeletingId(null); }
  }, [fetchRows]);

  const formFields = (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fSalarieId">{t('dashboard.bulletins.labelSalarie')}</Label>
          <select
            id="fSalarieId"
            value={fSalarieId}
            onChange={(e) => setFSalarieId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t('dashboard.bulletins.selectSalarie')}</option>
            {salaries.map((s) => (
              <option key={s._id} value={s._id}>{s.prenom} {s.nom} — {s.poste}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fPeriode">{t('dashboard.bulletins.labelPeriodeYM')}</Label>
          <Input id="fPeriode" type="month" value={fPeriode} onChange={(e) => setFPeriode(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fSalaireBrut">{t('dashboard.bulletins.labelSalaireBrut')}</Label>
          <Input id="fSalaireBrut" type="number" min="0" value={fSalaireBrut} onChange={(e) => setFSalaireBrut(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('dashboard.bulletins.labelPrimes')}</Label>
          <Button type="button" size="sm" variant="outline" onClick={addPrime}><Plus className="mr-1 h-3 w-3 rtl:rotate-180 rtl:mr-0 rtl:ml-1" /> {t('dashboard.bulletins.ajouter')}</Button>
        </div>
        {fPrimes.map((l, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input placeholder={t('dashboard.bulletins.libelle')} value={l.libelle} onChange={(e) => updatePrime(i, 'libelle', e.target.value)} className="flex-1" />
            <Input type="number" min="0" placeholder={t('dashboard.bulletins.montant')} value={String(l.montant)} onChange={(e) => updatePrime(i, 'montant', e.target.value)} className="w-28" />
            <Button type="button" size="sm" variant="ghost" onClick={() => removePrime(i)}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        {fPrimes.length > 0 && (
          <p className="text-right text-sm text-emerald-700 font-semibold">{t('dashboard.bulletins.totalPrimes', { value: totalPrimes.toLocaleString('fr-FR') })} {t('common.mru')}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('dashboard.bulletins.labelRetenues')}</Label>
          <Button type="button" size="sm" variant="outline" onClick={addRetenue}><Plus className="mr-1 h-3 w-3 rtl:rotate-180 rtl:mr-0 rtl:ml-1" /> {t('dashboard.bulletins.ajouter')}</Button>
        </div>
        {fRetenues.map((l, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input placeholder={t('dashboard.bulletins.libelle')} value={l.libelle} onChange={(e) => updateRetenue(i, 'libelle', e.target.value)} className="flex-1" />
            <Input type="number" min="0" placeholder={t('dashboard.bulletins.montant')} value={String(l.montant)} onChange={(e) => updateRetenue(i, 'montant', e.target.value)} className="w-28" />
            <Button type="button" size="sm" variant="ghost" onClick={() => removeRetenue(i)}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        {fRetenues.length > 0 && (
          <p className="text-right text-sm text-red-700 font-semibold">{t('dashboard.bulletins.totalRetenues', { value: totalRetenues.toLocaleString('fr-FR') })} {t('common.mru')}</p>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between"><span>{t('dashboard.bulletins.salaireBrut')}</span><span className="font-semibold">{Number(fSalaireBrut || 0).toLocaleString('fr-FR')} {t('common.mru')}</span></div>
        <div className="flex justify-between text-emerald-700"><span>{t('dashboard.bulletins.primes')}</span><span>{totalPrimes.toLocaleString('fr-FR')} {t('common.mru')}</span></div>
        <div className="flex justify-between text-red-700"><span>{t('dashboard.bulletins.retenues')}</span><span>{totalRetenues.toLocaleString('fr-FR')} {t('common.mru')}</span></div>
        <div className="mt-1 flex justify-between border-t pt-1 font-bold text-base">
          <span>{t('dashboard.bulletins.salaireNet')}</span><span className={salaireNet >= 0 ? 'text-emerald-700' : 'text-red-700'}>{salaireNet.toLocaleString('fr-FR')} {t('common.mru')}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fNote">{t('dashboard.bulletins.labelNote')}</Label>
        <Textarea id="fNote" rows={2} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder={t('dashboard.bulletins.notePlaceholder')} />
      </div>
    </div>
  );

  if (status === 'loading' || (status === 'authenticated' && !isAllowed)) {
    return <DashboardLayout><PageContent><PageSkeleton type="list" rows={6} /></PageContent></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.bulletins.title')}
        subtitle={t('dashboard.bulletins.subtitle')}
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" /> {t('dashboard.bulletins.newBulletin')}
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent>
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle>{t('dashboard.bulletins.registered')}</CardTitle>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t('dashboard.bulletins.labelStatut')}</Label>
                <select
                  value={filterStatut}
                  onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t('dashboard.bulletins.tous')}</option>
                  {Object.values(BulletinStatut).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">{t('dashboard.bulletins.labelPeriode')}</Label>
                <Input type="month" value={filterPeriode} onChange={(e) => { setFilterPeriode(e.target.value); setPage(1); }} className="h-9 w-36" />
              </div>
              {(filterStatut || filterPeriode) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterStatut(''); setFilterPeriode(''); setPage(1); }}>{t('dashboard.bulletins.effacerFiltres')}</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
            ) : rows.length === 0 ? (
              <EmptyState icon={<FileText className="h-8 w-8" />} title={t('dashboard.bulletins.emptyTitle')} description={t('dashboard.bulletins.emptyDesc')} />
            ) : isMobile ? (
              <div className="grid gap-3">
                {rows.map((row) => (
                  <div key={row._id} className="rounded-lg border bg-card p-3">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{row.salariePrenom} {row.salarieNom}</p>
                        <p className="text-xs text-muted-foreground">{row.salariePoste} — {periodeLabel(row.periode)}</p>
                      </div>
                      {statutBadge(row.statut)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><p className="text-xs text-muted-foreground">{t('dashboard.bulletins.fieldBrut')}</p><p>{Number(row.salaireBrut).toLocaleString('fr-FR')}</p></div>
                      <div><p className="text-xs text-muted-foreground">{t('dashboard.bulletins.fieldNet')}</p><p className="font-semibold">{Number(row.salaireNet).toLocaleString('fr-FR')}</p></div>
                      <div><p className="text-xs text-muted-foreground">{t('dashboard.bulletins.fieldMru')}</p></div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1 border-t pt-2">
                      {row.statut === BulletinStatut.BROUILLON && (
                        <Button size="sm" variant="outline" onClick={() => void validateBulletin(row)}><CheckCircle className="mr-1 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-1" />{t('dashboard.bulletins.actionValider')}</Button>
                      )}
                      {row.statut === BulletinStatut.VALIDE && (
                        <Button size="sm" className="bg-emerald-600" onClick={() => openPay(row)}><Banknote className="mr-1 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-1" />{t('dashboard.bulletins.actionPayer')}</Button>
                      )}
                      {row.statut !== BulletinStatut.PAYE && (
                        <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingId === row._id} onClick={() => void removeRow(row)}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">{t('dashboard.bulletins.colSalarie')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.bulletins.colPeriode')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.bulletins.colBrut')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.bulletins.colPrimes')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.bulletins.colRetenues')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.bulletins.colNet')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.bulletins.colStatut')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.bulletins.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id} className="border-b">
                        <td className="px-3 py-2">
                          <div>
                            <p className="font-medium">{row.salariePrenom} {row.salarieNom}</p>
                            <p className="text-xs text-muted-foreground">{row.salariePoste}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2">{periodeLabel(row.periode)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(row.salaireBrut).toLocaleString('fr-FR')} MRU</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">+{Number(row.totalPrimes).toLocaleString('fr-FR')}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-700">-{Number(row.totalRetenues).toLocaleString('fr-FR')}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{Number(row.salaireNet).toLocaleString('fr-FR')} MRU</td>
                        <td className="px-3 py-2">{statutBadge(row.statut)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {row.statut === BulletinStatut.BROUILLON && (
                              <Button size="sm" variant="outline" onClick={() => void validateBulletin(row)} title="Valider"><CheckCircle className="h-4 w-4" /></Button>
                            )}
                            {row.statut === BulletinStatut.VALIDE && (
                              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openPay(row)} title="Payer"><Banknote className="h-4 w-4" /></Button>
                            )}
                            {row.statut !== BulletinStatut.PAYE && (
                              <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingId === row._id} onClick={() => void removeRow(row)}><Trash2 className="h-4 w-4" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <MobilePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={totalItems} itemsPerPage={limit} />
            )}
          </CardContent>
        </Card>
      </PageContent>

      {/* Dialog creation bulletin */}
      {isMobile ? (
        <Drawer open={dialogOpen} onOpenChange={setDialogOpen}>
          <DrawerContent className="max-h-[95vh]">
            <DrawerHeader><DrawerTitle>{t('dashboard.bulletins.drawerNew')}</DrawerTitle></DrawerHeader>
            <div className="overflow-y-auto px-4 pb-2">{formFields}</div>
            <DrawerFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('dashboard.bulletins.annuler')}</Button>
              <Button onClick={() => void submitCreate()}>{t('dashboard.bulletins.creer')}</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('dashboard.bulletins.newBulletin')}</DialogTitle>
              <DialogDescription>{t('dashboard.bulletins.dialogDesc')}</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('dashboard.bulletins.annuler')}</Button>
              <Button onClick={() => void submitCreate()}>{t('dashboard.bulletins.creer')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog paiement */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.bulletins.payTitle')}</DialogTitle>
            <DialogDescription>
              {payingRow && `${payingRow.salariePrenom} ${payingRow.salarieNom} — ${periodeLabel(payingRow.periode)}`}
            </DialogDescription>
          </DialogHeader>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {payingRow && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>{t('dashboard.bulletins.salaireNetAPayer')}</span><span className="font-bold text-emerald-700">{Number(payingRow.salaireNet).toLocaleString('fr-FR')} {t('common.mru')}</span></div>
              <div className="text-xs text-muted-foreground">
                {t('dashboard.bulletins.paiementInfo')}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>{t('dashboard.bulletins.annuler')}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void submitPay()}>
              <Banknote className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" /> {t('dashboard.bulletins.confirmerPaiement')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
