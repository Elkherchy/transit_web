import * as React from 'react';
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MobileEntityCard,
  mobileListEmptyBoxClass,
} from '@/components/ui/mobile-entity-card';
import type { DataListSurface } from '@/components/ui/data-list-surface';
import { DataListTableSurface, useDataListSurface } from '@/components/ui/data-list-surface';

export type DataTableColumnMeta = {
  /** Aligne en-tête et cellule (ex. colonne Action / Actions) */
  align?: 'right';
  /** Libellé mobile si `header` n’est pas une chaîne */
  label?: string;
  /** Masquer sur la carte mobile (rare) */
  hideInMobileList?: boolean;
};

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
  /** Wrapper type shadcn : `overflow-hidden rounded-md border` */
  withContainer?: boolean;
  className?: string;
  /** Surcharge locale du style tableau / cartes mobile (@see DataListSurface) */
  surface?: DataListSurface;
}

function isActionsColumn<TData>(column: Column<TData, unknown>): boolean {
  return column.id === 'actions';
}

function columnHeaderLabel<TData>(
  column: Column<TData, unknown>
): string {
  const def = column.columnDef;
  if (typeof def.header === 'string') return def.header;
  const meta = def.meta as DataTableColumnMeta | undefined;
  if (meta?.label) return meta.label;
  const ak = 'accessorKey' in def ? (def as { accessorKey?: unknown }).accessorKey : undefined;
  if (typeof ak === 'string') return ak;
  return column.id;
}

/**
 * Tableau TanStack : vue tableau ≥ md, cartes liste &lt; md (WebView / mobile).
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = 'Aucun résultat.',
  withContainer = true,
  className,
  surface: surfaceProp,
}: DataTableProps<TData, TValue>) {
  const ctxSurface = useDataListSurface();
  const surface = surfaceProp ?? ctxSurface;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const tableInner = (
    <DataListTableSurface surface={surface}>
      <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta as
                | DataTableColumnMeta
                | undefined;
              const alignRight = meta?.align === 'right';
              return (
                <TableHead
                  key={header.id}
                  data-align={alignRight ? 'right' : undefined}
                  className={alignRight ? 'text-right' : undefined}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | DataTableColumnMeta
                  | undefined;
                const alignRight = meta?.align === 'right';
                return (
                  <TableCell
                    key={cell.id}
                    data-align={alignRight ? 'right' : undefined}
                    className={alignRight ? 'text-right' : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="h-24 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </DataListTableSurface>
  );

  const mobileList =
    table.getRowModel().rows.length === 0 ? (
      <div className={mobileListEmptyBoxClass}>{emptyMessage}</div>
    ) : (
      table.getRowModel().rows.map((row) => {
        const cells = row.getVisibleCells();
        const actionCell = cells.find((c) => isActionsColumn(c.column));
        const dataCells = cells.filter((c) => {
          if (isActionsColumn(c.column)) return false;
          const meta = c.column.columnDef.meta as DataTableColumnMeta | undefined;
          return !meta?.hideInMobileList;
        });

        const first = dataCells[0];
        const restFields = first != null ? dataCells.slice(1) : dataCells;
        const fields = restFields.map((cell) => ({
          label: columnHeaderLabel(cell.column),
          value: flexRender(cell.column.columnDef.cell, cell.getContext()),
        }));
        const title =
          first != null
            ? flexRender(first.column.columnDef.cell, first.getContext())
            : fields.length === 0 && actionCell != null
              ? '—'
              : undefined;

        return (
          <MobileEntityCard
            key={row.id}
            surface={surface}
            title={title}
            fields={fields}
            actions={
              actionCell
                ? flexRender(
                    actionCell.column.columnDef.cell,
                    actionCell.getContext()
                  )
                : undefined
            }
          />
        );
      })
    );

  const responsive = (
    <>
      <div className="hidden min-w-0 md:block">{tableInner}</div>
      <div className="md:hidden">
        <div
          className={cn(
            'touch-pan-y pb-1 sm:px-0',
            surface === 'comfortable' ? 'space-y-4' : 'space-y-3 px-1'
          )}
        >
          {mobileList}
        </div>
      </div>
    </>
  );

  if (!withContainer) {
    return className ? (
      <div className={cn('min-w-0', className)}>{responsive}</div>
    ) : (
      responsive
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-none border-0 bg-transparent text-card-foreground md:rounded-md md:border md:bg-card',
        className
      )}
    >
      {responsive}
    </div>
  );
}
