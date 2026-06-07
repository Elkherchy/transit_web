import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent } from '@/components/ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { UserRole } from '@/types';

/**
 * Page conservée pour compatibilité — la création des factures manutention
 * est désormais réservée à l'admin (`/dashboard/admin/manutention/create`).
 * Cette page redirige les caissiers vers les alimentations payeurs.
 */
export default function LegacyCaissierCreateRedirect() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const user = session?.user;
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading' || !user) return;
    if (user.role === UserRole.ADMIN) {
      void router.replace('/dashboard/admin/manutention/create');
    } else if (user.role !== UserRole.CAISSIER) {
      void router.replace('/dashboard');
    }
  }, [status, user, router]);

  return (
    <DashboardLayout>
      <PageHeader title={t('dashboard.caissier.factureCreateMoved')} />
      <PageContent>
        <div className="max-w-2xl space-y-4">
          <Alert>
            <AlertDescription>
              La création des factures manutention est désormais réservée à
              l’administrateur. En tant que caissier, votre rôle est
              d’alimenter les caisses des payeurs depuis la caisse générale.
            </AlertDescription>
          </Alert>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/dashboard/caissier/alimentations">
                Aller aux alimentations
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/caissier/cloturer-journee">
                Clôturer la journée
              </Link>
            </Button>
          </div>
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
