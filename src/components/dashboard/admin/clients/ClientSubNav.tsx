import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Eye, Pencil, Receipt, Wallet } from 'lucide-react';

/**
 * Sous-navigation pour les pages détail d'un client (admin).
 * 4 onglets : Détails / Modifier / Factures / Opérations.
 */
export function ClientSubNav({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const tabs = [
    {
      href: `/dashboard/admin/clients/${clientId}`,
      label: t('components.clientSubNav.details'),
      Icon: Eye,
      exact: true,
    },
    {
      href: `/dashboard/admin/clients/${clientId}/modifier`,
      label: t('components.clientSubNav.edit'),
      Icon: Pencil,
    },
    {
      href: `/dashboard/admin/clients/${clientId}/factures`,
      label: t('components.clientSubNav.factures'),
      Icon: Receipt,
    },
    {
      href: `/dashboard/admin/clients/${clientId}/operations`,
      label: t('components.clientSubNav.operations'),
      Icon: Wallet,
    },
  ];

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => {
        const active = t.exact
          ? router.pathname === '/dashboard/admin/clients/[id]'
          : router.pathname === t.href.replace(clientId, '[id]') ||
            router.asPath === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground hover:bg-muted'
            )}
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
