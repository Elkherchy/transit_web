import MouvementGeneralView from '@/components/dashboard/admin/MouvementGeneralView';
import { UserRole } from '@/types';


export default function AdminLogistiqueMouvementGeneral() {
  return (
    <MouvementGeneralView
      endpoint="/api/admin/logistique/mouvement-general"
      allowedRoles={[
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.COMPTABLE,
      ]}
      titleKey="dashboard.mouvement.titleLogistique"
      subtitleKey="dashboard.mouvement.subtitleLogistique"
    />
  );
}
