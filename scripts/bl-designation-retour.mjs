/**
 * Rembourse le DEBIT payeur non remboursé d'UNE SEULE désignation (par nom)
 * d'un BL, force son statut à LIBRE et remet son montant à 0.
 * Les autres désignations du transit ne sont pas touchées.
 *
 * Usage:
 *   node scripts/bl-designation-retour.mjs <numero-bl> <nom-designation>
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

const [, , blArg, nomArg] = process.argv;
if (!blArg || !nomArg) {
  console.error('Usage : node scripts/bl-designation-retour.mjs <numero-bl> <nom-designation>');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const bl = blArg.trim().toUpperCase();
const nomTarget = nomArg.trim().toLowerCase();
const transit = await db.collection('transits').findOne({ bl });

if (!transit) {
  console.log(`Aucun transit trouvé pour le BL "${bl}".`);
  await mongoose.disconnect();
  process.exit(0);
}

const d = (transit.designations || []).find(
  (x) => (x.nom || '').trim().toLowerCase() === nomTarget
);

if (!d) {
  console.log(`Aucune désignation "${nomArg}" trouvée sur le BL "${bl}".`);
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Transit ${transit._id} — BL ${transit.bl} — Client ${transit.client}`);
console.log(`Désignation ciblée : ${d.nom} (${d._id})`);

const reference = `transit-${transit._id}-des-${d._id}`;
const revertRef = `revert-${reference}`;

const debitTx = await db.collection('transactions').findOne({
  sourcePaiementId: reference,
  type: 'DEBIT',
});
const alreadyReverted = await db.collection('transactions').findOne({
  sourcePaiementId: revertRef,
});

if (debitTx && !alreadyReverted && Number(debitTx.montant) > 0) {
  const montant = Number(debitTx.montant);
  const date = new Date();
  await db.collection('transactions').insertOne({
    caisseId: debitTx.caisseId,
    type: 'CREDIT',
    montant,
    description: `Retour paiement désignation "${d.nom}" — Transit ${transit._id} (BL ${transit.bl})`,
    date,
    reference,
    userId: debitTx.userId,
    sourcePaiementId: revertRef,
    createdAt: date,
    updatedAt: date,
  });
  await db.collection('caisses').updateOne(
    { _id: debitTx.caisseId },
    { $inc: { solde: montant } }
  );
  console.log(`  [REMBOURSE] ${montant} MRU → caisse ${debitTx.caisseId}`);
} else if (alreadyReverted) {
  console.log('  [DEJA REMBOURSE] rien à faire côté caisse.');
} else {
  console.log('  [PAS DE DEBIT] rien à rembourser.');
}

await db.collection('transits').updateOne(
  { _id: transit._id, 'designations._id': d._id },
  {
    $set: {
      'designations.$.statutDesignation': 'LIBRE',
      'designations.$.payeurId': null,
      'designations.$.reservedAt': null,
      'designations.$.paidAt': null,
      'designations.$.recuUrl': null,
      'designations.$.recuFilename': null,
      'designations.$.recus': [],
      'designations.$.montant': 0,
      'designations.$.commentaire': 'Remis à LIBRE, montant 0 — remboursé au payeur (script admin)',
    },
  }
);
console.log('  [LIBRE + MONTANT=0]');

await mongoose.disconnect();
