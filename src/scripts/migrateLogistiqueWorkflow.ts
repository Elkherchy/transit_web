/**
 * Migration vers le nouveau workflow Logistique (par-fichier + chauffeur).
 *
 * Ce script supprime les champs legacy des voyages existants pour aligner la
 * base sur le nouveau schéma :
 *   - importBatchKey (ancien identifiant de lot d'import)
 *   - statutClassement (ancien statut A_CLASSER / CLASSE)
 *   - importedAt
 *   - clientClasse (ancien tag ANAZAHA / ELGHOTOB)
 *   - chauffeur (String, remplacé par chauffeurId qui référence un User)
 *
 * Et initialise les voyages migrés (sans fichierLogistiqueId) avec le nouveau
 * statutVoyage par défaut (CREE) si manquant.
 *
 * Idempotent : on peut le relancer plusieurs fois sans dommage.
 *
 * Usage :
 *   npm run migrate:logistique
 *   # ou directement :
 *   npx tsx src/scripts/migrateLogistiqueWorkflow.ts
 *
 * Variables d'environnement :
 *   MONGODB_URI — URI de connexion MongoDB
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { Voyage } from '@/models';
import { VoyageStatus } from '@/types';

const LEGACY_FIELDS = [
  'importBatchKey',
  'statutClassement',
  'importedAt',
  'clientClasse',
  'chauffeur',
] as const;

async function main() {
  console.log('--- Migration logistique : nettoyage champs legacy ---');
  await dbConnect();

  const total = await Voyage.estimatedDocumentCount();
  console.log(`Total voyages en base : ${total}`);

  // 1. Supprime les champs legacy en bloc.
  const unsetSpec: Record<string, ''> = {};
  for (const f of LEGACY_FIELDS) unsetSpec[f] = '';
  const r1 = await Voyage.collection.updateMany({}, { $unset: unsetSpec });
  console.log(
    `Champs legacy supprimés (matched=${r1.matchedCount}, modified=${r1.modifiedCount})`
  );

  // 2. Pose statutVoyage = CREE pour les voyages qui n'en ont pas encore.
  const r2 = await Voyage.collection.updateMany(
    { statutVoyage: { $exists: false } },
    { $set: { statutVoyage: VoyageStatus.CREE } }
  );
  console.log(
    `statutVoyage par défaut posé (matched=${r2.matchedCount}, modified=${r2.modifiedCount})`
  );

  // 3. Drop des indexes obsolètes (si présents).
  try {
    const indexes = await Voyage.collection.indexes();
    const obsolete = indexes
      .map((i) => i.name as string)
      .filter((name) =>
        name.includes('importBatchKey') ||
        name.includes('clientClasse') ||
        name.includes('statutClassement')
      );
    for (const name of obsolete) {
      try {
        await Voyage.collection.dropIndex(name);
        console.log(`Index supprimé : ${name}`);
      } catch (e) {
        console.warn(`Drop index ${name} : ${e instanceof Error ? e.message : e}`);
      }
    }
  } catch (e) {
    console.warn('Inspection des indexes impossible :', e);
  }

  console.log('--- Migration terminée ---');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
