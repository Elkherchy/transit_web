import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import type { IUserResponse } from '@/types';
import {
  createUtilisateursColumns,
  type UtilisateursTableActions,
} from './columns';

export interface UtilisateursDataTableProps extends Omit<UtilisateursTableActions, 't'> {
  data: IUserResponse[];
  currentUserId: string | undefined;
  onEdit: (u: IUserResponse) => void;
  onDeleteRequest: (u: IUserResponse) => void;
}

export function UtilisateursDataTable({
  data,
  currentUserId,
  onEdit,
  onDeleteRequest,
}: UtilisateursDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () =>
      createUtilisateursColumns({ t, currentUserId, onEdit, onDeleteRequest }),
    [t, currentUserId, onEdit, onDeleteRequest]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('dashboard.utilisateurs.table.empty')}
    />
  );
}