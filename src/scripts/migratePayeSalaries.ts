/**
 * Phase 7 — Migration script : création des fiches Salarie pour les utilisateurs existants.
 *
 * Contexte : le module Paie introduit un modèle `Salarie` distinct des utilisateurs
 * (User). Ce script crée, pour chaque User avec rôle CHAUFFEUR qui n'a pas encore de
 * fiche Salarie liée, une entrée dans la collection Salaries.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register src/scripts/migratePayeSalaries.ts
 *
 * Variables d'environnement requises :
 *   MONGODB_URI — URI de connexion MongoDB
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { User } from '@/models';
import Salarie from '@/models/Salarie';
import BulletinSalaire from '@/models/BulletinSalaire';
import { UserRole, BulletinStatut } from '@/types';

/** Sépare un nom complet en { nom, prenom }. */
function splitNom(fullName: string): { nom: string; prenom: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { prenom: parts[0], nom: parts.slice(1).join(' ') };
  }
  return { nom: fullName.trim(), prenom: '-' };
}

async function run() {
  await dbConnect();
  console.log('✓ Connecté à MongoDB');

  // ─── 1. Chauffeurs → Salaries ──────────────────────────────────────────────
  const chauffeurs = await User.find({ role: UserRole.CHAUFFEUR }).lean();
  console.log(`→ ${chauffeurs.length} chauffeur(s) trouvé(s)`);

  let created = 0;
  let skipped = 0;

  for (const user of chauffeurs) {
    const userId = String(user._id);
    const existing = await Salarie.findOne({ userId });
    if (existing) {
      skipped++;
      continue;
    }

    const { nom, prenom } = splitNom(user.nom);
    await Salarie.create({
      userId,
      nom,
      prenom,
      poste: 'Chauffeur',
      salaireBrut: 0,
      actif: user.actif ?? true,
    });
    created++;
    console.log(`  ✓ Salarie créé pour ${user.nom} (${user.email})`);
  }

  console.log(`\n→ Chauffeurs : ${created} créé(s), ${skipped} déjà existant(s)`);

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
