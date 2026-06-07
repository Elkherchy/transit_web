import * as React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { X, Check, AlertCircle, Info } from 'lucide-react';

/**
 * Toast Notification optimisée pour mobile
 */
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  title: string;
  message?: string;
  onClose?: () => void;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const toastStyles: Record<ToastType, { icon: React.ReactNode; bg: string; border: string }> = {
  success: {
    icon: <Check className="h-5 w-5" />,
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
  },
  error: {
    icon: <AlertCircle className="h-5 w-5" />,
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
  },
  warning: {
    icon: <AlertCircle className="h-5 w-5" />,
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  info: {
    icon: <Info className="h-5-5" />,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
  },
};

const iconColors: Record<ToastType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

export function Toast({
  type,
  title,
  message,
  onClose,
  duration = 5000,
  action,
  className,
}: ToastProps) {
  const isMobile = useIsMobile();
  const [progress, setProgress] = React.useState(100);

  React.useEffect(() => {
    if (duration === Infinity) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        onClose?.();
        clearInterval(timer);
      }
    }, 50);

    return () => clearInterval(timer);
  }, [duration, onClose]);

  const styles = toastStyles[type];

  return (
    <div
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-xl border p-4 shadow-lg',
        'transition-all duration-300 ease-out',
        styles.bg,
        styles.border,
        isMobile ? 'w-full max-w-sm' : 'w-96',
        className
      )}
      role="alert"
    >
      {/* Progress bar */}
      {duration !== Infinity && (
        <div
          className={cn(
            'absolute bottom-0 left-0 h-0.5 transition-all duration-100',
            iconColors[type].replace('text-', 'bg-')
          )}
          style={{ width: `${progress}%` }}
        />
      )}

      <div className="flex items-start gap-3">
        <div className={cn('shrink-0', iconColors[type])}>
          {styles.icon}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {message && (
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className={cn(
                'mt-2 text-sm font-medium underline underline-offset-2',
                iconColors[type]
              )}
            >
              {action.label}
            </button>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Toast Container - Conteneur pour les toasts avec position responsive
 */
interface ToastContainerProps {
  children: React.ReactNode;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  className?: string;
}

export function ToastContainer({
  children,
  position = 'bottom-right',
  className,
}: ToastContainerProps) {
  const isMobile = useIsMobile();

  // Sur mobile, toujours en bas centré
  const finalPosition = isMobile ? 'bottom-center' : position;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col gap-2',
        positionClasses[finalPosition],
        isMobile && 'w-full max-w-sm px-4',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Alert Banner - Bannière d'alerte en haut de page
 */
interface AlertBannerProps {
  type: ToastType;
  title: string;
  message?: string;
  onClose?: () => void;
  className?: string;
}

export function AlertBanner({
  type,
  title,
  message,
  onClose,
  className,
}: AlertBannerProps) {
  const styles = toastStyles[type];

  return (
    <div
      className={cn(
        'relative border-b px-4 py-3',
        styles.bg,
        styles.border,
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0', iconColors[type])}>
          {styles.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {message && (
            <p className="mt-0.5 text-sm text-muted-foreground">{message}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Inline Alert - Alerte intégrée dans le contenu
 */
interface InlineAlertProps {
  type: ToastType;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function InlineAlert({
  type,
  title,
  children,
  className,
}: InlineAlertProps) {
  const styles = toastStyles[type];

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        styles.bg,
        styles.border,
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0', iconColors[type])}>
          {styles.icon}
        </div>
        <div className="min-w-0 flex-1">
          {title && (
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          )}
          <div className={cn('text-sm text-muted-foreground', title && 'mt-1')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmation Dialog optimisé pour mobile
 */
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const isMobile = useIsMobile();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative z-10 rounded-xl bg-card shadow-xl',
          'w-full max-w-md',
          'animate-scale-in',
          isMobile ? 'p-4' : 'p-6'
        )}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>

        <div className={cn(
          'mt-6 flex gap-3',
          isMobile ? 'flex-col-reverse' : 'flex-row justify-end'
        )}>
          <button
            onClick={onClose}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center rounded-lg px-4 py-2',
              'text-sm font-medium text-foreground',
              'border border-input bg-background',
              'hover:bg-accent hover:text-accent-foreground',
              'disabled:opacity-50 disabled:pointer-events-none',
              'touch-target'
            )}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center justify-center rounded-lg px-4 py-2',
              'text-sm font-medium text-primary-foreground',
              'touch-target',
              confirmVariant === 'destructive'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-primary hover:bg-primary/90',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Chargement...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
