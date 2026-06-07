import AdminScopedCaisseView from '@/components/dashboard/admin/AdminScopedCaisseView';
import { CaisseType, UserRole } from '@/types';


export default function AdminCaisseLogistique() {
  return (
    <AdminScopedCaisseView
      caisseType={CaisseType.LOGISTIQUE}
      allowedRoles={[UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]}
    />
  );
}
