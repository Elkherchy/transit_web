import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui/data-table';
import type { IChauffeurFacture } from '@/types';
import {
  createFacturesChauffeursColumns,
  type FacturesChauffeursTableActions,
} from './columns-factures-chauffeurs';

export interface FacturesChauffeursDataTableProps extends Omit<FacturesChauffeursTableActions, 't'> {
  data: IChauffeurFacture[];
  busyId: string | null;
  onConfirm: (factureId: string) => void;
  onPay: (facture: IChauffeurFacture) => void;
  onView?: (facture: IChauffeurFacture) => void;
}

export function FacturesChauffeursDataTable({
  data,
  busyId,
  onConfirm,
  onPay,
  onView,
}: FacturesChauffeursDataTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () => createFacturesChauffeursColumns({ t, busyId, onConfirm, onPay, onView }),
    [t, busyId, onConfirm, onPay, onView]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('dashboard.logistique.paiementsChauffeurs.table.empty')}
    />
  );
}