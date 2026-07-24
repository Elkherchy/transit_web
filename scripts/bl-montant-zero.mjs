/**
 * Remet à 0 le montant des désignations LIBRE d'un BL qui viennent d'être
 * remboursées (via bl-retour-libre.mjs) — le prochain payeur devra saisir
 * un nouveau montant.
 *
 * Cible uniquement les désignations statutDesignation === 'LIBRE' dont le
 * montant est > 0.
 *
 * Usage:
 *   node scripts/bl-montant-zero.mjs <numero-bl>
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envPath = resolve(__dirname, '../.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // rely on already-set env vars
}

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI non défini.');
  process.exit(1);
}

const [, , blArg] = process.argv;
if (!blArg) {
  console.error('Usage : node scripts/bl-montant-zero.mjs <numero-bl>');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const bl = blArg.trim().toUpperCase();
const transit = await db.collection('transits').findOne({ bl });

if (!transit) {
  console.log(`Aucun transit trouvé pour le BL "${bl}".`);
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Transit ${transit._id} — BL ${transit.bl} — Client ${transit.client}`);
console.log('-'.repeat(80));

for (const d of transit.designations || []) {
  if (d.statutDesignation === 'LIBRE' && Number(d.montant) > 0) {
    await db.collection('transits').updateOne(
      { _id: transit._id, 'designations._id': d._id },
      { $set: { 'designations.$.montant': 0 } }
    );
    console.log(`  [MONTANT=0] ${d.nom} : ${d.montant} MRU → 0,00 MRU`);
  }
}

await mongoose.disconnect();
