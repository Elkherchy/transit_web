import AdminScopedCaisseView from '@/components/dashboard/admin/AdminScopedCaisseView';
import { CaisseType, UserRole } from '@/types';


export default function AdminCaisseTransit() {
  return (
    <AdminScopedCaisseView
      caisseType={CaisseType.TRANSIT}
      allowedRoles={[UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT]}
    />
  );
}
