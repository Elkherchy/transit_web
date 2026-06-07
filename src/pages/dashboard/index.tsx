import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PageHeader, PageContent } from '@/components/ui';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { UserRole } from '@/types';


export default function Dashboard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading' || !user) return;
    switch (user.role) {
      case UserRole.ADMIN:
      case UserRole.ADMIN_TRANSIT:
      case UserRole.ADMIN_LOGISTIQUE:
        // Les 3 admins atterrissent sur le même tableau de bord ;
        // la sidebar et les modules visibles s'adaptent au rôle.
        void router.replace('/dashboard/admin');
        return;
      case UserRole.AGENT_TRANSIT:
        void router.replace('/dashboard/agent-transit');
        return;
      case UserRole.COMPTABLE:
        void router.replace('/dashboard/comptable');
        return;
      case UserRole.CAISSIER:
        void router.replace('/dashboard/caissier');
        return;
      case UserRole.USER_PAYEUR:
        void router.replace('/dashboard/payeur');
        return;
      case UserRole.CHAUFFEUR:
        void router.replace('/dashboard/chauffeur');
        return;
      case UserRole.AGENT_RECEPTION_LOGISTIQUE:
        void router.replace('/dashboard/agent-reception-logistique');
        return;
      default:
        return;
    }
  }, [status, user, router]);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitleRedirect')}
      />
      <PageContent>
        <div className="flex min-h-[40vh] items-center justify-center rounded-lg max-md:px-4 max-md:py-3 border shadow-sm text-muted-foreground text-sm">
          {t('common.redirecting')}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
