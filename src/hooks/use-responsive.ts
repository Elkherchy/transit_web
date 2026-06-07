import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Hook pour détecter la hauteur de l'écran (petit écran)
 */
export function useIsShortScreen(breakpoint: number = 700) {
  const [isShort, setIsShort] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const checkHeight = () => {
      setIsShort(window.innerHeight < breakpoint);
    };
    
    checkHeight();
    window.addEventListener('resize', checkHeight);
    return () => window.removeEventListener('resize', checkHeight);
  }, [breakpoint]);

  return !!isShort;
}

/**
 * Hook pour détecter l'orientation
 */
export function useOrientation() {
  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>('portrait');

  React.useEffect(() => {
    const updateOrientation = () => {
      if (window.matchMedia('(orientation: landscape)').matches) {
        setOrientation('landscape');
      } else {
        setOrientation('portrait');
      }
    };

    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    return () => window.removeEventListener('resize', updateOrientation);
  }, []);

  return orientation;
}

/**
 * Hook pour détecter si l'appareil est tactile
 */
export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState<boolean>(false);

  React.useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        'ontouchstart' in window || 
        navigator.maxTouchPoints > 0
      );
    };
    
    checkTouch();
  }, []);

  return isTouch;
}

/**
 * Hook pour le safe area sur mobile (notch, home indicator)
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = React.useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  React.useEffect(() => {
    const updateSafeArea = () => {
      const styles = getComputedStyle(document.documentElement);
      setSafeArea({
        top: parseInt(styles.getPropertyValue('--sat') || '0', 10),
        bottom: parseInt(styles.getPropertyValue('--sab') || '0', 10),
        left: parseInt(styles.getPropertyValue('--sal') || '0', 10),
        right: parseInt(styles.getPropertyValue('--sar') || '0', 10),
      });
    };

    updateSafeArea();
    window.addEventListener('resize', updateSafeArea);
    return () => window.removeEventListener('resize', updateSafeArea);
  }, []);

  return safeArea;
}

/**
 * Hook pour détecter la connexion réseau
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = React.useState(true);
  const [effectiveType, setEffectiveType] = React.useState<string>('4g');

  React.useEffect(() => {
    const updateNetworkStatus = () => {
      setIsOnline(navigator.onLine);
      
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn) {
          setEffectiveType(conn.effectiveType || '4g');
        }
      }
    };

    updateNetworkStatus();
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    
    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener('change', updateNetworkStatus);
    }

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      
      if ('connection' in navigator) {
        (navigator as any).connection?.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return { isOnline, effectiveType };
}

/**
 * Hook pour le viewport height mobile (corrige le problème avec la barre d'adresse)
 */
export function useViewportHeight() {
  const [vh, setVh] = React.useState(0);

  React.useEffect(() => {
    const updateVh = () => {
      setVh(window.innerHeight * 0.01);
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };

    updateVh();
    window.addEventListener('resize', updateVh);
    return () => window.removeEventListener('resize', updateVh);
  }, []);

  return vh;
}

/**
 * Hook pour détecter le scroll
 */
export function useScrollPosition() {
  const [scrollPosition, setScrollPosition] = React.useState(0);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const updatePosition = () => {
      const position = window.scrollY;
      setScrollPosition(position);
      setIsScrolled(position > 10);
    };

    window.addEventListener('scroll', updatePosition, { passive: true });
    updatePosition();

    return () => window.removeEventListener('scroll', updatePosition);
  }, []);

  return { scrollPosition, isScrolled };
}

/**
 * Hook pour les animations réduites
 */
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook pour détecter le mode sombre
 */
export function useDarkMode() {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mediaQuery.matches || document.documentElement.classList.contains('dark'));

    const handler = () => setIsDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handler);
    
    // Observer les changements de classe dark
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQuery.removeEventListener('change', handler);
      observer.disconnect();
    };
  }, []);

  return isDark;
}

/**
 * Hook pour le debounce
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook pour le throttle
 */
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
  const lastRan = React.useRef<number>(Date.now());

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * Hook pour détecter si un élément est visible (Intersection Observer)
 */
export function useInView(
  ref: React.RefObject<Element | null>,
  options?: IntersectionObserverInit
): boolean {
  const [isInView, setIsInView] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}

/**
 * Hook pour le focus trap (accessibilité modale)
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  isActive: boolean
) {
  React.useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, isActive]);
}

/**
 * Hook pour le swipe gesture
 */
interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
}

export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  options: SwipeOptions
) {
  const { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold = 50 } = options;
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;

    const handleTouchStart = (e: TouchEvent) => {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };

      const diffX = touchStart.current.x - touchEnd.x;
      const diffY = touchStart.current.y - touchEnd.y;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (Math.abs(diffX) > threshold) {
          if (diffX > 0 && onSwipeLeft) {
            onSwipeLeft();
          } else if (diffX < 0 && onSwipeRight) {
            onSwipeRight();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(diffY) > threshold) {
          if (diffY > 0 && onSwipeUp) {
            onSwipeUp();
          } else if (diffY < 0 && onSwipeDown) {
            onSwipeDown();
          }
        }
      }

      touchStart.current = null;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);
}

/**
 * Hook pour le bottom sheet mobile
 */
export function useBottomSheet() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [snapPoint, setSnapPoint] = React.useState<number | string>('50%');

  const open = React.useCallback((initialSnap?: number | string) => {
    setSnapPoint(initialSnap || '50%');
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    document.body.style.overflow = '';
  }, []);

  const snapTo = React.useCallback((point: number | string) => {
    setSnapPoint(point);
  }, []);

  React.useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return { isOpen, open, close, snapTo, snapPoint };
}

/**
 * Hook pour les toasts sur mobile
 */
export function useToastPosition() {
  const isMobile = useIsMobile();
  return isMobile ? 'bottom-center' : 'top-right';
}
