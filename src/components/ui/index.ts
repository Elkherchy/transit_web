/**
 * SNTS Design System - Barrel Export
 * 
 * Ce fichier exporte tous les composants UI du design system
 * pour faciliter les imports dans le projet.
 * 
 * @example
 * import { Container, PageHeader, StatCard } from '@/components/ui';
 */

// Layout Components
export {
  Container,
  ResponsiveGrid,
  Stack,
  Row,
  Section,
  Show,
  AspectRatio,
} from './responsive-layout';

// Page Components
export {
  PageHeader,
  PageContent,
  ActionBar,
  EmptyState,
  StatCard,
  StatsGrid,
  FormSection,
  FormRow,
  PageSkeleton,
  DetailItem,
  DetailList,
} from './page-components';

// Mobile Components
export {
  MobileEntityCard,
  ResponsiveTableArea,
  mobileListEmptyBoxClass,
  type MobileEntityField,
  type MobileEntityCardProps,
  type ResponsiveTableAreaProps,
} from './mobile-entity-card';

// Data Display Components
export {
  MobilePagination,
  SearchInput,
  FilterBadge,
  FilterBar,
  StatusBadge,
  SortButton,
  ListHeader,
  PullToRefreshIndicator,
  BottomActionSheet,
} from './data-display';

export { Calendar, CalendarDayButton } from './calendar';
export { DatePicker, type DatePickerProps } from './date-picker';

// Feedback Components
export {
  Toast,
  ToastContainer,
  AlertBanner,
  InlineAlert,
  ConfirmDialog,
} from './feedback';

// Re-export from data-list-surface if exists
export {
  DataListSurfaceProvider,
  DataListTableSurface,
  useDataListSurface,
  type DataListSurface,
} from './data-list-surface';

// Invoice Template
export {
  InvoiceTemplate,
  InvoiceSimple,
  InvoicePrintStyles,
} from './invoice-template';
