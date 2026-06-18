import DebiteursView from '@/components/dashboard/admin/DebiteursView';
import { UserRole } from '@/types';


export default function AdminTransitDebiteurs() {
  return (
    <DebiteursView
      endpoint="/api/transit/clients-debiteurs"
      allowedRoles={[
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.COMPTABLE,
      ]}
      titleKey="dashboard.debiteurs.titleTransit"
      subtitleKey="dashboard.debiteurs.subtitleTransit"
      totalColKey="dashboard.debiteurs.colTotalFacture"
      countColKey="dashboard.debiteurs.colNbFactures"
    />
  );
}
