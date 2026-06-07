import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserRole, type ICaisseListItem } from '@/types';
import { Plus, CheckCircle2, RefreshCcw, Receipt } from 'lucide-react';

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

interface Categorie {
  _id: string;
  nom: string;
  description?: string;
}

interface ClientDepenseOption {
  _id: string;
  nom: string;
  caisseId?: string;
}

interface DepenseRow {
  _id: string;
  categorieNom: string;
  clientDepenseNom?: string;
  montant: number;
  description?: string;
  date: string;
  caisseNom?: string;
  createdAt: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CaissierDepensesPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const isAllowed =
    user?.role === UserRole.CAISSIER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;

  const [rows, setRows] = useState<DepenseRow[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [clientsDepense, setClientsDepense] = useState<ClientDepenseOption[]>(
    []
  );
  const [caisses, setCaisses] = useState<ICaisseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formCategorieId, setFormCategorieId] = useState('');
  const [formClientDepenseId, setFormClientDepenseId] = useState('');
  const [formCaisseId, setFormCaisseId] = useState('');
  const [formMontant, setFormMontant] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const day = todayISO();
      const [depRes, catRes, caisseRes, clientsRes] = await Promise.all([
        fetch(`/api/depenses?from=${day}&to=${day}&limit=200`, {
          credentials: 'include',
        }).then((x) => x.json()),
        fetch('/api/depenses/categories?onlyValide=1', {
          credentials: 'include',
        }).then((x) => x.json()),
        fetch('/api/caisse/caisses?forDepense=1&caisseType=TRANSIT', {
          credentials: 'include',
        }).then((x) => x.json()),
        fetch('/api/depenses/clients?onlyValide=1', {
          credentials: 'include',
        }).then((x) => x.json()),
      ]);
      if (depRes.success) setRows((depRes.data || []) as DepenseRow[]);
      if (catRes.success) setCategories((catRes.data || []) as Categorie[]);
      if (caisseRes.success)
        setCaisses((caisseRes.data || []) as ICaisseListItem[]);
      if (clientsRes.success)
        setClientsDepense((clientsRes.data || []) as ClientDepenseOption[]);
    } catch {
      setError(t('dashboard.depenses.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const submit = async () => {
    if (!formCategorieId)
      return setError(t('dashboard.depenses.errCategorieRequired'));
    if (!formCaisseId)
      return setError(t('dashboard.depenses.errCaisseRequired'));
    const m = parseFloat(formMontant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0)
      return setError(t('dashboard.depenses.errMontantInvalid'));
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/depenses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categorieId: formCategorieId,
          clientDepenseId: formClientDepenseId || undefined,
          caisseId: formCaisseId,
          montant: m,
          description: formDesc.trim() || undefined,
          date: formDate
            ? new Date(formDate).toISOString()
            : undefined,
        }),
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.depenses.successCreate'));
        setDialogOpen(false);
        setFormCategorieId('');
        setFormClientDepenseId('');
        setFormCaisseId('');
        setFormMontant('');
        setFormDesc('');
        setFormDate(todayISO());
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('dashboard.depenses.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.depenses.pageTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const total = rows.reduce((s, r) => s + Number(r.montant || 0), 0);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.depenses.pageTitle')}
        subtitle={t('dashboard.depenses.pageSubtitle', {
          total: fmt(total),
          count: rows.length,
        })}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {t('dashboard.depenses.refresh')}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {t('dashboard.depenses.newBtn')}
              </span>
            </Button>
          </div>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-7xl space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t('dashboard.depenses.empty')}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 sm:hidden">
                {rows.map((d) => (
                  <Card key={d._id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {d.categorieNom}
                          {d.clientDepenseNom ? ` · ${d.clientDepenseNom}` : ''}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {d.caisseNom || '—'}
                          {d.description ? ` · ${d.description}` : ''}
                        </div>
                      </div>
                      <div className="text-sm font-bold tabular-nums text-red-700">
                        −{fmt(d.montant)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-lg border bg-white sm:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">
                        {t('dashboard.depenses.colDate')}
                      </th>
                      <th className="px-4 py-2.5 font-medium">
                        {t('dashboard.depenses.colCategorie')}
                      </th>
                      <th className="px-4 py-2.5 font-medium">Bénéficiaire</th>
                      <th className="px-4 py-2.5 font-medium">
                        {t('dashboard.depenses.colCaisse')}
                      </th>
                      <th className="px-4 py-2.5 font-medium">
                        {t('dashboard.depenses.colDescription')}
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        {t('dashboard.depenses.colMontant')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d._id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 tabular-nums">
                          {new Date(d.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {d.categorieNom}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {d.clientDepenseNom || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {d.caisseNom || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {d.description || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-700">
                          −{fmt(d.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('dashboard.depenses.dialogTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dep-cat">
                  {t('dashboard.depenses.categorieLabel')} *
                </Label>
                <Select
                  value={formCategorieId || undefined}
                  onValueChange={setFormCategorieId}
                >
                  <SelectTrigger id="dep-cat" className="w-full">
                    <SelectValue
                      placeholder={t('dashboard.depenses.categoriePlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {categories.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('dashboard.depenses.noCategorie')}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-client">Client dépense</Label>
                <Select
                  value={formClientDepenseId || undefined}
                  onValueChange={(v) =>
                    setFormClientDepenseId(v === '__none__' ? '' : v)
                  }
                >
                  <SelectTrigger id="dep-client" className="w-full">
                    <SelectValue placeholder="Aucun (dépense interne)" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="__none__">
                      Aucun (dépense interne)
                    </SelectItem>
                    {clientsDepense.map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clientsDepense.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucun client dépense validé.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-caisse">
                  {t('dashboard.depenses.caisseLabel')} *
                </Label>
                <Select
                  value={formCaisseId || undefined}
                  onValueChange={setFormCaisseId}
                >
                  <SelectTrigger id="dep-caisse" className="w-full">
                    <SelectValue
                      placeholder={t('dashboard.depenses.caissePlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper" className="max-h-[60vh]">
                    {(() => {
                      const groups: Record<string, ICaisseListItem[]> = {
                        Générale: [],
                        Banques: [],
                        'Comptes dépense': [],
                        Autres: [],
                      };
                      for (const c of caisses) {
                        if (c.kind === 'GENERAL') groups['Générale'].push(c);
                        else if (c.type === 'BANQUE')
                          groups['Banques'].push(c);
                        else if (c.kind === 'CLIENT')
                          groups['Comptes dépense'].push(c);
                        else groups['Autres'].push(c);
                      }
                      return Object.entries(groups).map(([label, items]) => {
                        if (items.length === 0) return null;
                        return (
                          <SelectGroup key={label}>
                            <SelectLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {label}
                            </SelectLabel>
                            {items.map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.nom}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      });
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-montant">
                  {t('dashboard.depenses.montantLabel')} *
                </Label>
                <Input
                  id="dep-montant"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formMontant}
                  onChange={(e) => setFormMontant(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-date">
                  {t('dashboard.depenses.dateLabel')}
                </Label>
                <Input
                  id="dep-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-desc">
                  {t('dashboard.depenses.descriptionLabel')}
                </Label>
                <Textarea
                  id="dep-desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder={t('dashboard.depenses.descriptionPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
              >
                {t('dashboard.depenses.cancel')}
              </Button>
              <Button
                disabled={submitting || !formCategorieId || !formCaisseId}
                onClick={() => void submit()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('dashboard.depenses.submit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
