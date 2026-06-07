import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardHeroProps {
  title: string;
  subtitle?: string;
  description?: string;
  className?: string;
}

/**
 * DashboardHero - En-tête professionnel pour le dashboard
 */
export function DashboardHero({
  title,
  subtitle,
  description,
  className,
}: DashboardHeroProps) {
  return (
    <div className={cn('mb-12 space-y-3', className)}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground font-medium">{subtitle}</p>
        )}
      </div>
      {description && (
        <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

interface QuickStatsProps {
  stats: Array<{
    label: string;
    value: string | number;
    icon?: React.ReactNode;
  }>;
  className?: string;
}

/**
 * QuickStats - Statistiques rapides en ligne
 */
export function QuickStats({ stats, className }: QuickStatsProps) {
  return (
    <div className={cn('mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {stats.map((stat, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border/50 bg-gradient-to-br from-card/50 to-card/30 p-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground">{stat.value}</p>
            </div>
            {stat.icon && <div className="text-muted-foreground/50">{stat.icon}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ContentSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * ContentSection - Section de contenu principale
 */
export function ContentSection({
  title,
  description,
  children,
  className,
}: ContentSectionProps) {
  return (
    <div className={cn('mb-12', className)}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
