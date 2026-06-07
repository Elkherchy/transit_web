import * as React from 'react';
import { cn } from '@/lib/utils';
import type { DataListSurface } from '@/components/ui/data-list-surface';
import { DataListTableSurface, useDataListSurface } from '@/components/ui/data-list-surface';

/**
 * Message « liste vide » sous md : pas de bordure (seules les {@link MobileEntityCard} en ont).
 * À partir de md, bordure en pointillés pour cohérence avec le bureau.
 */
export const mobileListEmptyBoxClass =
  'rounded-2xl border-0 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground md:border md:border-dashed md:border-border/80';

export type MobileEntityField = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

export interface MobileEntityCardProps {
  /** Titre principal (ex. numéro, nom) */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  fields: MobileEntityField[];
  /** Menu actions (DropdownMenu recommandé) */
  actions?: React.ReactNode;
  className?: string;
  /** Surcharge du thème liste (sinon contexte layout, défaut : comfortable) */
  surface?: DataListSurface;
}

/**
 * Carte liste pour petits écrans / WebView : lisible, zones tactiles confortables.
 */
export function MobileEntityCard({
  title,
  subtitle,
  fields,
  actions,
  className,
  surface: surfaceProp,
}: MobileEntityCardProps) {
  const ctxSurface = useDataListSurface();
  const surface = surfaceProp ?? ctxSurface;
  const isComfort = surface === 'comfortable';

  return (
    <article
      className={cn(
        'touch-manipulation bg-card',
        isComfort
          ? 'overflow-hidden rounded-xl border border-border/70 shadow-md'
          : [
              'rounded-2xl border border-border/80 p-4 shadow-sm',
              'ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
              'transition-[transform,box-shadow] active:scale-[0.99] active:shadow-md',
            ],
        className
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3',
          isComfort ? 'p-0' : null
        )}
      >
        <div className={cn('min-w-0 flex-1', !isComfort && 'space-y-3')}>
          {(title != null || subtitle != null) && (
            <div
              className={cn(
                isComfort
                  ? 'border-b border-border/50 bg-muted/35 px-4 py-3'
                  : 'space-y-0.5 border-b border-border/60 pb-2'
              )}
            >
              {title != null && (
                <div
                  className={cn(
                    'leading-tight tracking-tight text-foreground',
                    isComfort
                      ? 'text-base font-bold sm:text-[17px]'
                      : 'text-base font-semibold'
                  )}
                >
                  {title}
                </div>
              )}
              {subtitle != null && (
                <div
                  className={cn(
                    'text-muted-foreground',
                    isComfort ? 'mt-1 text-xs sm:text-sm' : 'text-xs'
                  )}
                >
                  {subtitle}
                </div>
              )}
            </div>
          )}
          <dl
            className={cn(
              'divide-y',
              isComfort
                ? cn(
                    'divide-border/40 px-4 pb-4',
                    title != null || subtitle != null
                      ? 'pt-2 [&>div:first-child]:pt-0'
                      : 'pt-4'
                  )
                : 'divide-border/50'
            )}
          >
            {fields.map((f, i) => (
              <div
                key={i}
                className={cn(
                  'flex min-w-0 flex-row items-start gap-x-2 gap-y-1 py-2.5 first:pt-0 last:pb-0',
                  isComfort && 'py-3 first:pt-2',
                  f.className
                )}
              >
                <dt className="w-[min(42%,11rem)] shrink-0 pt-0.5 text-sm font-bold leading-snug text-muted-foreground">
                  {f.label}
                  <span className="text-muted-foreground/70" aria-hidden>
                    {' '}
                    :{' '}
                  </span>
                </dt>
                <dd className="min-w-0 flex-1 text-sm leading-snug text-foreground [&_*]:whitespace-normal">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {actions != null ? (
          <div
            className={cn(
              'shrink-0 [-webkit-tap-highlight-color:transparent]',
              isComfort ? 'px-2 pt-3 sm:pr-3' : 'pt-0.5'
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export interface ResponsiveTableAreaProps {
  /** Tableau desktop (md+) */
  table: React.ReactNode;
  /** Liste de cartes mobile */
  mobileList: React.ReactNode;
  className?: string;
  /** Surcharge du thème (sinon contexte layout) */
  surface?: DataListSurface;
}

/** Masque le tableau &lt; md, affiche la liste de cartes en dessous de md. */
export function ResponsiveTableArea({
  table,
  mobileList,
  className,
  surface: surfaceProp,
}: ResponsiveTableAreaProps) {
  const ctxSurface = useDataListSurface();
  const surface = surfaceProp ?? ctxSurface;
  const isComfort = surface === 'comfortable';

  return (
    <div className={cn('min-w-0', className)}>
      <div className="hidden min-w-0 md:block">
        <DataListTableSurface surface={surface}>{table}</DataListTableSurface>
      </div>
      <div className="md:hidden">
        <div
          className={cn(
            'touch-pan-y pb-1 sm:px-0',
            isComfort ? 'space-y-4' : 'space-y-3 px-1'
          )}
        >
          {mobileList}
        </div>
      </div>
    </div>
  );
}
