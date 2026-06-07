import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import {
  createFichierColumns,
  type FichierRow,
  type FichierColumnsOptions,
} from './columns';

export interface FichiersDataTableProps extends Omit<FichierColumnsOptions, 't'> {
  data: FichierRow[];
  emptyMessage?: string;
}

export function FichiersDataTable({
  data,
  detailLinkBase,
  readOnly,
  onDelete,
  onSoumettre,
  emptyMessage,
}: FichiersDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () =>
      createFichierColumns({
        t,
        detailLinkBase,
        readOnly,
        onDelete,
        onSoumettre,
      }),
    [t, detailLinkBase, readOnly, onDelete, onSoumettre]
  );
  return (
    <DataTable columns={columns} data={data} emptyMessage={emptyMessage ?? t('dashboard.logistique.list.emptyMessage')} />
  );
}
