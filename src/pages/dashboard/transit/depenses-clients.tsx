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
  CheckCircle2,
  UserRound,
} from 'lucide-react';

interface ClientDepenseRow {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
  description?: string;
  caisseId?: string;
  statut: 'EN_ATTENTE' | 'VALIDE';
  createdBy: string;
}

export default function ClientsDepensePage() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const canAccess =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_TRANSIT ||
    user?.role === UserRole.AGENT_TRANSIT;
  const isAdmin =
    user?.role === UserRole.ADMIN || user?.role === UserRole.ADMIN_TRANSIT;

  const [rows, setRows] = useState<ClientDepenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [formNom, setFormNom] = useState('');
  const [formTel, setFormTel] = useState('');
  const [formEmail, setFormEmail] = useState('');
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
      const r = await fetch('/api/depenses/clients', {
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) setRows((r.data || []) as ClientDepenseRow[]);
      else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canAccess) void reload();
  }, [canAccess, reload]);

  const submitCreate = async () => {
    if (!formNom.trim()) {
      setError(t('dashboard.depensesClients.errNomRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/depenses/clients', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: formNom.trim(),
          telephone: formTel.trim() || undefined,
          email: formEmail.trim() || undefined,
          description: formDesc.trim() || undefined,
        }),
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(r.message || t('dashboard.depensesClients.successCreate'));
        setCreateOpen(false);
        setFormNom('');
        setFormTel('');
        setFormEmail('');
        setFormDesc('');
        void reload();
      } else {
        setError(r.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const valider = async (id: string) => {
    try {
      const r = await fetch(`/api/depenses/clients/${id}/valider`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.depensesClients.successValide'));
        void reload();
      } else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const rejeter = async (id: string, nom: string) => {
    if (
      !window.confirm(t('dashboard.depensesClients.confirmRejet', { nom }))
    )
      return;
    try {
      const r = await fetch(`/api/depenses/clients/${id}/rejeter`, {
        method: 'POST',
        credentials: 'include',
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.depensesClients.successDelete'));
        void reload();
      } else setError(r.error || t('common.error'));
    } catch {
      setError(t('common.errorNetwork'));
    }
  };

  const { pending, valides } = useMemo(
    () => ({
      pending: rows.filter((r) => r.statut === 'EN_ATTENTE'),
      valides: rows.filter((r) => r.statut === 'VALIDE'),
    }),
    [rows]
  );

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.depensesClients.title')} />
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
        title={t('dashboard.depensesClients.title')}
        subtitle={t('dashboard.depensesClients.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <RefreshCcw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.depensesClients.refresh')}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFormNom('');
                setFormTel('');
                setFormEmail('');
                setFormDesc('');
                setCreateOpen(true);
              }}
              className={isMobile ? 'h-10 px-3' : ''}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.depensesClients.newBtn')}</span>
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
                <UserRound className="h-4 w-4 text-muted-foreground" />
                {t('dashboard.depensesClients.title')}{' '}
                <Badge variant="secondary" className="ml-1">
                  {rows.length}
                </Badge>
                {pending.length > 0 && (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                    {t('dashboard.depensesClients.badgePending', { count: pending.length })}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {rows.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">
                  {t('dashboard.depensesClients.empty')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.depensesClients.colNom')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.depensesClients.colTelephone')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.depensesClients.colEmail')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.depensesClients.colDescription')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('dashboard.depensesClients.colStatut')}</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          {t('dashboard.depensesClients.colActions')}
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
                            <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                              {c.telephone || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {c.email || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {c.description || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              {isPending ? (
                                <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-xs">
                                  {t('dashboard.depensesClients.statusPending')}
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-xs">
                                  {t('dashboard.depensesClients.statusValide')}
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
                                    {t('dashboard.depensesClients.btnValider')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void rejeter(c._id, c.nom)}
                                  >
                                    <XCircle className="mr-1 h-3 w-3" />
                                    {t('dashboard.depensesClients.btnRejeter')}
                                  </Button>
                                </div>
                              )}
                              {isPending && !isAdmin && (
                                <Badge variant="outline" className="text-[10px]">
                                  {t('dashboard.depensesClients.statusPendingAdmin')}
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
              <DialogTitle>{t('dashboard.depensesClients.dialogTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cd-nom">{t('dashboard.depensesClients.labelNom')} *</Label>
                <Input
                  id="cd-nom"
                  value={formNom}
                  onChange={(e) => setFormNom(e.target.value)}
                  placeholder={t('dashboard.depensesClients.nomPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd-tel">{t('dashboard.depensesClients.labelTelephone')}</Label>
                <Input
                  id="cd-tel"
                  value={formTel}
                  onChange={(e) => setFormTel(e.target.value)}
                  placeholder="+222 …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd-email">{t('dashboard.depensesClients.labelEmail')}</Label>
                <Input
                  id="cd-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd-desc">{t('dashboard.depensesClients.labelDescription')}</Label>
                <Textarea
                  id="cd-desc"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder={t('dashboard.depensesClients.descPlaceholder')}
                />
              </div>
              {!isAdmin && (
                <Alert>
                  <AlertDescription className="text-xs">
                    {t('dashboard.depensesClients.noticePending')}
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
                {t('actions.cancel')}
              </Button>
              <Button
                disabled={submitting || !formNom.trim()}
                onClick={() => void submitCreate()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('dashboard.depensesClients.btnCreate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContent>
    </DashboardLayout>
  );
}
