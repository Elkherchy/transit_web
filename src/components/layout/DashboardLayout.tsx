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
  Truck,
  UserRound,
  Users,
  LogOut,
  Menu,
  X,
  UserCircle2,
  ClipboardList,
  Boxes,
  BriefcaseBusiness,
  Package,
  ArrowRightLeft,
  Lock,
  ShoppingCart,
  ClipboardCheck,
  ShieldCheck,
} from 'lucide-react';

const SIDEBAR_ICON_CLASS = 'h-5 w-5 shrink-0';

interface NavItem {
  label: string;
  href: string;
  Icon: LucideIcon;
  roles: UserRole[];
  parentHref?: string;
  /** Item de regroupement : affiché comme entête, non cliquable. */
  nonClickable?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/** Mapping href → clé i18n (sous `nav.items.*`). Fallback : libellé FR. */
const NAV_I18N_BY_HREF: Record<string, string> = {
  '/dashboard': 'nav.items.dashboard',
  '/dashboard/agent-reception-logistique': 'nav.items.dashboard',
  '/dashboard/chauffeur': 'nav.items.dashboard',
  '/dashboard/payeur': 'nav.items.dashboard',
  '/dashboard/caissier': 'nav.items.dashboard',
  '/dashboard/caissier/factures-client': 'nav.items.facturesClient',
  '/dashboard/transit/bls/valides': 'nav.items.blsTransitValides',
  '/dashboard/transit/bls/non-valides': 'nav.items.blsTransitNonValides',
  '/dashboard/factures': 'nav.items.factures',
  '/dashboard/admin/clients': 'nav.items.clients',
  '/dashboard/caisses': 'nav.items.comptes',
  '/dashboard/admin/transit/caisse': 'nav.items.caisseTransit',
  '/dashboard/admin/logistique/caisse': 'nav.items.caisseLogistique',
  '/dashboard/admin/transit/debiteurs': 'nav.items.debiteursTransit',
  '/dashboard/admin/logistique/debiteurs': 'nav.items.debiteursLogistique',
  '/dashboard/admin/transit/mouvement-general': 'nav.items.mouvementTransit',
  '/dashboard/admin/logistique/mouvement-general': 'nav.items.mouvementLogistique',
  '/dashboard/caisses/mine': 'nav.items.maCaisse',
  '/dashboard/chauffeur/caisse': 'nav.items.maCaisse',
  '/dashboard/caissier/caisse': 'nav.items.maCaisse',
  '/dashboard/logistique': 'nav.items.logistique',
  '/dashboard/logistique/fichiers': 'nav.items.fichiersLogistique',
  '/dashboard/logistique/clients': 'nav.items.clientsLogistique',
  '/dashboard/logistique/bls': 'nav.items.blsLogistique',
  '/dashboard/logistique/vehicule': 'nav.items.vehicules',
  '/dashboard/logistique/paiements-chauffeurs': 'nav.items.paiementsChauffeurs',
  '/dashboard/logistique/bons-commande': 'nav.items.bonsCommande',
  '/dashboard/logistique/locations': 'nav.items.locations',
  '/dashboard/logistique/mes-voyages': 'nav.items.mesVoyages',
  '/dashboard/paie': 'nav.items.paie',
  '/dashboard/paie/salaries': 'nav.items.salaries',
  '/dashboard/paie/bulletins': 'nav.items.bulletins',
  '/dashboard/admin/manutention': 'nav.items.manutention',
  '/dashboard/transit/journees': 'nav.items.journees',
  '/dashboard/transit/depenses-categories': 'nav.items.depensesCategories',
  '/dashboard/transit/depenses-clients': 'nav.items.depensesClients',
  '/dashboard/caissier/depenses': 'nav.items.depenses',
  '/dashboard/utilisateurs': 'nav.items.utilisateurs',
  '/dashboard/payeur/transits-disponibles': 'nav.items.transitsDisponibles',
  '/dashboard/caissier/alimentations': 'nav.items.alimenterPayeurs',
  '/dashboard/caissier/cloturer-journee': 'nav.items.cloturerJournee',
  '/dashboard/caissier/factures-manutention': 'nav.items.facturesManutention',
  '/dashboard/profil': 'nav.items.monProfil',
};

/** Mapping titre section FR → clé i18n. */
const SECTION_I18N_BY_TITLE: Record<string, string> = {
  Navigation: 'nav.sections.navigation',
  Principal: 'nav.sections.principal',
  Transit: 'nav.sections.transit',
  Logistique: 'nav.sections.logistique',
  'Ressources & Paie': 'nav.sections.ressourcesPaie',
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
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE],
  },
  {
    label: 'Caisse Logistique',
    href: '/dashboard/admin/logistique/caisse',
    Icon: Wallet,
    roles: [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE],
  },
  {
    label: 'Débiteurs Logistique',
    href: '/dashboard/admin/logistique/debiteurs',
    Icon: UserRound,
    roles: [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.COMPTABLE],
  },
  {
    label: 'Mouvement Logistique',
    href: '/dashboard/admin/logistique/mouvement-general',
    Icon: BriefcaseBusiness,
    roles: [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.COMPTABLE],
  },
  {
    label: 'Logistique',
    href: '/dashboard/logistique',
    Icon: Truck,
    roles: [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.COMPTABLE],
    nonClickable: true,
  },
  {
    label: 'Fichiers logistique',
    href: '/dashboard/logistique/fichiers',
    Icon: ClipboardList,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_RECEPTION_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Clients logistique',
    href: '/dashboard/logistique/clients',
    Icon: UserRound,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_RECEPTION_LOGISTIQUE,
    ],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Liste BL Logistique',
    href: '/dashboard/logistique/bls',
    Icon: FileText,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_RECEPTION_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
    parentHref: '/dashboard/logistique',
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
    label: 'Vehicules',
    href: '/dashboard/logistique/vehicule',
    Icon: Truck,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Paiements chauffeurs',
    href: '/dashboard/logistique/paiements-chauffeurs',
    Icon: Wallet,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Bons de commande',
    href: '/dashboard/logistique/bons-commande',
    Icon: ClipboardList,
    roles: [
      UserRole.ADMIN,
      UserRole.ADMIN_LOGISTIQUE,
      UserRole.AGENT_TRANSIT,
      UserRole.COMPTABLE,
    ],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Location',
    href: '/dashboard/logistique/locations',
    Icon: Boxes,
    roles: [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.COMPTABLE],
    parentHref: '/dashboard/logistique',
  },
  {
    label: 'Paie',
    href: '/dashboard/paie',
    Icon: BriefcaseBusiness,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
  },

  {
    label: 'Salaries',
    href: '/dashboard/paie/salaries',
    Icon: Users,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
    parentHref: '/dashboard/paie',
  },
  {
    label: 'Bulletins',
    href: '/dashboard/paie/bulletins',
    Icon: FileText,
    roles: [UserRole.ADMIN, UserRole.COMPTABLE],
    parentHref: '/dashboard/paie',
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
    roles: [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.ADMIN_LOGISTIQUE],
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

const agentReceptionLogistiqueNavSections: NavSection[] = [
  {
    title: 'Navigation',
    items: [
      {
        label: 'Tableau de bord',
        href: '/dashboard/agent-reception-logistique',
        Icon: LayoutDashboard,
        roles: [UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
      {
        label: 'Fichiers logistique',
        href: '/dashboard/logistique/fichiers',
        Icon: ClipboardList,
        roles: [UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
      {
        label: 'Clients logistique',
        href: '/dashboard/logistique/clients',
        Icon: UserRound,
        roles: [UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
      {
        label: 'Ma caisse',
        href: '/dashboard/caisses/mine',
        Icon: Wallet,
        roles: [UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [UserRole.AGENT_RECEPTION_LOGISTIQUE],
      },
    ],
  },
];

const chauffeurNavSections: NavSection[] = [
  {
    title: 'Navigation',
    items: [
      {
        label: 'Tableau de bord',
        href: '/dashboard/chauffeur',
        Icon: LayoutDashboard,
        roles: [UserRole.CHAUFFEUR],
      },
      {
        label: 'Mes voyages',
        href: '/dashboard/logistique/mes-voyages',
        Icon: Truck,
        roles: [UserRole.CHAUFFEUR],
      },
      {
        label: 'Ma caisse',
        href: '/dashboard/chauffeur/caisse',
        Icon: Wallet,
        roles: [UserRole.CHAUFFEUR],
      },
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [UserRole.CHAUFFEUR],
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
  // Ordre regroupé demandé par l'admin :
  //   Principal : Tableau de bord · Comptes
  //   Transit   : Manutention · Journées · Transit · Factures Client · Paiements
  //   Logistique: Logistique + tous ses enfants (Vehicules, Chauffeurs, ...)
  //   Ressources & Paie : Paie + ses enfants · Utilisateurs
  // Ordre optimisé pour la visibilité mobile : les vues KPI / finance admin
  // remontent en tête de section pour être atteignables sans scroll.
  const transitGroupHrefs = [
    '/dashboard/admin/transit/mouvement-general',
    '/dashboard/admin/transit/caisse',
    '/dashboard/admin/transit/debiteurs',
    '/dashboard/transit/bls/valides',
    '/dashboard/transit/bls/non-valides',
    '/dashboard/factures',
    '/dashboard/admin/clients',
    '/dashboard/admin/manutention',
    '/dashboard/transit/journees',
    '/dashboard/transit/depenses-categories',
    '/dashboard/transit/depenses-clients',
    '/dashboard/caissier/depenses',
    '/dashboard/transit/operations-a-valider',
  ];
  const logistiqueGroupHrefs = [
    '/dashboard/admin/logistique/mouvement-general',
    '/dashboard/admin/logistique/caisse',
    '/dashboard/admin/logistique/debiteurs',
    '/dashboard/logistique',
    ...items
      .filter((i) => i.parentHref === '/dashboard/logistique')
      .map((i) => i.href),
  ];
  const paieGroupHrefs = [
    '/dashboard/paie',
    ...items
      .filter((i) => i.parentHref === '/dashboard/paie')
      .map((i) => i.href),
  ];
  const ressourcesPaieHrefs = [...paieGroupHrefs];
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
      items: items.filter((i) =>
        ['/dashboard', '/dashboard/caisses'].includes(i.href)
      ),
    },
    {
      title: 'Transit',
      items: ordered(transitGroupHrefs),
    },
    {
      title: 'Logistique',
      items: ordered(logistiqueGroupHrefs),
    },
    {
      title: 'Ressources & Paie',
      items: ordered(ressourcesPaieHrefs),
    },
    {
      title: 'Administration',
      items: ordered(administrationHrefs),
    },
  ].filter((s) => s.items.length > 0);

  // Mon profil — section finale, tous rôles staff
  sections.push({
    title: 'Compte',
    items: [
      {
        label: 'Mon profil',
        href: '/dashboard/profil',
        Icon: UserCircle2,
        roles: [
          UserRole.ADMIN,
          UserRole.AGENT_TRANSIT,
          UserRole.COMPTABLE,
          UserRole.CAISSIER,
        ],
      },
    ],
  });

  return sections;
}

function roleLabel(role: UserRole, isPayeur: boolean): string {
  if (isPayeur) return 'Utilisateur payeur';
  switch (role) {
    case UserRole.ADMIN:
      return 'Administrateur';
    case UserRole.AGENT_TRANSIT:
      return 'Agent transit';
    case UserRole.COMPTABLE:
      return 'Comptable';
    case UserRole.USER_PAYEUR:
      return 'Payeur';
    case UserRole.CAISSIER:
      return 'Caissier';
    case UserRole.CHAUFFEUR:
      return 'Chauffeur';
    case UserRole.AGENT_RECEPTION_LOGISTIQUE:
      return 'Agent réception logistique';
    default:
      return role;
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

export default function DashboardLayout({
  children,
  dataListSurface,
}: DashboardLayoutProps) {
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = session?.user;

  useEffect(() => {
    if (status === 'unauthenticated') {
      void router.replace('/login');
    }
  }, [status, router]);

  const filteredNavSections = useMemo(() => {
    if (!user) return [];
    if (user.role === UserRole.USER_PAYEUR) return payeurNavSections;
    if (user.role === UserRole.CAISSIER) return caissierNavSections;
    if (user.role === UserRole.CHAUFFEUR) return chauffeurNavSections;
    if (user.role === UserRole.AGENT_RECEPTION_LOGISTIQUE)
      return agentReceptionLogistiqueNavSections;
    const filteredItems = navItemsFlat.filter((item) => item.roles.includes(user.role));
    return buildNavSections(filteredItems);
  }, [user]);

  const allFilteredNavItems = useMemo(() => {
    return filteredNavSections.flatMap((s) => s.items);
  }, [filteredNavSections]);

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen, closeMobileMenu]);

  const activeHref = useMemo(() => {
    const currentPath = router.pathname;
    const matched = allFilteredNavItems
      .filter((item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`))
      .sort((left, right) => right.href.length - left.href.length);
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
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isPayeur = user.role === UserRole.USER_PAYEUR;

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = item.href === activeHref;
    const Icon = item.Icon;
    const depth = navDepth(item);
    const isSubItem = depth > 0;
    const isSubSubItem = depth > 1;

    const label = NAV_I18N_BY_HREF[item.href]
      ? t(NAV_I18N_BY_HREF[item.href], { defaultValue: item.label })
      : item.label;

    const sizeClasses = isSubSubItem
      ? 'ml-8 min-h-[32px] gap-2 rounded-md px-2 py-1.5 text-[12px]'
      : isSubItem
        ? 'ml-6 min-h-[36px] gap-2 rounded-md px-2.5 py-1.5 text-[13px]'
        : 'min-h-[40px] gap-2.5 rounded-md px-3 py-2 text-[14px]';

    const iconSize = isSubSubItem
      ? 'h-3.5 w-3.5'
      : isSubItem
        ? 'h-4 w-4'
        : 'h-[18px] w-[18px]';

    // Item non cliquable : on rend un entête de groupe (pas de <Link>).
    if (item.nonClickable) {
      return (
        <div
          className={cn(
            'group relative flex items-center leading-snug select-none cursor-default',
            sizeClasses,
            'font-semibold uppercase tracking-wider text-blue-100/60 text-[11px]'
          )}
        >
          <Icon
            className={cn(iconSize, 'shrink-0 text-blue-100/60')}
            strokeWidth={1.85}
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </div>
      );
    }

    return (
      <Link
        href={item.href}
        onClick={closeMobileMenu}
        className={cn(
          'group relative flex items-center leading-snug transition-all duration-150',
          sizeClasses,
          'outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#02389B]',
          active
            ? 'bg-white font-semibold text-[#02389B] shadow-sm'
            : 'font-medium text-blue-50/85 hover:bg-white/10 hover:text-white active:bg-white/15'
        )}
      >
        {active ? (
          <span
            className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white"
            aria-hidden
          />
        ) : null}
        <Icon
          className={cn(
            iconSize,
            'shrink-0',
            active ? 'text-[#02389B]' : 'text-blue-100/70 group-hover:text-white'
          )}
          strokeWidth={active ? 2.2 : 1.85}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  const sidebarSurfaceClass =
    'flex flex-col bg-[#02389B] text-white antialiased shadow-[1px_0_0_0_rgba(255,255,255,0.05)]';

  const sidebarNav = (
    <>
      <nav
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-3 py-4"
        aria-label="Navigation principale"
      >
        {filteredNavSections.map((section) => (
          <div key={section.title} className="space-y-1.5">
            <h3 className="px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-blue-200/70">
              {SECTION_I18N_BY_TITLE[section.title]
                ? t(SECTION_I18N_BY_TITLE[section.title], {
                    defaultValue: section.title,
                  })
                : section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink key={`${item.href}-${item.label}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 bg-[#012a78] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/login' })}
          className={cn(
            'flex min-h-[42px] w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left text-sm font-medium text-white transition-colors',
            'hover:bg-white/15 hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50'
          )}
        >
          <LogOut className={cn(SIDEBAR_ICON_CLASS, 'text-blue-100')} strokeWidth={1.9} aria-hidden />
          <span>{t('nav.logout', { defaultValue: 'Déconnexion' })}</span>
        </button>
      </div>
    </>
  );

  const headerBrand = (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <Image
          src="/emama-favorie.png"
          alt="Emama Group"
          width={36}
          height={36}
          className="object-contain p-0.5"
        />
      </div>
      <div className="min-w-0 leading-tight hidden sm:block">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Gestion
        </p>
        <p className="truncate text-sm font-bold text-[#02389B]">Emama</p>
      </div>
    </div>
  );

  const headerProfileDesktop = (
    <Link
      href="/dashboard/profil"
      className="ml-1 hidden min-w-0 items-center gap-2 rounded-lg border border-transparent py-1 px-2 transition-colors hover:border-slate-200 hover:bg-slate-50 lg:inline-flex"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#02389B] text-xs font-semibold text-white shadow-sm"
        aria-hidden
      >
        {userInitials(user.name, user.email)}
      </div>
      <div className="hidden min-w-0 max-w-[200px] xl:block">
        <p className="truncate text-xs font-bold text-slate-800">{user.name || user.email}</p>
        <p className="truncate text-[10px] text-slate-500">{roleLabel(user.role, isPayeur)}</p>
      </div>
    </Link>
  );

  const headerProfileMobile = (
    <Link
      href="/dashboard/profil"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#02389B] text-xs font-semibold text-white shadow-sm ring-2 ring-[#02389B]/20 transition-transform active:scale-95 lg:hidden"
      aria-label="Mon profil"
    >
      {userInitials(user.name, user.email)}
    </Link>
  );

  const headerMobileMenuButton = (
    <button
      type="button"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#02389B] transition-colors hover:bg-slate-50 lg:hidden"
      onClick={() => setIsMobileMenuOpen((open) => !open)}
      aria-expanded={isMobileMenuOpen}
      aria-controls="dashboard-mobile-nav"
      aria-label={
        isMobileMenuOpen
          ? t('nav.closeMenu', { defaultValue: 'Fermer le menu' })
          : t('nav.openMenu', { defaultValue: 'Ouvrir le menu' })
      }
    >
      {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="flex h-screen min-h-screen max-h-screen flex-col overflow-hidden overscroll-none bg-slate-50">
      <header className="z-50 flex h-[56px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">{headerBrand}</div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher variant="light" />
          {headerProfileMobile}
          {headerProfileDesktop}
          {headerMobileMenuButton}
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            sidebarSurfaceClass,
            // Sidebar fixe : prend toute la hauteur disponible (parent
            // h-screen - header), pas de scroll global, seul le <nav> à
            // l'intérieur scrolle si nécessaire.
            'sticky top-0 hidden h-full w-[min(100%,280px)] min-w-[240px] max-w-[292px] shrink-0 flex-col overflow-hidden self-stretch lg:flex'
          )}
        >
          {sidebarNav}
        </aside>

        {isMobileMenuOpen ? (
          <div
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] transition-opacity lg:hidden"
            aria-hidden
            onClick={closeMobileMenu}
          />
        ) : null}

        <aside
          id="dashboard-mobile-nav"
          role="dialog"
          aria-modal={isMobileMenuOpen ? true : undefined}
          aria-hidden={!isMobileMenuOpen}
          aria-label="Menu de navigation"
          className={cn(
            sidebarSurfaceClass,
            'fixed left-0 top-[56px] z-50 flex h-[calc(100dvh-56px)] w-[min(300px,calc(100vw-12px))] max-w-[100vw] flex-col overflow-hidden shadow-lg ring-1 ring-black/10 transition-transform duration-300 ease-out will-change-transform lg:hidden',
            isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [&>nav]:min-h-0">
            {sidebarNav}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-0 py-4 lg:py-6">
          <DataListSurfaceProvider value={dataListSurface ?? 'comfortable'}>
            {children}
          </DataListSurfaceProvider>
        </main>
      </div>
    </div>
  );
}
