import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { DataListSurface } from '@/components/ui/data-list-surface';
import { DataListSurfaceProvider } from '@/components/ui/data-list-surface';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';
import LanguageSwitcher from './LanguageSwitcher';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Wallet,
  UserRound,
  Users,
  LogOut,
  Menu,
  X,
  UserCircle2,
  BriefcaseBusiness,
  Package,
  ArrowRightLeft,
  Lock,
  ShoppingCart,
  ClipboardCheck,
  ShieldCheck,
  ChevronDown,
  Download,
  CreditCard,
} from 'lucide-react';
import { getPwaInstallPrompt, clearPwaInstallPrompt } from '@/lib/pwa-install';

interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  roles: UserRole[];
  parentHref?: string;
  nonClickable?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_I18N_BY_HREF: Record<string, string> = {
  '/dashboard': 'nav.items.dashboard',
  '/dashboard/payeur': 'nav.items.dashboard',
  '/dashboard/caissier': 'nav.items.dashboard',
  '/dashboard/caissier/factures-client': 'nav.items.facturesClient',
  '/dashboard/transit/bls/valides': 'nav.items.blsTransitValides',
  '/dashboard/transit/bls/non-valides': 'nav.items.blsTransitNonValides',
  '/dashboard/factures': 'nav.items.factures',
  '/dashboard/factures/credit-compte': 'nav.items.creditsCompte',
  '/dashboard/admin/clients': 'nav.items.clients',
  '/dashboard/caisses': 'nav.items.comptes',
  '/dashboard/admin/transit/caisse': 'nav.items.caisseTransit',
  '/dashboard/admin/transit/debiteurs': 'nav.items.debiteursTransit',
  '/dashboard/admin/transit/mouvement-general': 'nav.items.mouvementTransit',
  '/dashboard/caisses/mine': 'nav.items.maCaisse',
  '/dashboard/caissier/caisse': 'nav.items.maCaisse',
  '/dashboard/admin/manutention': 'nav.items.manutention',
  '/dashboard/transit/journees': 'nav.items.journees',
  '/dashboard/transit/depenses-categories': 'nav.items.depensesCategories',
  '/dashboard/transit/depenses-clients': 'nav.items.depensesClients',
  '/dashboard/transit/operations-a-valider': 'nav.items.opsValider',
  '/dashboard/caissier/operations-a-valider': 'nav.items.opsValider',
  '/dashboard/caissier/depenses': 'nav.items.depenses',
  '/dashboard/utilisateurs': 'nav.items.utilisateurs',
  '/dashboard/payeur/transits-disponibles': 'nav.items.transitsDisponibles',
  '/dashboard/caissier/alimentations': 'nav.items.alimenterPayeurs',
  '/dashboard/caissier/cloturer-journee': 'nav.items.cloturerJournee',
  '/dashboard/caissier/factures-manutention': 'nav.items.facturesManutention',
  '/dashboard/profil': 'nav.items.monProfil',
};

const SECTION_I18N_BY_TITLE: Record<string, string> = {
  Navigation: 'nav.sections.navigation',
  Principal: 'nav.sections.principal',
  Transit: 'nav.sections.transit',
  Administration: 'nav.sections.administration',
  Compte: 'nav.sections.compte',
};

const navItemsFlat: NavItem[] = [
  {
    label: 'Tableau de bord',
    href: '/dashboard',
    Icon: LayoutDashboard,
    roles: Object.values(UserRole).filter((role) => role !== UserRole.USER_PAYEUR),
  },
  {
    label: 'Factures Client',
    href: '/dashboard/factures',
    Icon: Receipt,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE],
  },
  {
    label: 'Crédits Compte',
    href: '/dashboard/factures/credit-compte',
    Icon: CreditCard,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE],
  },
  {
    label: 'Clients',
    href: '/dashboard/admin/clients',
    Icon: UserRound,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Comptes',
    href: '/dashboard/caisses',
    Icon: Wallet,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },
  {
    label: 'Caisse Transit',
    href: '/dashboard/admin/transit/caisse',
    Icon: Wallet,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Débiteurs Transit',
    href: '/dashboard/admin/transit/debiteurs',
    Icon: UserRound,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE],
  },
  {
    label: 'Mouvement Transit',
    href: '/dashboard/admin/transit/mouvement-general',
    Icon: BriefcaseBusiness,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.COMPTABLE],
  },
  {
    label: 'Liste BL Transit (Validé)',
    href: '/dashboard/transit/bls/valides',
    Icon: FileText,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_TRANSIT,
      UserRole.AGENT_TRANSIT,
      UserRole.CAISSIER,
      UserRole.COMPTABLE,
    ],
  },
  {
    label: 'Liste BL Transit (Non Validé)',
    href: '/dashboard/transit/bls/non-valides',
    Icon: FileText,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Manutention',
    href: '/dashboard/admin/manutention',
    Icon: Package,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Journées',
    href: '/dashboard/transit/journees',
    Icon: ClipboardCheck,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Catégories dépenses',
    href: '/dashboard/transit/depenses-categories',
    Icon: BriefcaseBusiness,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Clients dépense',
    href: '/dashboard/transit/depenses-clients',
    Icon: UserRound,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Dépenses',
    href: '/dashboard/caissier/depenses',
    Icon: BriefcaseBusiness,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Opérations à valider',
    href: '/dashboard/transit/operations-a-valider',
    Icon: ShieldCheck,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT],
  },
  {
    label: 'Utilisateurs',
    href: '/dashboard/utilisateurs',
    Icon: Users,
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT],
  },
];

const payeurNavSections: NavSection[] = [
  {
    title: 'Navigation',
    items: [
      {
        label: 'Tableau de bord',
        href: '/dashboard/payeur',
        Icon: LayoutDashboard,
        roles: [UserRole.USER_PAYEUR],
      },
      {
        label: 'Transits disponibles',
        href: '/dashboard/payeur/transits-disponibles',
        Icon: ShoppingCart,
        roles: [UserRole.USER_PAYEUR],
      },
      {
        label: 'Ma caisse',
        href: '/dashboard/caisses/mine',
        Icon: Wallet,
        roles: [UserRole.USER_PAYEUR],
      },
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [UserRole.USER_PAYEUR],
      },
    ],
  },
];

const caissierNavSections: NavSection[] = [
  {
    title: 'Navigation',
    items: [
      {
        label: 'Tableau de bord',
        href: '/dashboard/caissier',
        Icon: LayoutDashboard,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Factures Client',
        href: '/dashboard/caissier/factures-client',
        Icon: Receipt,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Ma caisse',
        href: '/dashboard/caissier/caisse',
        Icon: Wallet,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Alimenter payeurs',
        href: '/dashboard/caissier/alimentations',
        Icon: ArrowRightLeft,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Dépenses',
        href: '/dashboard/caissier/depenses',
        Icon: BriefcaseBusiness,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Opérations à valider',
        href: '/dashboard/caissier/operations-a-valider',
        Icon: ShieldCheck,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Clôturer la journée',
        href: '/dashboard/caissier/cloturer-journee',
        Icon: Lock,
        roles: [UserRole.CAISSIER],
      },
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [UserRole.CAISSIER],
      },
    ],
  },
];

function buildNavSections(items: NavItem[]): NavSection[] {
  const transitGroupHrefs = [
    '/dashboard/admin/transit/mouvement-general',
    '/dashboard/admin/transit/caisse',
    '/dashboard/admin/transit/debiteurs',
    '/dashboard/transit/bls/valides',
    '/dashboard/transit/bls/non-valides',
    '/dashboard/factures',
    '/dashboard/factures/credit-compte',
    '/dashboard/admin/clients',
    '/dashboard/admin/manutention',
    '/dashboard/transit/journees',
    '/dashboard/transit/depenses-categories',
    '/dashboard/transit/depenses-clients',
    '/dashboard/caissier/depenses',
    '/dashboard/transit/operations-a-valider',
  ];
  const administrationHrefs = ['/dashboard/utilisateurs'];

  const indexOf = (hrefs: string[]) => (h: string) => {
    const i = hrefs.indexOf(h);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = (hrefs: string[]) =>
    items
      .filter((i) => hrefs.includes(i.href))
      .sort((a, b) => indexOf(hrefs)(a.href) - indexOf(hrefs)(b.href));

  const sections = [
    {
      title: 'Principal',
      items: items.filter((i) => ['/dashboard', '/dashboard/caisses'].includes(i.href)),
    },
    { title: 'Transit', items: ordered(transitGroupHrefs) },
    { title: 'Administration', items: ordered(administrationHrefs) },
  ].filter((s) => s.items.length > 0);

  sections.push({
    title: 'Compte',
    items: [
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [UserRole.ADMIN, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE, UserRole.CAISSIER],
      },
    ],
  });

  return sections;
}

function roleLabel(role: UserRole, isPayeur: boolean): string {
  if (isPayeur) return 'Utilisateur payeur';
  switch (role) {
    case UserRole.ADMIN: return 'Administrateur';
    case UserRole.ADMIN_TRANSIT: return 'Admin transit';
    case UserRole.AGENT_TRANSIT: return 'Agent transit';
    case UserRole.COMPTABLE: return 'Comptable';
    case UserRole.USER_PAYEUR: return 'Payeur';
    case UserRole.CAISSIER: return 'Caissier';
    default: return role;
  }
}

function userInitials(name: string | null | undefined, email: string | null | undefined): string {
  const value = (name || email || '?').trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return value.slice(0, 2).toUpperCase();
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  dataListSurface?: DataListSurface;
}

export default function DashboardLayout({ children, dataListSurface }: DashboardLayoutProps) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = session?.user;


  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    if ((navigator as { standalone?: boolean }).standalone === true) return true;
    try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
  });

  useEffect(() => {
    const onInstalled = () => setIsStandalone(true);
    window.addEventListener('appinstalled', onInstalled);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(display-mode: standalone)');
      const onMq = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
      mq.addEventListener('change', onMq);
      return () => { window.removeEventListener('appinstalled', onInstalled); mq!.removeEventListener('change', onMq); };
    } catch {
      return () => window.removeEventListener('appinstalled', onInstalled);
    }
  }, []);

  const [showPwaInstructions, setShowPwaInstructions] = useState(false);

  const handlePwaInstall = useCallback(async () => {
    const prompt = getPwaInstallPrompt();
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      clearPwaInstallPrompt();
    } else {
      setShowPwaInstructions(true);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      void router.replace('/login');
    }
  }, [status, router]);

  const filteredNavSections = useMemo(() => {
    if (!user) return [];
    if (user.role === UserRole.USER_PAYEUR) return payeurNavSections;
    if (user.role === UserRole.CAISSIER) return caissierNavSections;
    const filteredItems = navItemsFlat.filter((item) => item.roles.includes(user.role));
    return buildNavSections(filteredItems);
  }, [user]);

  const allFilteredNavItems = useMemo(
    () => filteredNavSections.flatMap((s) => s.items),
    [filteredNavSections]
  );

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobileMenu(); };
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isMobileMenuOpen, closeMobileMenu]);

  const activeHref = useMemo(() => {
    const currentPath = router.pathname;
    const matched = allFilteredNavItems
      .filter((item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length);
    return matched[0]?.href ?? null;
  }, [allFilteredNavItems, router.pathname]);

  const parentByHref = useMemo(
    () => new Map(allFilteredNavItems.map((item) => [item.href, item.parentHref])),
    [allFilteredNavItems]
  );

  const navDepth = useCallback(
    (item: NavItem) => {
      let depth = 0;
      let cursor = item.parentHref;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        depth += 1;
        cursor = parentByHref.get(cursor);
      }
      return depth;
    },
    [parentByHref]
  );

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#02389B]" />
          <p className="text-sm text-slate-500">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isPayeur = user.role === UserRole.USER_PAYEUR;

  // ── Nav item ──────────────────────────────────────────────────────────────
  const NavLink = ({ item }: { item: NavItem }) => {
    const active = item.href === activeHref;
    const Icon = item.Icon;
    const depth = navDepth(item);
    const isSubItem = depth > 0;

    const label = NAV_I18N_BY_HREF[item.href]
      ? t(NAV_I18N_BY_HREF[item.href], { defaultValue: item.label })
      : item.label;

    if (item.nonClickable) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 select-none">
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <span>{label}</span>
        </div>
      );
    }

    return (
      <Link
        href={item.href}
        onClick={closeMobileMenu}
        className={cn(
          'group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[13px] font-medium transition-colors duration-100',
          'outline-none focus-visible:ring-2 focus-visible:ring-[#02389B]/40',
          isSubItem && 'ml-5 pl-2.5 text-[12.5px]',
          active
            ? 'bg-[#02389B]/[0.07] text-[#02389B] font-semibold'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        {/* left accent bar */}
        {active && (
          <span
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#02389B]"
            aria-hidden
          />
        )}
        <Icon
          className={cn(
            'shrink-0',
            isSubItem ? 'h-3.5 w-3.5' : 'h-4 w-4',
            active ? 'text-[#02389B]' : 'text-slate-400 group-hover:text-slate-600'
          )}
          strokeWidth={active ? 2.1 : 1.75}
          aria-hidden
        />
        <span className="truncate leading-none">{label}</span>
      </Link>
    );
  };

  // ── Sidebar content ───────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex h-full flex-col">

      {/* ── Brand / workspace selector ── */}
      <div className="shrink-0 border-b border-slate-200 px-3 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02389B]/40"
        >
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <Image
              src="/emama-favorie.png"
              alt="SNTS"
              width={28}
              height={28}
              className="object-contain p-0.5"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-800 leading-none">
              SNTS
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400 leading-none">
              {roleLabel(user.role, isPayeur)}
            </p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} />
        </button>
      </div>

      {/* ── Nav sections ── */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3"
        aria-label="Navigation principale"
      >
        <div className="space-y-4">
          {filteredNavSections.map((section) => (
            <div key={section.title}>
              {/* section label — hide "Principal" and "Navigation" */}
              {section.title !== 'Principal' && section.title !== 'Navigation' && (
                <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  {SECTION_I18N_BY_TITLE[section.title]
                    ? t(SECTION_I18N_BY_TITLE[section.title], { defaultValue: section.title })
                    : section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={`${item.href}-${item.label}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Footer: user + logout ── */}
      <div className="shrink-0 border-t border-slate-200 px-2 py-3 space-y-0.5">
        <Link
          href="/dashboard/profil"
          onClick={closeMobileMenu}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02389B]/40"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#02389B] text-[10px] font-bold text-white">
            {userInitials(user.name, user.email)}
          </div>
          <span className="min-w-0 flex-1 truncate leading-none">
            {user.name || user.email}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02389B]/40"
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
          <span>{t('nav.logout', { defaultValue: 'Déconnexion' })}</span>
        </button>
        {!isStandalone && (
          <button
            type="button"
            onClick={() => void handlePwaInstall()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#02389B]/40"
          >
            <Download className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
            <span>{t('pwa.installBtn', { defaultValue: "Installer l'app" })}</span>
          </button>
        )}
      </div>
    </div>
  );

  // ── Mobile top bar ────────────────────────────────────────────────────────
  const mobileHeader = (
    <header className="z-50 flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <div className="relative h-7 w-7 overflow-hidden rounded-md border border-slate-200 bg-white">
          <Image src="/emama-favorie.png" alt="Emama" width={28} height={28} className="object-contain p-0.5" />
        </div>
        <span className="text-sm font-bold text-slate-800">SNTS</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher variant="light" />
        <Link
          href="/dashboard/profil"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#02389B] text-[11px] font-bold text-white"
          aria-label="Mon profil"
        >
          {userInitials(user.name, user.email)}
        </Link>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          onClick={() => setIsMobileMenuOpen((o) => !o)}
          aria-expanded={isMobileMenuOpen}
          aria-controls="dashboard-mobile-nav"
          aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">

      {/* Mobile top bar */}
      <div className="lg:hidden">{mobileHeader}</div>

      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── Desktop sidebar ── */}
        <aside className="sticky top-0 hidden h-full w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          {sidebarContent}
        </aside>

        {/* ── Desktop top bar (above content) ── */}
        <div className="hidden lg:flex lg:flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
          <header className="z-40 flex h-[52px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
            <div />
            <div className="flex items-center gap-2">
              <LanguageSwitcher variant="light" />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-0 py-4 lg:py-6">
            <DataListSurfaceProvider value={dataListSurface ?? 'comfortable'}>
              {children}
            </DataListSurfaceProvider>
          </main>
        </div>

        {/* ── Mobile content ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-0 py-4">
            <DataListSurfaceProvider value={dataListSurface ?? 'comfortable'}>
              {children}
            </DataListSurfaceProvider>
          </main>
        </div>

        {/* ── Mobile drawer backdrop ── */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden"
            aria-hidden
            onClick={closeMobileMenu}
          />
        )}

        {/* ── Mobile drawer ── */}
        <aside
          id="dashboard-mobile-nav"
          role="dialog"
          aria-modal={isMobileMenuOpen ? true : undefined}
          aria-hidden={!isMobileMenuOpen}
          aria-label="Menu de navigation"
          className={cn(
            'fixed left-0 top-[52px] z-50 h-[calc(100dvh-52px)] w-[240px] border-r border-slate-200 bg-white shadow-xl transition-transform duration-250 ease-out will-change-transform lg:hidden',
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          )}
        >
          {sidebarContent}
        </aside>
      </div>

      {/* ── PWA install instructions dialog ── */}
      {showPwaInstructions && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowPwaInstructions(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-sm">{t('pwa.instructionsTitle')}</p>

            {/* Desktop Chrome */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">💻 {t('pwa.instructionsChromePc')}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t('pwa.instructionsChromeStep1')}</li>
                <li><strong>{t('pwa.instructionsChromeStep2')}</strong></li>
                <li><strong>{t('pwa.instructionsChromeStep3')}</strong></li>
              </ol>
              <p className="text-xs text-slate-400 italic">{t('pwa.instructionsChromeBar')}</p>
            </div>

            {/* Android */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">🤖 {t('pwa.instructionsAndroid')}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t('pwa.instructionsAndroidStep1')}</li>
                <li><strong>{t('pwa.instructionsAndroidStep2')}</strong></li>
              </ol>
            </div>

            {/* iOS */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">🍎 {t('pwa.instructionsIos')}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t('pwa.instructionsIosStep1')}</li>
                <li><strong>{t('pwa.instructionsIosStep2')}</strong></li>
              </ol>
            </div>

            <button
              onClick={() => setShowPwaInstructions(false)}
              className="w-full rounded-lg bg-[#02389B] py-2 text-sm font-semibold text-white hover:bg-[#02389B]/90 transition-colors"
            >
              {t('pwa.instructionsClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
