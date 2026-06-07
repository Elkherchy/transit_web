import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import { createManutentionColumns, type ManutentionRow } from './columns';

export interface ManutentionDataTableProps {
  data: ManutentionRow[];
  detailLinkBase?: string;
  onValider?: (row: ManutentionRow) => void;
}

export function ManutentionDataTable({
  data,
  detailLinkBase,
  onValider,
}: ManutentionDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () => createManutentionColumns({ t, detailLinkBase, onValider }),
    [t, detailLinkBase, onValider]
  );
  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('dashboard.admin.manutention.table.empty')}
    />
  );
}
