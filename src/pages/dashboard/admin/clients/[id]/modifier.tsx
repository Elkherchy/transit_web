import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClientSubNav } from '@/components/dashboard/admin/clients/ClientSubNav';
import { useClientDetail } from '@/components/dashboard/admin/clients/useClientDetail';
import { isAdminTransit } from '@/lib/roles';
import { UserRole } from '@/types';
import { ArrowLeft, Save } from 'lucide-react';

export default function AdminClientEdit() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();
  const isMobile = useIsMobile();
  const isAdmin =
    isAdminTransit(user?.role) || user?.role === UserRole.AGENT_TRANSIT;
  const id = String(router.query.id || '');

  useEffect(() => {
    if (status !== 'loading' && user && !isAdmin) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAdmin, router]);

  const { data, loading, error: loadError, reload } = useClientDetail(id, isAdmin);

  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [actif, setActif] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (data?.client) {
      setNom(data.client.nom);
      setTelephone(data.client.telephone || '');
      setEmail(data.client.email || '');
      setActif(data.client.actif);
    }
  }, [data?.client]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!nom.trim()) return setFormError(t('dashboard.clients.modifier.nameRequired'));
    setSubmitting(true);
    try {
      const r = await fetch(`/api/admin/clients/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nom.trim(),
          telephone: telephone.trim() || undefined,
          email: email.trim() || undefined,
          actif,
        }),
      }).then((x) => x.json());
      if (r.success) {
        setSuccess(t('dashboard.clients.modifier.successUpdated'));
        void reload();
      } else {
        setFormError(r.error || t('common.error'));
      }
    } catch {
      setFormError(t('common.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.clients.modifierLoading')} />
        <PageContent>
          <PageSkeleton type="list" rows={isMobile ? 5 : 8} />
        </PageContent>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return null;
 
  if (loadError || !data) {
    return (
      <DashboardLayout>
        <PageHeader
          title={t('dashboard.clients.modifierLoading')}
          backButton={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/admin/clients">
                <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
                {t('dashboard.transit.list')}
              </Link>
            </Button>
          }
        />
        <PageContent>
          <Alert variant="destructive">
            <AlertDescription>
              {loadError || t('dashboard.clients.modifier.errorFallback')}
            </AlertDescription>
          </Alert>
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.clients.modifierTitle', { name: data.client.nom })}
        subtitle={t('dashboard.clients.modifierSubtitle')}
        backButton={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/admin/clients/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
              {t('actions.details')}
            </Link>
          </Button>
        }
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="space-y-6 max-w-7xl mx-auto">
          <ClientSubNav clientId={id} />

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={submit}
            className="space-y-4 rounded-lg bg-white p-4 max-md:rounded-none max-md:bg-transparent max-md:px-4 max-md:py-3 border shadow-sm"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nom">{t('dashboard.clients.modifier.fieldNom')}</Label>
                <Input
                  id="nom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tel">{t('dashboard.clients.modifier.fieldTelephone')}</Label>
                <Input
                  id="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  placeholder={t('dashboard.clients.modifier.telephonePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('dashboard.clients.modifier.fieldEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('dashboard.clients.modifier.emailPlaceholder')}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="actif"
                className="rounded border-input"
                checked={actif}
                onChange={(e) => setActif(e.target.checked)}
              />
              <Label htmlFor="actif" className="font-normal cursor-pointer">
                {t('dashboard.clients.modifier.actifLabel')}
              </Label>
            </div>
            <div className="flex flex-col-reverse gap-3 pt-4 border-t sm:flex-row sm:justify-end">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/admin/clients/${id}`}>{t('dashboard.clients.modifier.cancelBtn')}</Link>
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {submitting ? t('dashboard.clients.modifier.savingBtn') : t('dashboard.clients.modifier.saveBtn')}
              </Button>
            </div>
          </form>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
