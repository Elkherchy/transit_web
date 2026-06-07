import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Container responsive avec largeurs maximales optimisées
 * pour différents breakpoints
 */
interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Taille du container */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Padding responsive */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Centrer le contenu */
  center?: boolean;
}

const sizeClasses = {
  sm: 'max-w-[640px]',
  md: 'max-w-[768px]',
  lg: 'max-w-[1024px]',
  xl: 'max-w-[1280px]',
  '2xl': 'max-w-[1400px]',
  full: 'max-w-none',
};

const paddingClasses = {
  none: 'px-0',
  sm: 'px-3 sm:px-4 lg:px-6',
  md: 'px-4 sm:px-6 lg:px-8',
  lg: 'px-4 sm:px-8 lg:px-12 xl:px-16',
};

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = 'xl', padding = 'md', center = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'w-full',
          sizeClasses[size],
          paddingClasses[padding],
          center && 'mx-auto',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Container.displayName = 'Container';

/**
 * Grid responsive avec différentes configurations
 */
interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Nombre de colonnes sur mobile */
  cols?: 1 | 2 | 3 | 4 | 6;
  /** Nombre de colonnes sur sm */
  sm?: 1 | 2 | 3 | 4 | 6;
  /** Nombre de colonnes sur md */
  md?: 1 | 2 | 3 | 4 | 6;
  /** Nombre de colonnes sur lg */
  lg?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Nombre de colonnes sur xl */
  xl?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Espacement entre les éléments */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const gapClasses: Record<string, string> = {
  none: 'gap-0',
  xs: 'gap-2',
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export const ResponsiveGrid = React.forwardRef<HTMLDivElement, ResponsiveGridProps>(
  ({ 
    className, 
    cols = 1, 
    sm, 
    md, 
    lg, 
    xl, 
    gap = 'md', 
    children, 
    ...props 
  }, ref) => {
    const gridClasses = [
      `grid-cols-${cols}`,
      sm && `sm:grid-cols-${sm}`,
      md && `md:grid-cols-${md}`,
      lg && `lg:grid-cols-${lg}`,
      xl && `xl:grid-cols-${xl}`,
    ].filter(Boolean);

    return (
      <div
        ref={ref}
        className={cn(
          'grid',
          gapClasses[gap],
          ...gridClasses,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ResponsiveGrid.displayName = 'ResponsiveGrid';

/**
 * Stack vertical avec espacement responsive
 */
interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Espacement entre les éléments */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Alignement horizontal */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Distribution */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
}

const alignClasses: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyClasses: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ 
    className, 
    gap = 'md', 
    align = 'stretch',
    justify = 'start',
    children, 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col',
          gapClasses[gap],
          alignClasses[align],
          justifyClasses[justify],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Stack.displayName = 'Stack';

/**
 * Row - Layout horizontal responsive
 */
interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Espacement entre les éléments */
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Alignement vertical */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  /** Distribution horizontale */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /** Wrap sur mobile */
  wrap?: boolean | 'reverse';
  /** Direction sur mobile */
  direction?: 'row' | 'col';
  /** Direction sur sm+ */
  smDirection?: 'row' | 'col';
}

export const Row = React.forwardRef<HTMLDivElement, RowProps>(
  ({ 
    className, 
    gap = 'md', 
    align = 'center',
    justify = 'start',
    wrap = true,
    direction = 'row',
    smDirection,
    children, 
    ...props 
  }, ref) => {
    const wrapClass = wrap === true ? 'flex-wrap' : wrap === 'reverse' ? 'flex-wrap-reverse' : 'flex-nowrap';
    
    return (
      <div
        ref={ref}
        className={cn(
          'flex',
          direction === 'col' ? 'flex-col' : 'flex-row',
          smDirection && (smDirection === 'col' ? 'sm:flex-col' : 'sm:flex-row'),
          gapClasses[gap],
          alignClasses[align],
          justifyClasses[justify],
          wrapClass,
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Row.displayName = 'Row';

/**
 * Section avec padding responsive et max-width
 */
interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Padding vertical */
  py?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Background color */
  bg?: 'default' | 'muted' | 'primary' | 'transparent';
  /** Full width sans container */
  fullWidth?: boolean;
}

const pyClasses = {
  none: 'py-0',
  sm: 'py-4 sm:py-6',
  md: 'py-6 sm:py-8 lg:py-12',
  lg: 'py-8 sm:py-12 lg:py-16',
  xl: 'py-12 sm:py-16 lg:py-20',
  '2xl': 'py-16 sm:py-20 lg:py-24',
};

const bgClasses = {
  default: 'bg-background',
  muted: 'bg-muted/30',
  primary: 'bg-primary/5',
  transparent: 'bg-transparent',
};

export const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ 
    className, 
    py = 'md', 
    bg = 'default',
    fullWidth = false,
    children, 
    ...props 
  }, ref) => {
    return (
      <section
        ref={ref}
        className={cn(
          pyClasses[py],
          bgClasses[bg],
          !fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {children}
      </section>
    );
  }
);
Section.displayName = 'Section';

/**
 * Hide/Show components based on breakpoints
 */
interface ShowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Afficher à partir de ce breakpoint */
  above?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Cacher à partir de ce breakpoint */
  below?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Afficher uniquement sur mobile */
  mobile?: boolean;
  /** Afficher uniquement sur desktop */
  desktop?: boolean;
}

export const Show = React.forwardRef<HTMLDivElement, ShowProps>(
  ({ 
    className, 
    above,
    below,
    mobile,
    desktop,
    children, 
    ...props 
  }, ref) => {
    const getVisibilityClasses = () => {
      if (mobile) return 'block sm:hidden';
      if (desktop) return 'hidden sm:block';
      
      const classes: string[] = [];
      
      if (above) {
        classes.push(`hidden ${above}:block`);
      }
      
      if (below) {
        const belowMap: Record<string, string> = {
          sm: 'block sm:hidden',
          md: 'block md:hidden',
          lg: 'block lg:hidden',
          xl: 'block xl:hidden',
          '2xl': 'block 2xl:hidden',
        };
        classes.push(belowMap[below]);
      }
      
      return classes.join(' ');
    };

    return (
      <div
        ref={ref}
        className={cn(
          getVisibilityClasses(),
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Show.displayName = 'Show';

/**
 * Aspect Ratio Container
 */
interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: '1:1' | '4:3' | '16:9' | '21:9' | '3:4' | '9:16';
  children: React.ReactNode;
}

const ratioClasses = {
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-video',
  '21:9': 'aspect-[21/9]',
  '3:4': 'aspect-[3/4]',
  '9:16': 'aspect-[9/16]',
};

export const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ className, ratio = '16:9', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden',
          ratioClasses[ratio],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AspectRatio.displayName = 'AspectRatio';
