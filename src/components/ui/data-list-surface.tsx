import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Style des tableaux desktop et des cartes liste mobile.
 * - `comfortable` : en-tête teinté, lignes zébrées, cartes avec bandeau titre (recommandé).
 * - `default` : rendu plus plat, proche de l’historique du projet.
 */
export type DataListSurface = 'default' | 'comfortable';

const DataListSurfaceContext = React.createContext<DataListSurface>('comfortable');

export function DataListSurfaceProvider({
  value = 'comfortable',
  children,
}: {
  value?: DataListSurface;
  children: React.ReactNode;
}) {
  return (
    <DataListSurfaceContext.Provider value={value}>{children}</DataListSurfaceContext.Provider>
  );
}

export function useDataListSurface(): DataListSurface {
  return React.useContext(DataListSurfaceContext);
}

/** Enveloppe autour de `<Table>…` pour le mode desktop (sélecteurs descendants). */
export function DataListTableSurface({
  surface: surfaceProp,
  className,
  children,
}: {
  surface?: DataListSurface;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useDataListSurface();
  const surface = surfaceProp ?? ctx;

  if (surface === 'default') {
    return <div className={cn('min-w-0', className)}>{children}</div>;
  }

  return (
    <div
      className={cn(
        'max-w-full overflow-hidden md:rounded-md',
        '[&_thead]:bg-muted/45 [&_thead_tr]:border-b-0',
        '[&_tbody_tr]:border-b [&_tbody_tr]:border-border/35',
        '[&_tbody_tr:nth-child(even)]:bg-muted/[0.18]',
        '[&_tbody_tr:hover]:bg-muted/45',
        className
      )}
    >
      {children}
    </div>
  );
}
