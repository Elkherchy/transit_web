import * as React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Page Header - Responsive avec support mobile
 */
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  backButton?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  backButton,
  className,
  sticky = false,
}: PageHeaderProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div
        className={cn(
       
          className
        )}
      >
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5">
          {/* Actions/Buttons on top */}
          {actions && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {actions}
            </div>
          )}
          {/* Back button row */}
          {backButton && (
            <div className="flex items-center mb-3 shrink-0">
              {backButton}
            </div>
          )}
          {/* Title row */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-primary">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex items-center gap-2 sm:gap-3">
          {backButton && (
            <div className="shrink-0">{backButton}</div>
          )}
          
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-primary lg:text-xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>

          {actions && (
            <div className="flex items-center gap-3 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Page Content - Container responsive pour le contenu des pages
 */
interface PageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  centered?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-[640px]',
  md: 'max-w-[768px]',
  lg: 'max-w-7xl',
  xl: 'max-w-7xl',
  '2xl': 'max-w-7xl',
  full: 'max-w-none',
};

const paddingClasses = {
  none: 'px-0',
  sm: 'px-4 sm:px-6 lg:px-8',
  md: 'px-4 sm:px-6 lg:px-8',
  lg: 'px-4 sm:px-6 lg:px-8',
};

export function PageContent({
  children,
  className,
  padding = 'md',
  maxWidth = 'xl',
  centered = true,
  ...props
}: PageContentProps) {
  return (
    <div
      className={cn(
        'w-full min-h-0 flex-1',
        maxWidthClasses[maxWidth],
        paddingClasses[padding],
        centered && 'mx-auto',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Action Bar - Barre d'actions flottante (sticky bottom sur mobile)
 */
interface ActionBarProps {
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'sticky-top' | 'sticky-bottom';
  className?: string;
  mobileOnly?: boolean;
}

export function ActionBar({
  children,
  position = 'bottom',
  className,
  mobileOnly = false,
}: ActionBarProps) {
  const isMobile = useIsMobile();

  if (mobileOnly && !isMobile) {
    return null;
  }

  const positionClasses = {
    top: 'relative border-b',
    bottom: 'relative border-t',
    'sticky-top': 'sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm',
    'sticky-bottom': 'sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]',
  };

  return (
    <div className={cn('border-border/50', positionClasses[position], className)}>
      <div className={cn(
        'mx-auto w-full max-w-7xl px-4 sm:px-2 lg:px-4',
        isMobile ? 'py-2' : 'py-2'
      )}>
        <div className="flex items-center gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty State - État vide responsive
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      'rounded-2xl border border-dashed border-border/60',
      'bg-muted/20 px-6 py-12 sm:px-8 sm:py-16',
      className
    )}>
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted sm:h-20 sm:w-20">
          <div className="text-muted-foreground">
            {icon}
          </div>
        </div>
      )}
      <h3 className="mb-2 text-lg font-semibold text-primary sm:text-xl">
        {title}
      </h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * Stat Card - Carte de statistique responsive
 */
interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string | number;
    positive: boolean;
  };
  icon?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  icon,
  loading = false,
  className,
}: StatCardProps) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div className={cn(
        'rounded-xl border border-border/60 bg-card p-4 sm:p-5',
        'shadow-sm',
        className
      )}>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-xl border border-border/60 bg-card',
      'p-4 sm:p-5',
      'shadow-sm transition-shadow hover:shadow-md',
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className={cn(
            'text-primary',
            isMobile ? 'text-xs' : 'text-sm'
          )}>
            {title}
          </p>
          <p className={cn(
            'mt-1 font-semibold tracking-tight text-foreground',
            isMobile ? 'text-xl' : 'text-2xl'
          )}>
            {value}
          </p>
          {change && (
            <div className={cn(
              'mt-1 flex items-center gap-1 text-xs font-medium',
              change.positive ? 'text-green-600' : 'text-red-600'
            )}>
              <span>{change.positive ? '+' : ''}{change.value}</span>
              <span className="text-muted-foreground">vs période préc.</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-12 sm:w-12">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stats Grid - Grille de statistiques responsive
 */
interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: 2 | 3 | 4 | 6;
}

export function StatsGrid({
  children,
  className,
  columns = 4,
}: StatsGridProps) {
  const isMobile = useIsMobile();
  
  const gridCols = isMobile 
    ? 'grid-cols-2' 
    : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' 
    : columns === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
    : columns === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

  return (
    <div className={cn('grid gap-3 sm:gap-4', gridCols, className)}>
      {children}
    </div>
  );
}

/**
 * Form Section - Section de formulaire responsive
 */
interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div>
          {title && (
            <h3 className="text-base font-semibold text-primary text-start">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground text-start">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Form Row - Ligne de formulaire avec champs côte à côte sur desktop
 */
interface FormRowProps {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}

export function FormRow({
  children,
  className,
  cols = 2,
}: FormRowProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <div className={cn('space-y-4', className)}>{children}</div>;
  }

  return (
    <div className={cn(
      'grid gap-4',
      cols === 2 && 'sm:grid-cols-2',
      cols === 3 && 'sm:grid-cols-3',
      cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Loading Skeleton - Skeleton loading pour les pages
 */
interface PageSkeletonProps {
  rows?: number;
  className?: string;
  type?: 'list' | 'card' | 'stats' | 'form';
}

export function PageSkeleton({
  rows = 5,
  className,
  type = 'list',
}: PageSkeletonProps) {
  const isMobile = useIsMobile();

  if (type === 'stats') {
    return (
      <div className={cn('grid gap-4', isMobile ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4', className)}>
        {Array.from({ length: isMobile ? 2 : 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
          <div className="space-y-4">
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'form') {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
          <div className="space-y-4">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className={cn('grid gap-4', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
              <div className="h-10 animate-pulse rounded bg-muted" />
              <div className="h-10 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // Default list skeleton
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Detail Item - Élément de détail clé-valeur
 */
interface DetailItemProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function DetailItem({ label, value, className }: DetailItemProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

/**
 * Detail List - Liste de détails responsive
 */
interface DetailListProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
  bordered?: boolean;
}

export function DetailList({
  children,
  columns = 2,
  className,
  bordered = true,
}: DetailListProps) {
  return (
    <dl className={cn(
      'grid gap-x-6 gap-y-4',
      columns === 1 && 'grid-cols-1',
      columns === 2 && 'grid-cols-1 sm:grid-cols-2',
      columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      bordered && 'rounded-xl border border-border/60 bg-card p-4 sm:p-6',
      className
    )}>
      {children}
    </dl>
  );
}
