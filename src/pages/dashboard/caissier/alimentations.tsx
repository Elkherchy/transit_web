import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  UserRole,
  type IUserResponse,
  type IJourneeCaisse,
} from '@/types';
import { ArrowRight, Plus } from 'lucide-react';

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CaissierAlimentations() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAllowed =
    user?.role === UserRole.CAISSIER || user?.role === UserRole.ADMIN;

  const [journees, setJournees] = useState<IJourneeCaisse[]>([]);
  const [payeurs, setPayeurs] = useState<IUserResponse[]>([]);
  const [payeurId, setPayeurId] = useState('');
  const [montant, setMontant] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState(todayISODate());
  const [dateTo, setDateTo] = useState(todayISODate());

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [journeesRes, payeursRes] = await Promise.all([
        fetch('/api/journee?limit=100', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/users/payeurs', { credentials: 'include' }).then((r) => r.json()),
      ]);

      if (journeesRes.success) {
        setJournees((journeesRes.data || []) as IJourneeCaisse[]);
      }

      if (payeursRes.success) {
        const list =
          payeursRes.data?.data || payeursRes.data || ([] as IUserResponse[]);
        setPayeurs(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAllowed) void reload();
  }, [isAllowed, reload]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!payeurId) {
      setError(t('dashboard.caissier.alimentations.errSelectPayeur'));
      return;
    }

    const m = parseFloat(montant.replace(',', '.'));
    if (!Number.isFinite(m) || m <= 0) {
      setError(t('dashboard.caissier.alimentations.errInvalidAmount'));
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/caisse/alimenter-payeur', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeurId,
          montant: m,
          description: description.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSuccess(
          t('dashboard.caissier.alimentations.successAlim', {
            value: (d.data?.nouveauSoldePayeur ?? 0).toFixed(2),
          })
        );
        setMontant('');
        setDescription('');
        setPayeurId('');
        setDialogOpen(false);
        void reload();
      } else {
        setError(d.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  const historiqueAlimentations = useMemo(() => {
    const payeurById = new Map(payeurs.map((p) => [String(p._id), p]));
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    const rows: Array<{
      transactionId: string;
      payeurNom: string;
      montant: number;
      date: Date;
      journeeDate: Date;
    }> = [];

    for (const j of journees || []) {
      const isCaissierOwner =
        user?.role === UserRole.ADMIN ||
        String(j.caissierId || '') === String(user?.id || '');
      if (!isCaissierOwner) continue;

      for (const a of j.alimentationsPayeurs || []) {
        const opDate = new Date(a.date || j.date);
        if (Number.isNaN(opDate.getTime())) continue;
        if (fromDate && opDate < fromDate) continue;
        if (toDate && opDate > toDate) continue;

        const payeur = payeurById.get(String(a.payeurId));
        rows.push({
          transactionId: String(a.transactionId),
          payeurNom: payeur?.nom || String(a.payeurId),
          montant: Number(a.montant || 0),
          date: opDate,
          journeeDate: new Date(j.date),
        });
      }
    }

    return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [journees, payeurs, dateFrom, dateTo, user?.id, user?.role]);

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.caissier.alimenterTitle')} />
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
        title={t('dashboard.caissier.alimenterTitle')}
        subtitle={t('dashboard.caissier.alimenterSubtitle')}
        actions={
          <Button
            onClick={() => {
              setError(null);
              setSuccess(null);
              setPayeurId('');
              setMontant('');
              setDescription('');
              setDialogOpen(true);
            }}
            className={isMobile ? 'h-10 px-3' : ''}
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.caissier.newAlimentation')}</span>
            <span className="sm:hidden">{t('dashboard.caissier.alimenterShort')}</span>
          </Button>
        }
        sticky={isMobile}
      />

      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="mx-auto max-w-7xl space-y-6">
          {success && !dialogOpen ? (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {t('dashboard.caissier.alimentations.historyTitle', {
                  defaultValue: 'Table Alimentations',
                })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="date-from">{t('components.caissePanel.from') || 'Du'}</Label>
                  <Input
                    id="date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="date-to">{t('components.caissePanel.to') || 'Au'}</Label>
                  <Input
                    id="date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const today = todayISODate();
                      setDateFrom(today);
                      setDateTo(today);
                    }}
                    className="w-full"
                  >
                    {t('components.caissePanel.today') || 'Aujourd’hui'}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-3 py-2 font-medium">{t('components.caissePanel.colDate') || 'Date'}</th>
                      <th className="px-3 py-2 font-medium">Journée</th>
                      <th className="px-3 py-2 font-medium">{t('dashboard.caissier.alimentations.payeur') || 'Payeur'}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('components.caissePanel.colMontant') || 'Montant'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historiqueAlimentations.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          {t('dashboard.caissier.alimentations.noHistory', {
                            defaultValue: 'Aucune alimentation pour cette période.',
                          })}
                        </td>
                      </tr>
                    ) : (
                      historiqueAlimentations.map((a, idx) => (
                        <tr key={`${a.transactionId}-${idx}`} className="border-b last:border-b-0">
                          <td className="px-3 py-2">{a.date.toLocaleString('fr-FR')}</td>
                          <td className="px-3 py-2">{a.journeeDate.toLocaleDateString('fr-FR')}</td>
                          <td className="px-3 py-2 font-medium">{a.payeurNom}</td>
                          <td className="px-3 py-2 text-right font-semibold">{a.montant.toFixed(2)} MRU</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dashboard.caissier.newAlimentation')}</DialogTitle>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('dashboard.caissier.alimentations.payeur')}</Label>
              <Select
                value={payeurId || undefined}
                onValueChange={setPayeurId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('dashboard.caissier.alimentations.selectPayeur')} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {payeurs.map((p) => {
                    const roleLabel =
                      p.role === UserRole.AGENT_RECEPTION_LOGISTIQUE
                        ? 'Agent réception'
                        : 'Payeur';
                    return (
                      <SelectItem key={p._id} value={p._id}>
                        {p.nom} · {roleLabel}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="montant">{t('dashboard.caissier.alimentations.amount')}</Label>
              <Input
                id="montant"
                type="number"
                step="0.01"
                min="0"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">{t('dashboard.caissier.alimentations.descriptionLabel')}</Label>
              <Input
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('dashboard.caissier.alimentations.descriptionPlaceholder')}
              />
            </div>

            <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                <ArrowRight className="mr-2 h-4 w-4 rtl:rotate-180" />
                {submitting
                  ? t('dashboard.caissier.alimentations.submitting')
                  : t('dashboard.caissier.alimentations.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
