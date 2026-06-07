import AdminScopedCaisseDetail from '@/components/dashboard/admin/AdminScopedCaisseDetail';
import { CaisseType, UserRole } from '@/types';


export default function AdminCaisseLogistiqueDetail() {
  return (
    <AdminScopedCaisseDetail
      caisseType={CaisseType.LOGISTIQUE}
      allowedRoles={[UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]}
      backHref="/dashboard/admin/logistique/caisse"
    />
  );
}
