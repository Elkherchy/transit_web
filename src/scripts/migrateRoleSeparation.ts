/**
 * Migration : séparation des domaines Transit / Logistique.
 *
 * Ce script prépare la base pour la nouvelle architecture admin scopée :
 *
 *   1. La caisse GENERAL existante (`isDefaultGeneral=true`, sans `caisseType`)
 *      est renommée en "General_Transit" et taggée `caisseType=TRANSIT`.
 *   2. Crée la caisse "General_Logistique" si absente
 *      (kind=GENERAL, type=GENERAL, caisseType=LOGISTIQUE, isDefaultGeneral=true).
 *   3. Crée le compte bancaire "Banque_Transit" si absent
 *      (kind=GENERAL, type=BANQUE, caisseType=TRANSIT, isDefaultBanque=true).
 *   4. Crée le compte bancaire "Banque_Logistique" si absent
 *      (kind=GENERAL, type=BANQUE, caisseType=LOGISTIQUE, isDefaultBanque=true).
 *   5. Backfill `caisseType` sur les caisses existantes selon une heuristique :
 *      - kind=USER, kind=CLIENT  → TRANSIT  (payeurs et clients sont transit)
 *      - kind=CHAUFFEUR, kind=VEHICULE → LOGISTIQUE
 *      - GENERAL/BANQUE non-défault sans caisseType : TRANSIT par défaut
 *   6. Les utilisateurs ADMIN existants restent en super-ADMIN (pas de
 *      conversion automatique). Le super-admin peut ensuite créer/promouvoir
 *      des ADMIN_TRANSIT et ADMIN_LOGISTIQUE via /dashboard/utilisateurs.
 *
 * Idempotent : peut être relancé sans dommage. Les caisses déjà nommées et
 * taggées ne sont pas re-créées ; seul le backfill et la promotion par défaut
 * sont remis en cohérence.
 *
 * Usage :
 *   npm run migrate:role-separation
 *   # ou :
 *   npx tsx src/scripts/migrateRoleSeparation.ts
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { Caisse } from '@/models';
import { CaisseKind, CaisseType, CompteType } from '@/types';

interface CaisseSummary {
  _id: mongoose.Types.ObjectId;
  nom: string;
  type: CompteType;
  kind: CaisseKind;
  caisseType?: CaisseType;
  isDefaultGeneral?: boolean;
  isDefaultBanque?: boolean;
}

async function ensureSingletonCaisse(opts: {
  nom: string;
  type: CompteType;
  kind: CaisseKind;
  caisseType: CaisseType;
  isDefaultGeneral?: boolean;
  isDefaultBanque?: boolean;
}): Promise<CaisseSummary> {
  const filter: Record<string, unknown> = {
    caisseType: opts.caisseType,
    actif: true,
  };
  if (opts.isDefaultGeneral) filter.isDefaultGeneral = true;
  if (opts.isDefaultBanque) filter.isDefaultBanque = true;

  const existing = (await Caisse.findOne(filter).lean()) as CaisseSummary | null;
  if (existing) return existing;

  const created = await Caisse.create({
    nom: opts.nom,
    type: opts.type,
    kind: opts.kind,
    caisseType: opts.caisseType,
    isDefaultGeneral: !!opts.isDefaultGeneral,
    isDefaultBanque: !!opts.isDefaultBanque,
    actif: true,
  });
  return {
    _id: created._id as mongoose.Types.ObjectId,
    nom: created.get('nom') as string,
    type: created.get('type') as CompteType,
    kind: created.get('kind') as CaisseKind,
    caisseType: created.get('caisseType') as CaisseType | undefined,
    isDefaultGeneral: created.get('isDefaultGeneral') as boolean | undefined,
    isDefaultBanque: created.get('isDefaultBanque') as boolean | undefined,
  };
}

async function dropLegacyIndexes() {
  // Les anciens index (avant la séparation par caisseType) sont uniques
  // globalement sur isDefaultGeneral=true et bloquent la création d'un
  // 2e GENERAL par domaine. On les drop ici ; les nouveaux index compound
  // seront créés automatiquement à la première écriture par Mongoose.
  const collection = Caisse.collection;
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    if (idx.name === 'isDefaultGeneral_1') {
      console.log(`  Drop index legacy : ${idx.name}`);
      await collection.dropIndex(idx.name);
    }
  }
}

async function main() {
  console.log('--- Migration : séparation Transit / Logistique ---');
  await dbConnect();
  console.log('Connecté à MongoDB.');

  console.log('0) Drop des index legacy non-scopés…');
  await dropLegacyIndexes();

  // 1. Renommer + tagger l'ancienne GENERAL caisse en General_Transit.
  const legacyGeneral = await Caisse.findOne({
    kind: CaisseKind.GENERAL,
    isDefaultGeneral: true,
    caisseType: { $exists: false },
    actif: true,
  });
  if (legacyGeneral) {
    legacyGeneral.set('caisseType', CaisseType.TRANSIT);
    legacyGeneral.set('type', CompteType.GENERAL);
    if ((legacyGeneral.get('nom') as string) !== 'General_Transit') {
      legacyGeneral.set('nom', 'General_Transit');
    }
    await legacyGeneral.save();
    console.log('1) Renommé caisse GENERAL existante → General_Transit');
  } else {
    console.log('1) Pas de caisse GENERAL legacy trouvée (ok si déjà migrée)');
  }

  // 2. General_Logistique
  const genLog = await ensureSingletonCaisse({
    nom: 'General_Logistique',
    type: CompteType.GENERAL,
    kind: CaisseKind.GENERAL,
    caisseType: CaisseType.LOGISTIQUE,
    isDefaultGeneral: true,
  });
  console.log(`2) General_Logistique : ${String(genLog._id)}`);

  // 3. Banque_Transit
  const banqueTransit = await ensureSingletonCaisse({
    nom: 'Banque_Transit',
    type: CompteType.BANQUE,
    kind: CaisseKind.GENERAL,
    caisseType: CaisseType.TRANSIT,
    isDefaultBanque: true,
  });
  console.log(`3) Banque_Transit : ${String(banqueTransit._id)}`);

  // 4. Banque_Logistique
  const banqueLog = await ensureSingletonCaisse({
    nom: 'Banque_Logistique',
    type: CompteType.BANQUE,
    kind: CaisseKind.GENERAL,
    caisseType: CaisseType.LOGISTIQUE,
    isDefaultBanque: true,
  });
  console.log(`4) Banque_Logistique : ${String(banqueLog._id)}`);

  // 5. Backfill caisseType sur les caisses existantes sans tag.
  const transitKinds = [CaisseKind.USER, CaisseKind.CLIENT];
  const logKinds = [CaisseKind.CHAUFFEUR, CaisseKind.VEHICULE];

  const r1 = await Caisse.updateMany(
    { kind: { $in: transitKinds }, caisseType: { $exists: false } },
    { $set: { caisseType: CaisseType.TRANSIT } }
  );
  console.log(`5a) Caisses payeur/client → TRANSIT : ${r1.modifiedCount} mises à jour`);

  const r2 = await Caisse.updateMany(
    { kind: { $in: logKinds }, caisseType: { $exists: false } },
    { $set: { caisseType: CaisseType.LOGISTIQUE } }
  );
  console.log(`5b) Caisses chauffeur/véhicule → LOGISTIQUE : ${r2.modifiedCount} mises à jour`);

  const r3 = await Caisse.updateMany(
    {
      kind: CaisseKind.GENERAL,
      caisseType: { $exists: false },
      isDefaultGeneral: { $ne: true },
      isDefaultBanque: { $ne: true },
    },
    { $set: { caisseType: CaisseType.TRANSIT } }
  );
  console.log(`5c) Autres caisses GENERAL non-default → TRANSIT : ${r3.modifiedCount} mises à jour`);

  console.log('--- Migration terminée. ---');
  console.log('  • Vous pouvez maintenant créer des ADMIN_TRANSIT et');
  console.log('    ADMIN_LOGISTIQUE via /dashboard/utilisateurs.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration échouée :', err);
  process.exit(1);
});
