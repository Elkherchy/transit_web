import dynamic from 'next/dynamic';

const BLsTransitListPage = dynamic(() => import('./index'), { ssr: false });

/**
 * Liste BL Transit — vue **Non Validés** (statut = EN_ATTENTE_VALIDATION),
 * créés par AGENT_TRANSIT et en attente de validation par ADMIN_TRANSIT.
 */
export default function BLsTransitNonValidesPage() {
  return <BLsTransitListPage fixedAdminValidated="false" />;
}
