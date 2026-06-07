import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import type { ICaisseListItem } from '@/types';
import { createCaissesColumns, type CaissesTableActions } from './columns';

export interface CaissesDataTableProps extends Omit<CaissesTableActions, 't'> {
  data: ICaisseListItem[];
  openQuick: (row: ICaisseListItem, mode: 'solde' | 'mouvement') => void;
  onRename: (row: ICaisseListItem) => void;
  onDeactivate: (row: ICaisseListItem) => void;
}

export function CaissesDataTable({ data, openQuick, onRename, onDeactivate }: CaissesDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () => createCaissesColumns({ t, openQuick, onRename, onDeactivate }),
    [t, openQuick, onRename, onDeactivate]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('dashboard.caisses.table.empty')}
    />
  );
}