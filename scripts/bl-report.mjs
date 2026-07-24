/**
 * Rapport en lecture seule des opérations (désignations) d'un BL.
 *
 * Usage:
 *   node scripts/bl-report.mjs <numero-bl>
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
  console.error('Usage : node scripts/bl-report.mjs <numero-bl>');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection.db;

const bl = blArg.trim().toUpperCase();
const transits = await db.collection('transits').find({ bl: { $regex: bl, $options: 'i' } }).toArray();

if (transits.length === 0) {
  console.log(`Aucun transit trouvé pour le BL "${bl}".`);
  await mongoose.disconnect();
  process.exit(0);
}

for (const t of transits) {
  console.log('='.repeat(80));
  console.log(`Transit ${t._id}  |  BL: ${t.bl}  |  Client: ${t.client}  |  Objet: ${t.objet}`);
  console.log(`Statut transit: ${t.statut}  |  factureManutentionId: ${t.factureManutentionId || '-'}`);
  console.log('-'.repeat(80));

  const payeurIds = [...new Set((t.designations || []).map((d) => d.payeurId).filter(Boolean).map(String))];
  const users = payeurIds.length
    ? await db.collection('users').find({ _id: { $in: payeurIds.map((id) => new mongoose.Types.ObjectId(id)) } }).toArray()
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), u.nom || u.email || String(u._id)]));

  for (const d of t.designations || []) {
    const payeurNom = d.payeurId ? (userMap.get(String(d.payeurId)) || String(d.payeurId)) : '-';
    const reference = `transit-${t._id}-des-${d._id}`;
    const debitTx = await db.collection('transactions').findOne({ sourcePaiementId: reference, type: 'DEBIT' });
    const revertTx = await db.collection('transactions').findOne({ sourcePaiementId: `revert-${reference}` });

    console.log(`  Désignation: ${d.nom}`);
    console.log(`    _id: ${d._id}`);
    console.log(`    montant: ${d.montant} MRU`);
    console.log(`    statut: ${d.statutDesignation}`);
    console.log(`    payeur: ${payeurNom}`);
    console.log(`    reservedAt: ${d.reservedAt || '-'}  |  paidAt: ${d.paidAt || '-'}`);
    console.log(`    DEBIT payeur existant: ${debitTx ? `oui (${debitTx.montant} MRU, ${debitTx.date})` : 'non'}`);
    console.log(`    Déjà remboursé (revert): ${revertTx ? `oui (${revertTx.montant} MRU, ${revertTx.date})` : 'non'}`);
    console.log('');
  }
}

await mongoose.disconnect();
