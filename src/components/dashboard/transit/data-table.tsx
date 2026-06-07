import React, { useMemo } from 'react';
import { DataTable } from '@/components/ui/data-table';
import {
  createTransitColumns,
  type TransitRow,
  type TransitTableActions,
} from './columns';

export type { TransitRow };

export interface TransitDataTableProps extends TransitTableActions {
  data: TransitRow[];
}

export function TransitDataTable({ data, ...actions }: TransitDataTableProps) {
  const columns = useMemo(
    () => createTransitColumns(actions),
    [
      actions.router,
      actions.isAgentOrAdmin,
      actions.isPayeur,
      actions.deletingId,
      actions.onDelete,
    ]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="Aucun dossier"
    />
  );
}
