/**
 * Phase 7 — Migration script : vérification de l'intégrité des fiches Salarie.
 *
 * Contexte : le module Paie introduit un modèle `Salarie` distinct des utilisateurs
 * (User). Ce script vérifie la cohérence de la collection Salaries.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register src/scripts/migratePayeSalaries.ts
 *
 * Variables d'environnement requises :
 *   MONGODB_URI — URI de connexion MongoDB
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Salarie from '@/models/Salarie';
import BulletinSalaire from '@/models/BulletinSalaire';
import { BulletinStatut } from '@/types';

async function run() {
  await dbConnect();
  console.log('✓ Connecté à MongoDB');

  // ─── 2. Vérification intégrité BulletinSalaire ─────────────────────────────
  // Bulletins orphelins : salarieId ne correspond à aucun Salarie
  const allSalarieIds = (await Salarie.find().select('_id').lean()).map((s) =>
    String(s._id)
  );
  const orphanBulletins = await BulletinSalaire.find({
    salarieId: { $nin: allSalarieIds },
    statut: { $in: [BulletinStatut.BROUILLON, BulletinStatut.VALIDE] },
  }).lean();

  if (orphanBulletins.length > 0) {
    console.warn(
      `\n⚠ ${orphanBulletins.length} bulletin(s) orphelin(s) détecté(s) — salarieId introuvable :`
    );
    for (const b of orphanBulletins) {
      console.warn(`  - id=${String(b._id)}  salarieId=${b.salarieId}  periode=${b.periode}`);
    }
  } else {
    console.log('\n✓ Aucun bulletin orphelin');
  }

  // ─── 3. Résumé ─────────────────────────────────────────────────────────────
  const totalSalaries = await Salarie.countDocuments();
  const totalBulletins = await BulletinSalaire.countDocuments();
  console.log(`\nRésumé final :`);
  console.log(`  Salaries en base   : ${totalSalaries}`);
  console.log(`  Bulletins en base  : ${totalBulletins}`);

  await mongoose.disconnect();
  console.log('\n✓ Migration Phase 7 terminée');
  process.exit(0);
}

run().catch((err) => {
  console.error('Erreur migration Phase 7 :', err);
  process.exit(1);
});
