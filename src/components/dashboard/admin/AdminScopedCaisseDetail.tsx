import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CaisseTransactionsPanel from '@/components/caisse/CaisseTransactionsPanel';
import { CaisseType, ICaisseListItem, UserRole } from '@/types';
import { PageHeader, PageContent, PageSkeleton } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface Props {
  caisseType: CaisseType;
  /** Rôles autorisés à accéder à cette page. */
  allowedRoles: UserRole[];
  /** Lien de retour vers la vue scopée parente. */
  backHref: string;
}

export default function AdminScopedCaisseDetail({
  caisseType,
  allowedRoles,
  backHref,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { id } = router.query;
  const caisseId = typeof id === 'string' ? id : '';

  const { data: session, status } = useSession();
  const user = session?.user;
  const isAllowed = !!user?.role && allowedRoles.includes(user.role as UserRole);

  const [meta, setMeta] = useState<ICaisseListItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  useEffect(() => {
    if (!caisseId || status !== 'authenticated' || !isAllowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/caisse/caisses/${caisseId}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setLoadError(json.error || t('common.error'));
          setMeta(null);
          return;
        }
        // Garde-fou côté client : si la caisse retournée n'est pas du domaine
        // attendu (cas où un super-ADMIN navigue par URL), on redirige.
        if (json.data?.caisseType && json.data.caisseType !== caisseType) {
          setLoadError(t('common.error'));
          setMeta(null);
          return;
        }
        setMeta(json.data);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError(t('common.errorNetwork'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caisseId, status, isAllowed, caisseType, t]);

  const sessionLoading = status === 'loading' || !user || !router.isReady;
  const waitingMeta =
    Boolean(caisseId) && status === 'authenticated' && !meta && !loadError;

  const panelSubtitle = meta
    ? t('dashboard.caisses.detailSubtitleSolde', {
        solde: meta.solde.toLocaleString('fr-FR'),
      })
    : '';

  const headerTitle = meta?.nom ?? t('dashboard.caisseDetail.compteHeader');
  const headerSubtitle = sessionLoading
    ? t('actions.loading')
    : !caisseId
      ? t('common.error')
      : loadError
        ? loadError
        : waitingMeta
          ? t('actions.loading')
          : panelSubtitle || undefined;

  const backList =
    user && router.isReady ? (
      <Button variant="outline" size="sm" asChild className="shrink-0">
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4 rtl:rotate-180" />
          {t('actions.back')}
        </Link>
      </Button>
    ) : undefined;

  if (!isAllowed) return null;

  return (
    <DashboardLayout>
      <PageHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        backButton={backList}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'} className="max-w-full">
        {sessionLoading || waitingMeta ? (
          <PageSkeleton type="list" rows={isMobile ? 5 : 10} />
        ) : !caisseId ? (
          <p className="text-muted-foreground">{t('common.error')}</p>
        ) : loadError ? (
          <p className="text-destructive">{loadError}</p>
        ) : !meta ? (
          <p className="text-muted-foreground">{t('common.redirecting')}</p>
        ) : (
          <CaisseTransactionsPanel
            caisseId={caisseId}
            title={meta.nom}
            subtitle={panelSubtitle}
            backHref={backHref}
            hidePanelHeading
          />
        )}
      </PageContent>
    </DashboardLayout>
  );
}
