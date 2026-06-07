import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PageHeader,
  PageContent,
  EmptyState,
  PageSkeleton,
  SearchInput,
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
import { CompteType, ICaisseListItem, ISalarieResponse, IUserResponse, UserRole } from '@/types';
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';

import { useIsMobile } from '@/hooks/use-mobile';

export default function SalariesPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [rows, setRows] = useState<ISalarieResponse[]>([]);
  const [users, setUsers] = useState<IUserResponse[]>([]);
  const [comptes, setComptes] = useState<ICaisseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ISalarieResponse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fSalaire, setFSalaire] = useState('0');
  const [fBanqueCompteId, setFBanqueCompteId] = useState('');
  const [fRib, setFRib] = useState('');
  const [fDateEmbauche, setFDateEmbauche] = useState('');
  const [fUserId, setFUserId] = useState('');

  const userRole = session?.user?.role;
  const isAllowed = userRole === UserRole.ADMIN || userRole === UserRole.COMPTABLE;
  const limit = isMobile ? 8 : 15;

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) void router.replace('/dashboard');
  }, [status, isAllowed, router]);

  const fetchRows = useCallback(async () => {
    if (!isAllowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/paie/salaries?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) { setError(json.error || 'Erreur'); setRows([]); return; }
      setRows(json.data?.data || []);
      setTotalPages(json.data?.totalPages || 1);
      setTotalItems(json.data?.total || 0);
    } catch { setError('Erreur reseau'); setRows([]); }
    finally { setLoading(false); }
  }, [isAllowed, page, limit, search]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  useEffect(() => {
    if (!isAllowed) return;
    void (async () => {
      try {
        const res = await fetch('/api/paie/users', { credentials: 'include' });
        const json = await res.json();
        if (json.success) setUsers(json.data || []);
      } catch { setUsers([]); }
    })();

    void (async () => {
      try {
        const res = await fetch('/api/caisse/caisses', { credentials: 'include' });
        const json = await res.json();
        if (json.success) {
          const options = (json.data || []).filter((c: ICaisseListItem) => c.type === CompteType.BANQUE || c.type === CompteType.CAISSE || c.type === CompteType.GENERAL);
          setComptes(options);
        }
      } catch {
        setComptes([]);
      }
    })();
  }, [isAllowed]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFSalaire('0');
    setFRib(''); setFDateEmbauche(''); setFUserId('');
    setFBanqueCompteId('');
    setError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: ISalarieResponse) => {
    setEditing(row);
    setFSalaire(String(row.salaireBrut ?? 0));
    setFRib(row.rib || '');
    setFBanqueCompteId(row.banqueCompteId || '');
    setFDateEmbauche(row.dateEmbauche ? new Date(row.dateEmbauche).toISOString().slice(0, 10) : '');
    setFUserId(row.userId || '');
    setError(null);
    setDialogOpen(true);
  }, []);

  const selectedUser = useMemo(() => users.find((u) => u._id === fUserId), [users, fUserId]);

  const submitForm = useCallback(async () => {
    setError(null);
    if (!fUserId) {
      setError('Selectionnez un utilisateur');
      return;
    }
    const payload = {
      userId: fUserId,
      salaireBrut: Number(fSalaire || 0),
      banqueCompteId: fBanqueCompteId || undefined,
      rib: fRib.trim() || undefined,
      dateEmbauche: fDateEmbauche || undefined,
    };
    try {
      const url = editing ? `/api/paie/salaries/${editing._id}` : '/api/paie/salaries';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) { setError(json.error || t('common.error')); return; }
      setDialogOpen(false);
      void fetchRows();
    } catch { setError(t('common.errorNetwork')); }
  }, [editing, fUserId, fSalaire, fBanqueCompteId, fRib, fDateEmbauche, fetchRows]);

  const removeRow = useCallback(async (row: ISalarieResponse) => {
    setDeletingId(row._id);
    setError(null);
    try {
      const res = await fetch(`/api/paie/salaries/${row._id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (!json.success) { setError(json.error || t('common.error')); return; }
      void fetchRows();
    } catch { setError(t('common.errorNetwork')); }
    finally { setDeletingId(null); }
  }, [fetchRows]);

  const masseSalariale = useMemo(() => rows.reduce((s, r) => s + Number(r.salaireBrut || 0), 0), [rows]);

  const formFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fUserId">{t('dashboard.salaries.labelUser')}</Label>
        <select
          id="fUserId"
          value={fUserId}
          onChange={(e) => setFUserId(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('dashboard.salaries.selectUser')}</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>{u.nom} ({u.email})</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('dashboard.salaries.labelNomAuto')}</Label>
        <div className="h-10 flex items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
          {selectedUser?.nom || '-'}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('dashboard.salaries.labelPosteAuto')}</Label>
        <div className="h-10 flex items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
          {selectedUser?.role || '-'}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fSalaire">{t('dashboard.salaries.labelSalaireBrut')}</Label>
        <Input id="fSalaire" type="number" min="0" value={fSalaire} onChange={(e) => setFSalaire(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fBanqueCompteId">{t('dashboard.salaries.labelBanqueLiee')}</Label>
        <select
          id="fBanqueCompteId"
          value={fBanqueCompteId}
          onChange={(e) => setFBanqueCompteId(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('dashboard.salaries.selectCompte')}</option>
          {comptes.map((c) => (
            <option key={c._id} value={c._id}>{c.nom} ({c.type})</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fRib">{t('dashboard.salaries.labelRib')}</Label>
        <Input id="fRib" value={fRib} onChange={(e) => setFRib(e.target.value)} placeholder={t('dashboard.salaries.ribPlaceholder')} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fDateEmbauche">{t('dashboard.salaries.labelDateEmbauche')}</Label>
        <Input id="fDateEmbauche" type="date" value={fDateEmbauche} onChange={(e) => setFDateEmbauche(e.target.value)} />
      </div>
    </div>
  );

  if (status === 'loading' || (status === 'authenticated' && !isAllowed)) {
    return <DashboardLayout><PageContent><PageSkeleton type="list" rows={6} /></PageContent></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.salaries.title')}
        subtitle={t('dashboard.salaries.subtitle')}
        actions={
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4 rtl:rotate-180 rtl:mr-0 rtl:ml-2" /> {t('dashboard.salaries.createBtn')}
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent>
        <Card>
          <CardHeader className="space-y-4">
            <CardTitle>{t('dashboard.salaries.registered')}</CardTitle>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="grid gap-3 sm:grid-cols-2">
              <SearchInput
                placeholder={t('common.search')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); setSearch(searchInput); } }}
              />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => { setPage(1); setSearch(searchInput); }}>{t('dashboard.salaries.filterBtn')}</Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('dashboard.salaries.masseSalariale')}: <span className="font-semibold text-foreground">{masseSalariale.toLocaleString('fr-FR')} {t('common.mru')}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
            ) : rows.length === 0 ? (
              <EmptyState icon={<Users className="h-8 w-8" />} title={t('dashboard.salaries.emptyTitle')} description={t('dashboard.salaries.emptyDesc')} />
            ) : isMobile ? (
              <div className="grid gap-3">
                {rows.map((row) => (
                  <div key={row._id} className="rounded-lg border bg-card p-3">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{row.prenom} {row.nom}</p>
                        <p className="text-xs text-muted-foreground">{row.poste}</p>
                      </div>
                      <Badge variant={row.actif ? 'default' : 'secondary'}>{row.actif ? t('dashboard.salaries.actif') : t('dashboard.salaries.inactif')}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">{t('dashboard.salaries.fieldSalaireBrut')}</p>
                        <p className="font-semibold">{Number(row.salaireBrut).toLocaleString('fr-FR')} {t('common.mru')}</p>
                      </div>
                      {(row.banque || row.banqueCompteNom) && (
                        <div>
                          <p className="text-xs text-muted-foreground">{t('dashboard.salaries.fieldBanque')}</p>
                          <p>{row.banqueCompteNom || row.banque}</p>
                        </div>
                      )}
                      {row.userNom && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">{t('dashboard.salaries.fieldUserLie')}</p>
                          <p>{row.userNom}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingId === row._id} onClick={() => void removeRow(row)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left">{t('dashboard.salaries.colNomPrenom')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.salaries.colPoste')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.salaries.colSalaireBrut')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.salaries.colBanqueRib')}</th>
                      <th className="px-3 py-2 text-left">{t('dashboard.salaries.colUser')}</th>
                      <th className="px-3 py-2 text-center">{t('dashboard.salaries.colStatut')}</th>
                      <th className="px-3 py-2 text-right">{t('dashboard.salaries.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row._id} className="border-b">
                        <td className="px-3 py-2 font-medium">{row.prenom} {row.nom}</td>
                        <td className="px-3 py-2">{row.poste}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{Number(row.salaireBrut).toLocaleString('fr-FR')} {t('common.mru')}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span>{row.banqueCompteNom || row.banque || '-'}</span>
                            {row.rib && <span className="font-mono text-xs text-muted-foreground">{row.rib}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">{row.userNom || <span className="text-muted-foreground">-</span>}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={row.actif ? 'default' : 'secondary'}>{row.actif ? t('dashboard.salaries.actif') : t('dashboard.salaries.inactif')}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive" disabled={deletingId === row._id} onClick={() => void removeRow(row)}><Trash2 className="h-4 w-4" /></Button>
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

      {isMobile ? (
        <Drawer open={dialogOpen} onOpenChange={setDialogOpen}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader><DrawerTitle>{editing ? t('dashboard.salaries.drawerEdit') : t('dashboard.salaries.drawerNew')}</DrawerTitle></DrawerHeader>
            <div className="overflow-y-auto px-4 pb-2">{formFields}</div>
            <DrawerFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={() => void submitForm()}>{editing ? t('dashboard.salaries.saveBtn') : t('dashboard.salaries.createBtnShort')}</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? t('dashboard.salaries.drawerEdit') : t('dashboard.salaries.drawerNew')}</DialogTitle>
              <DialogDescription>{t('dashboard.salaries.dialogDesc')}</DialogDescription>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('actions.cancel')}</Button>
              <Button onClick={() => void submitForm()}>{editing ? t('dashboard.salaries.saveBtn') : t('dashboard.salaries.createBtnShort')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
