import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';


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
import { PageContent, PageHeader, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { ILogistiqueClient, UserRole } from '@/types';
import { ArrowLeft, Save } from 'lucide-react';

export default function NouveauBonCommandePage() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();

  const userRole = session?.user?.role;
  const isAllowed =
    userRole === UserRole.ADMIN ||
    userRole === UserRole.ADMIN_LOGISTIQUE ||
    userRole === UserRole.COMPTABLE;

  const today = () => new Date().toISOString().slice(0, 10);

  const [numero, setNumero] = useState('');
  const [clients, setClients] = useState<ILogistiqueClient[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientLibre, setClientLibre] = useState('');
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState<string>(today());

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, isAllowed, router]);

  // Pré-charge le numéro suggéré + la liste des clients logistique.
  useEffect(() => {
    if (!isAllowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [numRes, clientsRes] = await Promise.all([
          fetch('/api/logistique/bons-commande/next-numero', {
            credentials: 'include',
          }),
          fetch('/api/logistique/customers', { credentials: 'include' }),
        ]);
        const numJson = await numRes.json();
        const clientsJson = await clientsRes.json();
        if (cancelled) return;
        if (numJson.success) setNumero(numJson.data?.numero || '001');
        if (clientsJson.success)
          setClients((clientsJson.data || []) as ILogistiqueClient[]);
      } catch {
        if (!cancelled) setError(t('common.errorNetwork'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAllowed, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clientResolved =
      clients.find((c) => c._id === clientId)?.nom || clientLibre.trim();
    if (!clientResolved) {
      setError(t('dashboard.bonsCommande.simpleForm.errClientRequired'));
      return;
    }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      setError(t('dashboard.bonsCommande.simpleForm.errMontantInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/logistique/bons-commande', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: numero.trim(),
          client: clientResolved,
          montant: m,
          date: new Date(date).toISOString(),
        }),
      });
      const data = await r.json();
      if (data.success) {
        void router.push('/dashboard/logistique/bons-commande');
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.bonsCommande.simpleForm.title')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 4 : 6} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.bonsCommande.simpleForm.title')}
        subtitle={t('dashboard.bonsCommande.simpleForm.subtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/logistique/bons-commande">
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.back')}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="max-w-7xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('dashboard.bonsCommande.simpleForm.formTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="numero">
                    {t('dashboard.bonsCommande.simpleForm.numeroLabel')} *
                  </Label>
                  <Input
                    id="numero"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="001"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="client">
                    {t('dashboard.bonsCommande.simpleForm.clientLabel')} *
                  </Label>
                  <Select
                    value={clientId || undefined}
                    onValueChange={(v) => {
                      setClientId(v);
                      setClientLibre('');
                    }}
                  >
                    <SelectTrigger id="client">
                      <SelectValue
                        placeholder={t(
                          'dashboard.bonsCommande.simpleForm.clientPlaceholder'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.nom}
                          {c.societe ? ` — ${c.societe}` : ''}
                          {c.numero ? ` (${c.numero})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={clientLibre}
                    onChange={(e) => {
                      setClientLibre(e.target.value);
                      if (e.target.value) setClientId('');
                    }}
                    placeholder={t(
                      'dashboard.bonsCommande.simpleForm.clientLibrePlaceholder'
                    )}
                    className="mt-1.5"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="montant">
                    {t('dashboard.bonsCommande.simpleForm.montantLabel')} *
                  </Label>
                  <Input
                    id="montant"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="date">
                    {t('dashboard.bonsCommande.simpleForm.dateLabel')} *
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    asChild
                    disabled={submitting}
                  >
                    <Link href="/dashboard/logistique/bons-commande">
                      {t('actions.cancel')}
                    </Link>
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    <Save className="mr-2 h-4 w-4" />
                    {submitting
                      ? t('actions.loading')
                      : t('dashboard.bonsCommande.simpleForm.createBtn')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
