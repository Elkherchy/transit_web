import { JourneeCaisse, Caisse } from '@/models';
import { JourneeCaisseStatus, IJourneeCaisse } from '@/types';
import { ensureDefaultGeneralCaisse, getSoldeMapForCaisseIds } from '@/lib/caisse';
import mongoose from 'mongoose';

/**
 * Normalise une date à 00:00 UTC du jour pour servir de clé d'unicité par caissier.
 */
export function startOfDayUTC(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function snapshotSoldeGeneral(): Promise<number> {
  const general = await ensureDefaultGeneralCaisse();
  if (!general) return 0;
  const soldes = await getSoldeMapForCaisseIds([
    general._id as mongoose.Types.ObjectId,
  ]);
  const fromTx = soldes.get(String(general._id));
  if (typeof fromTx === 'number') return fromTx;
  // fallback : champ persisté
  const fresh = await Caisse.findById(general._id).select('solde').lean();
  return fresh?.solde ?? 0;
}

/**
 * Récupère ou crée la journée du caissier pour aujourd'hui.
 *
 * Chaque jour a sa propre journée — donc ses propres alimentations payeurs,
 * son propre solde général de début, ses propres dépôts admin. Une journée
 * OUVERTE laissée par le caissier la veille n'est PAS réutilisée.
 *
 * Stratégie (compatible index unique `(caissierId, date)`) :
 *   1. Une journée existe-t-elle déjà pour aujourd'hui ? → retournée.
 *      Les endpoints d'opération doivent vérifier `statut === OUVERTE`
 *      avant d'écrire.
 *   2. Sinon, on crée une nouvelle journée OUVERTE pour aujourd'hui (snapshot
 *      du solde général au moment de l'ouverture).
 */
export async function getOrCreateOpenJournee(
  caissierId: string
): Promise<IJourneeCaisse> {
  const today = startOfDayUTC();

  // 1) Journée existante pour aujourd'hui (ouverte ou clôturée) ?
  const todayDoc = await JourneeCaisse.findOne({
    caissierId,
    date: today,
  });
  if (todayDoc) return todayDoc.toObject() as IJourneeCaisse;

  // 2) Création — snapshot du solde général à l'ouverture de cette journée.
  const soldeDebut = await snapshotSoldeGeneral();
  const created = await JourneeCaisse.create({
    caissierId,
    date: today,
    statut: JourneeCaisseStatus.OUVERTE,
    soldeGeneralDebut: soldeDebut,
    alimentationsAdmin: [],
    alimentationsPayeurs: [],
    transitsTraitesIds: [],
  });
  return created.toObject() as IJourneeCaisse;
}

/**
 * Récupère la journée OUVERTE d'un caissier sans en créer.
 */
export async function findOpenJourneeForCaissier(
  caissierId: string
): Promise<IJourneeCaisse | null> {
  const j = await JourneeCaisse.findOne({
    caissierId,
    statut: JourneeCaisseStatus.OUVERTE,
  }).sort({ date: -1 });
  return j ? (j.toObject() as IJourneeCaisse) : null;
}

/**
 * Ajoute (idempotemment) un transitId à la liste `transitsTraitesIds` de la journée.
 */
export async function trackTransitInJournee(
  journeeId: string,
  transitId: string
): Promise<void> {
  await JourneeCaisse.findByIdAndUpdate(journeeId, {
    $addToSet: { transitsTraitesIds: transitId },
  });
}
