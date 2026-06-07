import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

export interface MetricCardProps {
  /** default : accès rapide (titre + valeur à droite). stat : indicateur chiffré (libellé + grand nombre). */
  variant?: 'default' | 'stat' | 'module';
  title: string;
  value: string | number;
  description?: string;
  rightValue?: string;
  rightLabel?: string;
  borderTopColor?: string;
  href?: string;
  voirPlusLabel?: string;
  className?: string;
  icon?: React.ReactNode;
}

export function MetricCard({
  variant = 'default',
  title,
  value,
  description,
  rightValue,
  rightLabel,
  borderTopColor,
  href,
  voirPlusLabel,
  className,
  icon,
}: MetricCardProps) {
  const color = borderTopColor ?? '#374151';

  if (variant === 'module') {
    return (
      <Link href={href || '#'} className="group h-full">
        <Card
          className={cn(
            'relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card to-card/95 shadow-sm transition-all duration-300 hover:shadow-xl hover:border-border hover:-translate-y-1 dark:from-card dark:to-card/80',
            className
          )}
          style={borderTopColor ? { 
            borderTopWidth: 0,
            background: `linear-gradient(135deg, rgba(${parseInt(borderTopColor.slice(1, 3), 16)}, ${parseInt(borderTopColor.slice(3, 5), 16)}, ${parseInt(borderTopColor.slice(5, 7), 16)}, 0.08) 0%, transparent 100%), linear-gradient(to bottom, var(--card), var(--card))`
          } : undefined}
        >
          {/* Accent bar */}
          <div 
            className="absolute left-0 top-0 h-1 w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ backgroundColor: color }}
          />
          
          <CardContent className="flex h-full flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6">
            {/* Icon and color accent */}
            <div className="flex items-start justify-between">
              <div 
                className="flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 group-hover:scale-110"
                style={{ backgroundColor: `${color}20`, color }}
              >
                {icon}
              </div>
              <ArrowRight 
                className="w-5 h-5 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100" 
                style={{ color }}
              />
            </div>

            {/* Content */}
            <div className="flex flex-col gap-2 flex-1">
              <h3 className="text-sm font-bold text-foreground line-clamp-1">{title}</h3>
              {description ? (
                <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
              ) : null}
            </div>

            {/* Footer with CTA */}
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <span 
                className="text-xs font-semibold transition-colors duration-300"
                style={{ color }}
              >
                {voirPlusLabel || 'Accéder'}
              </span>
              <div 
                className="w-1 h-1 rounded-full transition-transform duration-300 group-hover:scale-150"
                style={{ backgroundColor: color }}
              />
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  if (variant === 'stat') {
    return (
      <Card
        className={cn(
          'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/95 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:border-border dark:from-card dark:to-card/80',
          className
        )}
        style={borderTopColor ? { borderTopWidth: 3, borderTopColor } : undefined}
      >
        <CardContent className="flex h-full min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-4 sm:gap-3 sm:px-5 sm:pb-5 sm:pt-5">
          <p className="shrink-0 text-xs font-bold leading-snug text-foreground sm:text-[13px]">
            <span className="line-clamp-2">{title}</span>
          </p>
          <div
            className="shrink-0 text-3xl font-bold tabular-nums tracking-tighter transition-transform duration-300 hover:scale-105 sm:text-4xl"
            style={{ color }}
          >
            {value}
          </div>
          <div className="mt-auto min-h-[2.25rem] shrink-0">
            {description ? (
              <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/80">
                {description}
              </p>
            ) : null}
          </div>
          {href && voirPlusLabel ? (
            <Link
              href={href}
              className="mt-2 block w-full rounded-lg border py-2 text-center text-xs font-semibold transition-all duration-300 hover:bg-muted/60"
              style={{ borderColor: color, color }}
            >
              {voirPlusLabel}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-card shadow-sm ring-0 transition-all duration-300 hover:shadow-md hover:border-border/60',
        className
      )}
      style={borderTopColor ? { borderTopWidth: 4, borderTopColor } : undefined}
    >
      <CardContent className="flex flex-1 flex-col justify-between gap-3 px-4 pb-4 pt-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-bold text-foreground sm:text-sm">{title}</p>
            {description ? (
              <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-snug text-muted-foreground sm:text-xs">
                {description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-end">
            <div className="text-xl font-bold transition-transform duration-300 hover:scale-105 sm:text-2xl" style={{ color }}>
              {value}
            </div>
            {rightValue != null && rightValue !== '' ? (
              <>
                <div className="mt-0.5 text-sm font-bold text-foreground">{rightValue}</div>
                {rightLabel ? (
                  <p className="text-[10px] text-muted-foreground">{rightLabel}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {href && voirPlusLabel ? (
          <Link
            href={href}
            className="mt-2 block w-full rounded-lg border py-2 text-center text-xs font-medium transition-all duration-300 hover:bg-muted/50"
            style={{ borderColor: color, color }}
          >
            {voirPlusLabel}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
