import mongoose from 'mongoose';
import { JourneeCaisse, Transit } from '@/models';
import { JourneeCaisseStatus, TransitStatus } from '@/types';

/**
 * Finalise automatiquement une journée si TOUS ses transits sont validés
 * (statut VALIDE). Utilisé lorsque l'admin valide les opérations une par une
 * depuis /dashboard/transit/operations-a-valider : dès que le dernier transit
 * de la journée passe en VALIDE, la journée bascule directement en
 * VALIDEE_ADMIN (les factures client ont déjà été créées transit par transit
 * via finalizeTransitIfAllValidated).
 *
 * Idempotent : sans effet si la journée est déjà VALIDEE_ADMIN ou s'il reste
 * au moins un transit non finalisé.
 */
export async function finalizeJourneeIfAllValidated(
  journeeId: string,
  userId: string
): Promise<{ validated: boolean }> {
  if (!mongoose.isValidObjectId(journeeId)) return { validated: false };

  const journee = await JourneeCaisse.findById(journeeId);
  if (!journee) return { validated: false };
  if (journee.statut === JourneeCaisseStatus.VALIDEE_ADMIN) {
    return { validated: false };
  }

  const transitIds = journee.transitsTraitesIds || [];
  if (transitIds.length === 0) return { validated: false };

  const transits = await Transit.find({ _id: { $in: transitIds } })
    .select('statut')
    .lean();

  if (transits.length === 0) return { validated: false };

  const allValidated = transits.every(
    (t) => t.statut === TransitStatus.VALIDE
  );
  if (!allValidated) return { validated: false };

  const now = new Date();
  // On saute l'étape intermédiaire VALIDEE_TRANSIT : l'admin effectue la
  // validation finale. On renseigne les deux traces si absentes.
  if (!journee.valideTransitBy) {
    journee.valideTransitBy = userId;
    journee.valideTransitAt = now;
  }
  journee.statut = JourneeCaisseStatus.VALIDEE_ADMIN;
  journee.valideAdminBy = userId;
  journee.valideAdminAt = now;
  await journee.save();

  return { validated: true };
}
