import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import type { IJourneeCaisse } from '@/types';
import {
  createJourneesColumns,
  type JourneesTableActions,
} from './columns';

export interface JourneesDataTableProps extends Omit<JourneesTableActions, 't'> {
  data: IJourneeCaisse[];
  detailLinkBase: string;
  emptyMessage?: string;
}

export function JourneesDataTable({
  data,
  detailLinkBase,
  emptyMessage,
}: JourneesDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () => createJourneesColumns({ t, detailLinkBase }),
    [t, detailLinkBase]
  );
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={emptyMessage ?? t('dashboard.journees.table.empty')}
    />
  );
}