import * as React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

/**
 * Pagination optimisée pour mobile
 */
interface MobilePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  className?: string;
}

export function MobilePagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  className,
}: MobilePaginationProps) {
  const isMobile = useIsMobile();

  // Génère les pages à afficher
  const getVisiblePages = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage, '...', totalPages);
      }
    }
    
    return pages;
  };

  if (isMobile) {
    return (
      <div className={cn(
        'flex items-center justify-between gap-4',
        'rounded-xl border border-border/60 bg-card p-3',
        className
      )}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-10 px-3"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-1">Préc</span>
        </Button>
        
        <div className="flex flex-col items-center">
          <span className="text-sm font-medium">
            {currentPage} / {totalPages}
          </span>
          {totalItems !== undefined && itemsPerPage && (
            <span className="text-[10px] text-muted-foreground">
              {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}-{Math.min(currentPage * itemsPerPage, totalItems)} sur {totalItems}
            </span>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-10 px-3"
        >
          <span className="mr-1">Suiv</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Version desktop avec plus de pages visibles
  return (
    <div className={cn(
      'flex items-center justify-between gap-4',
      'rounded-xl border border-border/60 bg-card p-3',
      className
    )}>
      <div className="text-sm text-muted-foreground">
        {totalItems !== undefined && itemsPerPage && (
          <span>
            Affichage de {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} à {Math.min(currentPage * itemsPerPage, totalItems)} sur {totalItems} éléments
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {getVisiblePages().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(page as number)}
              className="min-w-[40px]"
            >
              {page}
            </Button>
          )
        ))}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Search Input optimisé pour mobile avec icône
 */
interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
  loading?: boolean;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onSearch, loading, ...props }, ref) => {
    return (
      <div className={cn('relative', className)}>
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={ref}
          type="search"
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
            'pl-10 text-sm ring-offset-background',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'md:h-11 md:text-base',
            className
          )}
          {...props}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>
    );
  }
);
SearchInput.displayName = 'SearchInput';

/**
 * Filter Badge - Badge de filtre cliquable pour mobile
 */
interface FilterBadgeProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  className?: string;
}

export function FilterBadge({
  label,
  active = false,
  onClick,
  count,
  className,
}: FilterBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
        'transition-colors duration-200',
        'touch-target',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
        className
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn(
          'rounded-full px-1.5 py-0.5 text-xs',
          active ? 'bg-primary-foreground/20' : 'bg-background'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Filter Bar - Barre de filtres horizontale scrollable sur mobile
 */
interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 overflow-x-auto pb-2',
      'scrollbar-hide',
      '-mx-4 px-4 sm:mx-0 sm:px-0',
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Status Badge - Badge de statut avec couleurs prédéfinies
 */
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'success' | 'error' | 'warning' | 'info' | string;
  children: React.ReactNode;
  className?: string;
}

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  warning: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      statusStyles[status] || statusStyles.info,
      className
    )}>
      {children}
    </span>
  );
}

/**
 * Sort Button - Bouton de tri avec indication visuelle
 */
interface SortButtonProps {
  label: string;
  active?: boolean;
  direction?: 'asc' | 'desc';
  onClick?: () => void;
  className?: string;
}

export function SortButton({
  label,
  active = false,
  direction = 'asc',
  onClick,
  className,
}: SortButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium',
        'transition-colors duration-200',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted',
        className
      )}
    >
      {label}
      {active && (
        <svg
          className={cn(
            'h-3 w-3 transition-transform',
            direction === 'desc' && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )}
    </button>
  );
}

/**
 * List Header - En-tête de liste avec actions
 */
interface ListHeaderProps {
  title: string;
  count?: number;
  actions?: React.ReactNode;
  className?: string;
}

export function ListHeader({
  title,
  count,
  actions,
  className,
}: ListHeaderProps) {
  const isMobile = useIsMobile();

  return (
    <div className={cn(
      'flex items-center justify-between gap-4',
      'border-b border-border/50 pb-3',
      className
    )}>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-foreground">
          {title}
        </h3>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      
      {actions && (
        <div className={cn(
          'flex items-center gap-2',
          isMobile && 'flex-col'
        )}>
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Pull to Refresh Indicator
 */
interface PullToRefreshProps {
  pulling: boolean;
  refreshing: boolean;
  pullProgress: number;
  className?: string;
}

export function PullToRefreshIndicator({
  pulling,
  refreshing,
  pullProgress,
  className,
}: PullToRefreshProps) {
  if (!pulling && !refreshing) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-center py-4',
        'transition-all duration-200',
        className
      )}
      style={{
        height: `${Math.min(pullProgress * 60, 60)}px`,
        opacity: Math.min(pullProgress * 2, 1),
      }}
    >
      {refreshing ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Actualisation...
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Relâcher pour actualiser
        </div>
      )}
    </div>
  );
}

/**
 * Bottom Action Sheet - Sheet d'actions flottant en bas (mobile style)
 */
interface BottomActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomActionSheet({
  isOpen,
  onClose,
  title,
  children,
  className,
}: BottomActionSheetProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'rounded-t-2xl bg-card shadow-2xl',
          'max-h-[80vh] overflow-auto pb-safe',
          'animate-slide-up',
          className
        )}
      >
        {/* Handle */}
        <div className="sticky top-0 z-10 flex justify-center bg-card pt-3">
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>
        
        {/* Header */}
        {title && (
          <div className="sticky top-0 z-10 border-b border-border/50 bg-card px-4 py-3">
            <h3 className="text-center font-semibold">{title}</h3>
          </div>
        )}
        
        {/* Content */}
        <div className="p-4">
          {children}
        </div>
      </div>
    </>
  );
}
