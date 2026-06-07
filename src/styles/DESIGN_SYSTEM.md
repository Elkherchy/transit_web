# Emama Group - Design System v2

## Architecture Mobile-First Responsive

Ce design system est optimisé pour une expérience utilisateur fluide sur tous les appareils, avec une approche **mobile-first**.

## 📱 Philosophie Mobile-First

- **Base mobile** : Tous les styles commencent par les petits écrans
- **Progressive Enhancement** : Améliorations pour les écrans plus grands
- **Touch Targets** : Minimum 44px pour les éléments interactifs (WCAG 2.5.5)
- **Fluid Typography** : Tailles de texte adaptatives avec `clamp()`

## 🎨 Design Tokens

### Couleurs
```css
--brand-primary: #02389b        /* Bleu Emama */
--brand-primary-dark: #022a66
--brand-primary-light: #0148a8
--brand-accent: #f59e0b         /* Orange accent */
--brand-accent-light: #fbbf24
```

### Espacement
```css
--space-1: 0.25rem   /* 4px */
--space-2: 0.5rem    /* 8px */
--space-3: 0.75rem   /* 12px */
--space-4: 1rem      /* 16px */
--space-5: 1.25rem   /* 20px */
--space-6: 1.5rem    /* 24px */
```

### Touch Targets
```css
--touch-target-min: 44px           /* Minimum WCAG */
--touch-target-comfortable: 48px   /* Recommandé */
```

### Typographie (Fluid)
```css
--text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)
--text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem)
--text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem)
--text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem)
```

## 🧩 Composants Disponibles

### Layout (responsive-layout.tsx)

| Composant | Usage |
|-----------|-------|
| `Container` | Conteneur avec max-width et padding responsive |
| `ResponsiveGrid` | Grille CSS avec breakpoints configurables |
| `Stack` | Layout vertical avec espacement |
| `Row` | Layout horizontal responsive |
| `Section` | Section avec padding vertical et background |
| `Show` | Affichage conditionnel par breakpoint |
| `AspectRatio` | Container avec ratio d'aspect fixe |

**Exemple :**
```tsx
import { Container, ResponsiveGrid } from '@/components/ui';

<Container size="xl" padding="md">
  <ResponsiveGrid cols={1} sm={2} lg={4} gap="md">
    <StatCard title="Total" value="1,234" />
    <StatCard title="Actifs" value="567" />
    <StatCard title="En attente" value="89" />
    <StatCard title="Complétés" value="578" />
  </ResponsiveGrid>
</Container>
```

### Page Components (page-components.tsx)

| Composant | Usage |
|-----------|-------|
| `PageHeader` | En-tête de page avec titre et actions |
| `PageContent` | Container principal du contenu |
| `ActionBar` | Barre d'actions flottante (sticky) |
| `EmptyState` | État vide avec icône et CTA |
| `StatCard` | Carte de statistique |
| `StatsGrid` | Grille de statistiques |
| `FormSection` | Section de formulaire |
| `FormRow` | Ligne de formulaire responsive |
| `PageSkeleton` | Skeleton loading |
| `DetailItem` / `DetailList` | Liste de détails clé-valeur |

**Exemple :**
```tsx
import { PageHeader, PageContent, StatsGrid, StatCard } from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';

function DashboardPage() {
  const isMobile = useIsMobile();
  
  return (
    <>
      <PageHeader 
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité"
        sticky={isMobile}
      />
      <PageContent>
        <StatsGrid columns={isMobile ? 2 : 4}>
          <StatCard title="Chiffre" value="€45,000" />
          <StatCard title="Clients" value="123" />
          <StatCard title="Factures" value="45" />
          <StatCard title="Paiements" value="38" />
        </StatsGrid>
      </PageContent>
    </>
  );
}
```

### Mobile Components (mobile-entity-card.tsx)

| Composant | Usage |
|-----------|-------|
| `MobileEntityCard` | Carte mobile pour afficher une entité |
| `ResponsiveTableArea` | Zone qui bascule tableau/cartes selon breakpoint |

**Exemple :**
```tsx
import { MobileEntityCard, ResponsiveTableArea } from '@/components/ui';

<ResponsiveTableArea
  table={<DataTable data={data} />}
  mobileList={
    data.map(item => (
      <MobileEntityCard
        key={item.id}
        title={item.name}
        subtitle={item.email}
        fields={[
          { label: 'Téléphone', value: item.phone },
          { label: 'Statut', value: <Badge>{item.status}</Badge> },
        ]}
        actions={<DropdownMenu>...</DropdownMenu>}
      />
    ))
  }
/>
```

## 🪝 Hooks Responsive (use-responsive.ts)

| Hook | Usage |
|------|-------|
| `useIsMobile()` | Détecte si écran < 768px |
| `useIsShortScreen()` | Détecte si écran court (petite hauteur) |
| `useOrientation()` | Détecte portrait/landscape |
| `useIsTouchDevice()` | Détecte si appareil tactile |
| `useSafeArea()` | Récupère les insets iOS/Android |
| `useNetworkStatus()` | État de la connexion réseau |
| `useViewportHeight()` | Hauteur viewport (corrige barre d'adresse mobile) |
| `useScrollPosition()` | Position du scroll |
| `usePrefersReducedMotion()` | Animations réduites préférées |
| `useDarkMode()` | Mode sombre actif |
| `useInView()` | Élément visible dans viewport |
| `useFocusTrap()` | Piège le focus (accessibilité) |
| `useSwipe()` | Gestes swipe tactile |
| `useBottomSheet()` | Contrôle du bottom sheet |

**Exemple :**
```tsx
import { useIsMobile, useNetworkStatus, useScrollPosition } from '@/hooks/use-responsive';

function MyComponent() {
  const isMobile = useIsMobile();
  const { isOnline } = useNetworkStatus();
  const { isScrolled } = useScrollPosition();
  
  return (
    <div className={isScrolled ? 'shadow-lg' : ''}>
      {!isOnline && (
        <Alert>Mode hors-ligne</Alert>
      )}
      {isMobile ? <MobileView /> : <DesktopView />}
    </div>
  );
}
```

## 📐 Breakpoints

```
sm: 640px   /* Petits appareils */
md: 768px   /* Tablettes */
lg: 1024px  /* Desktop */
xl: 1280px  /* Grands écrans */
2xl: 1536px /* Très grands écrans */
```

## 🎯 Classes Utilitaires

### Safe Area (iOS Notch / Android)
```css
.pb-safe    /* Padding bottom safe area */
.pt-safe    /* Padding top safe area */
.px-safe    /* Padding horizontal safe area */
```

### Touch Targets
```css
.touch-target             /* 44px minimum */
.touch-target-comfortable  /* 48px recommandé */
```

### Typographie Fluid
```css
.text-fluid-xs   /* 12px → 14px */
.text-fluid-sm   /* 14px → 16px */
.text-fluid-base /* 16px → 18px */
.text-fluid-lg   /* 18px → 20px */
.text-fluid-xl   /* 20px → 24px */
```

### Glass / Backdrop
```css
.glass         /* bg-white/80 backdrop-blur-md */
.glass-strong  /* bg-white/95 backdrop-blur-lg */
```

### Ombres
```css
.shadow-card          /* Ombre légère */
.shadow-card-hover   /* Ombre au hover */
.shadow-card-elevated /* Ombre marquée */
```

## 🎬 Animations

```css
.animate-fade-in        /* Fade in simple */
.animate-slide-up       /* Slide from bottom */
.animate-scale-in       /* Scale from 95% */
.animate-slide-in-right /* Slide from right */
```

## ♿ Accessibilité

- **Touch targets** : Minimum 44×44px (WCAG 2.5.5)
- **Reduced motion** : Respecte `prefers-reduced-motion`
- **High contrast** : Supporte `prefers-contrast: high`
- **Focus visible** : Styles de focus clairs
- **Screen reader** : Support ARIA complet

## 🔧 Utilisation dans le Dashboard

```tsx
// Exemple complet de page dashboard
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  PageHeader, 
  PageContent, 
  StatsGrid, 
  StatCard,
  EmptyState,
  PageSkeleton 
} from '@/components/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNetworkStatus } from '@/hooks/use-responsive';

export default function DashboardPage() {
  const isMobile = useIsMobile();
  const { isOnline } = useNetworkStatus();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);

  if (loading) {
    return (
      <DashboardLayout>
        <PageHeader title="Tableau de bord" />
        <PageContent>
          <PageSkeleton type="stats" />
          <PageSkeleton type="list" rows={5} />
        </PageContent>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader 
        title="Tableau de bord"
        subtitle={!isOnline ? 'Mode hors-ligne' : undefined}
        actions={
          <Button>Exporter</Button>
        }
        sticky={isMobile}
      />
      
      <PageContent>
        <StatsGrid columns={isMobile ? 2 : 4}>
          <StatCard title="Total" value="1,234" icon={<Icon />} />
          <StatCard title="Actifs" value="567" icon={<Icon />} />
          <StatCard title="En attente" value="89" icon={<Icon />} />
          <StatCard title="Complétés" value="578" icon={<Icon />} />
        </StatsGrid>
        
        {data.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title="Aucune donnée"
            description="Commencez par ajouter votre premier élément"
            action={<Button>Nouveau</Button>}
          />
        ) : (
          <DataTable data={data} />
        )}
      </PageContent>
    </DashboardLayout>
  );
}
```

## 📚 Bonnes Pratiques

1. **Toujours utiliser `useIsMobile`** pour les adaptations spécifiques
2. **Privilégier les composants responsive** plutôt que les media queries CSS
3. **Tester sur mobile d'abord** - Chrome DevTools mobile
4. **Utiliser les touch targets** pour les éléments interactifs
5. **Respecter les safe areas** sur iOS/Android
6. **Gérer le offline** avec `useNetworkStatus`
7. **Optimiser les images** pour mobile (lazy loading, formats modernes)
8. **Minimiser les re-renders** avec React.memo si nécessaire

## 🚀 Performance

- CSS avec **purging automatique** via Tailwind
- **Lazy loading** des composants lourds
- **Intersection Observer** pour le chargement à la volée
- **will-change** sur les animations
- **CSS containment** pour isoler les repaints
