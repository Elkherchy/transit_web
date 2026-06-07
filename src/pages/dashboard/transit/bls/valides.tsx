import dynamic from 'next/dynamic';

const BLsTransitListPage = dynamic(() => import('./index'), { ssr: false });

/**
 * Liste BL Transit — vue **Validés par admin** (statut ≠ EN_ATTENTE_VALIDATION).
 * Réutilise la page principale en lui injectant un filtre verrouillé via la
 * prop `fixedAdminValidated`.
 */
export default function BLsTransitValidesPage() {
  return <BLsTransitListPage fixedAdminValidated="true" />;
}
