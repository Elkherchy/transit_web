import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { UserRole } from '@/types';
import {
  Plus,
  ShieldCheck,
  XCircle,
  RefreshCcw,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface CategorieRow {
  _id: string;
  nom: string;
  description?: string;
  statut: 'EN_ATTENTE' | 'VALIDE';
  createdBy: string;
  createdAt: string;
}

export default function DepensesCategoriesPage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();

  const canAccess =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;
  const isAdmin =
    user?.role === UserRole.ADMIN || user?.role === UserRole.ADMIN_TRANSIT;

  const [rows, setRows] = useState<CategorieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [formNom, setFormNom] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status !== 'loading' && user && !canAccess) {
      void router.replace('/dashboard');
    }
  }, [status, user, canAccess, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/depenses/categories', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows((r.data || []) as CategorieRow[]);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('dashboard.depensesCategories.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  const submitCreate = async () => {
    if (!formNom.trim()) {
      setError(t('dashboard.depensesCategories.errNomRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/depenses/categories', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: formNom.trim(),
          description: formDesc.trim() || undefined,
        }),
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(
          r.message ||
            (isAdmin
              ? t('dashboard.depensesCategories.successCreate')
              : t('dashboard.depensesCategories.successCreatePending'))
        );
        setCreateOpen(false);
        setFormNom('');
        setFormDesc('');
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('dashboard.depensesCategories.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const valider = async (id: string) => {
    try {
      const r = await fetch(`/api/depenses/categories/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.depensesCategories.successValide'));
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('dashboard.depensesCategories.errorNetwork'));
    }
  };

  const rejeter = async (id: string, nom: string) => {
    if (
      !window.confirm(
        t('dashboard.depensesCategories.confirmRejet', { nom })
      )
    )
      return;
    try {
      const r = await fetch(`/api/depenses/categories/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.depensesCategories.successRejete'));
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('dashboard.depensesCategories.errorNetwork'));
    }
  };

  const { pending, valides } = useMemo(() => {
    return {
      pending: rows.filter((r) => r.statut === 'EN_ATTENTE'),
      valides: rows.filter((r) => r.statut === 'VALIDE'),
    };
  }, [rows]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.depensesCategories.pageTitle')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!canAccess) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.depensesCategories.pageTitle')}
        subtitle={t('dashboard.depensesCategories.pageSubtitle')}
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
                {t('dashboard.depensesCategories.refresh')}
              </span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFormNom('');
                setFormDesc('');
                setCreateOpen(true);
              }}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {t('dashboard.depensesCategories.newBtn')}
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {pending.length > 0 && (
                  <Clock className="h-4 w-4 text-amber-600" />
                )}
                {t('dashboard.depensesCategories.pageTitle')}{' '}
                <Badge variant="secondary" className="ml-1">
                  {rows.length}
                </Badge>
                {pending.length > 0 && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                    {pending.length} {t('dashboard.depensesCategories.pendingBadge')}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {rows.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">
                  {t('dashboard.depensesCategories.empty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">
                          {t('dashboard.depensesCategories.nomLabel')}
                        </th>
                        <th className="px-4 py-2.5 font-medium">
                          {t('dashboard.depensesCategories.descriptionLabel')}
                        </th>
                        <th className="px-4 py-2.5 font-medium">Statut</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pending, ...valides].map((c) => {
                        const isPending = c.statut === 'EN_ATTENTE';
                        return (
                          <tr
                            key={c._id}
                            className={
                              isPending
                                ? 'border-b bg-amber-50/40 hover:bg-amber-50/70'
                                : 'border-b last:border-0 hover:bg-slate-50'
                            }
                          >
                            <td className="px-4 py-2.5 font-medium">
                              {c.nom}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {c.description || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              {isPending ? (
                                <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
                                  {t('dashboard.depensesCategories.pendingBadge')}
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs">
                                  Validée
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isPending && isAdmin && (
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => void valider(c._id)}
                                  >
                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                    {t('dashboard.depensesCategories.valider')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void rejeter(c._id, c.nom)}
                                  >
                                    <XCircle className="mr-1 h-3 w-3" />
                                    {t('dashboard.depensesCategories.rejeter')}
                                  </Button>
                                </div>
                              )}
                              {isPending && !isAdmin && (
                                <Badge variant="outline" className="text-[10px]">
                                  {t(
                                    'dashboard.depensesCategories.pendingBadgeAdmin'
                                  )}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('dashboard.depensesCategories.dialogTitle')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-nom">
                  {t('dashboard.depensesCategories.nomLabel')} *
                </Label>
                <Input
                  id="cat-nom"
                  value={formNom}
                  onChange={(e) => setFormNom(e.target.value)}
                  placeholder={t('dashboard.depensesCategories.nomPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">
                  {t('dashboard.depensesCategories.descriptionLabel')}
                </Label>
                <Textarea
                  id="cat-desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder={t(
                    'dashboard.depensesCategories.descriptionPlaceholder'
                  )}
                />
              </div>
              {!isAdmin && (
                <Alert>
                  <AlertDescription className="text-xs">
                    {t('dashboard.depensesCategories.noticePending')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => setCreateOpen(false)}
              >
                {t('dashboard.depensesCategories.cancel')}
              </Button>
              <Button
                disabled={submitting || !formNom.trim()}
                onClick={() => void submitCreate()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('dashboard.depensesCategories.submit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
