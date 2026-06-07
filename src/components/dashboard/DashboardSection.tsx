import React from 'react';
import { cn } from '@/lib/utils';

interface DashboardSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconBgColor?: string;
  children: React.ReactNode;
  className?: string;
}

export function DashboardSection({
  title,
  subtitle,
  icon,
  iconBgColor = 'bg-primary/10',
  children,
  className,
}: DashboardSectionProps) {
  return (
    <div className={cn(
      'rounded-2xl bg-gradient-to-br from-white/50 to-white/30 dark:from-card/50 dark:to-card/30 backdrop-blur-sm p-6 max-md:rounded-xl max-md:p-4 border border-border/60 shadow-sm',
      className
    )}>
      {/* Section Header */}
      <div className="mb-8 flex items-center gap-3 max-md:mb-6">
        {icon && (
          <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg', iconBgColor)}>
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        {children}
      </div>
    </div>
  );
}
