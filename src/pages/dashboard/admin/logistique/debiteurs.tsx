import DebiteursView from '@/components/dashboard/admin/DebiteursView';
import { UserRole } from '@/types';


export default function AdminLogistiqueDebiteurs() {
  return (
    <DebiteursView
      endpoint="/api/logistique/clients-debiteurs"
      allowedRoles={[
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.COMPTABLE,
      ]}
      titleKey="dashboard.debiteurs.titleLogistique"
      subtitleKey="dashboard.debiteurs.subtitleLogistique"
      totalColKey="dashboard.debiteurs.colTotalBons"
      countColKey="dashboard.debiteurs.colNbBons"
    />
  );
}
