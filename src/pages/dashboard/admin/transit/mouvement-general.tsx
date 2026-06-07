import MouvementGeneralView from '@/components/dashboard/admin/MouvementGeneralView';
import { UserRole } from '@/types';


export default function AdminTransitMouvementGeneral() {
  return (
    <MouvementGeneralView
      endpoint="/api/admin/transit/mouvement-general"
      allowedRoles={[
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.COMPTABLE,
      ]}
      titleKey="dashboard.mouvement.titleTransit"
      subtitleKey="dashboard.mouvement.subtitleTransit"
    />
  );
}
