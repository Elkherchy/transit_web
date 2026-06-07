import AdminScopedCaisseDetail from '@/components/dashboard/admin/AdminScopedCaisseDetail';
import { CaisseType, UserRole } from '@/types';


export default function AdminCaisseTransitDetail() {
  return (
    <AdminScopedCaisseDetail
      caisseType={CaisseType.TRANSIT}
      allowedRoles={[
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ]}
      backHref="/dashboard/admin/transit/caisse"
    />
  );
}
