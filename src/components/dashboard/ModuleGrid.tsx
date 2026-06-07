import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface ModuleNavItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  color: string;
  badge?: string;
  badgeColor?: 'default' | 'success' | 'warning' | 'danger';
}

interface ModuleGridProps {
  items: ModuleNavItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * Nouveau composant: ModuleGrid
 * Design professionnel et épuré pour les modules
 */
export function ModuleGrid({ items, columns = 3, className }: ModuleGridProps) {
  const gridColsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  }[columns];

  return (
    <div className={cn('grid grid-cols-1 gap-6', gridColsClass, className)}>
      {items.map((item) => (
        <ModuleCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * ModuleCard - Carte de module minimaliste
 */
function ModuleCard({ item }: { item: ModuleNavItem }) {
  const Icon = item.icon;
  const badgeStyles = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
  };

  return (
    <Link href={item.href} className="group">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border-2 transition-all duration-300',
          'bg-white/50 backdrop-blur-sm',
          'hover:shadow-xl hover:border-opacity-100 hover:-translate-y-1',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
        )}
        style={{
          borderColor: `${item.color}40`,
        }}
      >
        {/* Top accent bar */}
        <div
          className="absolute left-0 top-0 h-1 w-full transition-all duration-300 group-hover:h-1.5"
          style={{ backgroundColor: item.color }}
        />

        {/* Content */}
        <div className="flex flex-col gap-4 p-6">
          {/* Icon and badge */}
          <div className="flex items-start justify-between">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
              style={{ backgroundColor: `${item.color}15` }}
            >
              <Icon className="h-7 w-7" style={{ color: item.color }} />
            </div>
            {item.badge && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  badgeStyles[item.badgeColor || 'default']
                )}
              >
                {item.badge}
              </span>
            )}
          </div>

          {/* Title and description */}
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-foreground text-base transition-colors duration-300 group-hover:text-opacity-75">
              {item.title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {item.description}
            </p>
          </div>

          {/* Footer action */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <span
              className="text-xs font-semibold transition-colors duration-300"
              style={{ color: item.color }}
            >
              Accéder
            </span>
            <div
              className="h-1.5 w-1.5 rounded-full transition-all duration-300 group-hover:h-2 group-hover:w-2"
              style={{ backgroundColor: item.color }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
