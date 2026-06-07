import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/layout/DashboardLayout';

import { PageHeader, PageContent } from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { UserRole } from '@/types';
import {
  ClipboardList,
  Truck,
  Wallet,
  Package,
  ClipboardCheck,
  ArrowRight,
} from 'lucide-react';

interface ShortcutCard {
  /** Sous-clé i18n sous `dashboard.logistique.shortcuts.*` (`title`, `description`). */
  i18nKey: string;
  href: string;
  Icon: typeof Truck;
  roles: UserRole[];
}

const SHORTCUTS: ShortcutCard[] = [
  {
    i18nKey: 'fichiers',
    href: '/dashboard/logistique/fichiers',
    Icon: ClipboardList,
    roles: [
      UserRole.ADMIN,
      UserRole.AGENT_RECEPTION_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
  },
  {
    i18nKey: 'mesVoyages',
    href: '/dashboard/logistique/mes-voyages',
    Icon: Truck,
    roles: [UserRole.ADMIN, UserRole.CHAUFFEUR],
  },
  {
    i18nKey: 'paiementsChauffeurs',
    href: '/dashboard/logistique/paiements-chauffeurs',
    Icon: Wallet,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },
  {
    i18nKey: 'vehicules',
    href: '/dashboard/logistique/vehicule',
    Icon: Truck,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },
  {
    i18nKey: 'bonsCommande',
    href: '/dashboard/logistique/bons-commande',
    Icon: Package,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },
  {
    i18nKey: 'locations',
    href: '/dashboard/logistique/locations',
    Icon: ClipboardCheck,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },
];

export default function LogistiqueDashboard() {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = session?.user;
  const isAllowed =
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.ADMIN_LOGISTIQUE ||
    user?.role === UserRole.COMPTABLE ||
    user?.role === UserRole.AGENT_TRANSIT ||
    user?.role === UserRole.AGENT_RECEPTION_LOGISTIQUE ||
    user?.role === UserRole.CHAUFFEUR;

  useEffect(() => {
    if (status !== 'loading' && user && !isAllowed) {
      void router.replace('/dashboard');
    }
  }, [status, user, isAllowed, router]);

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <PageHeader title={t('dashboard.logistique.title')} />
      </DashboardLayout>
    );
  }

  if (!isAllowed) return null;

  const visible = SHORTCUTS.filter((s) => s.roles.includes(user!.role));

  return (
    <DashboardLayout>
      <PageHeader
        title={t('dashboard.logistique.title')}
        subtitle={t('dashboard.logistique.subtitle')}
        sticky={isMobile}
      />
      <PageContent padding={isMobile ? 'sm' : 'md'}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 focus-visible:ring-offset-2 rounded-lg"
            >
              <Card className="transition-shadow group-hover:shadow-md h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-semibold text-primary flex items-center gap-2">
                    <s.Icon className="h-5 w-5 text-blue-600" />
                    {t(`dashboard.logistique.shortcuts.${s.i18nKey}.title`)}
                  </CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`dashboard.logistique.shortcuts.${s.i18nKey}.description`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </PageContent>
    </DashboardLayout>
  );
}
