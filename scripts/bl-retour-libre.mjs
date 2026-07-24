/**
 * Remet à LIBRE toutes les désignations d'un BL qui ont un DEBIT payeur non
 * remboursé, et recrédite le montant sur la caisse du payeur concerné.
 *
 * Pour chaque désignation :
 *   - Cherche la transaction DEBIT `sourcePaiementId = transit-<id>-des-<id>`
 *   - Si elle existe et n'a pas déjà été remboursée (pas de
 *     `revert-transit-<id>-des-<id>`), crée une transaction CREDIT du même
 *     montant sur la même caisse et incrémente son solde.
 *   - Force statutDesignation = LIBRE (payeurId, reservedAt, paidAt, reçus
 *     effacés) si ce n'est pas déjà le cas.
 * Recalcule ensuite le statut de la FactureManutention liée.
 *
 * Usage:
 *   node scripts/bl-retour-libre.mjs <numero-bl>
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
  console.error('Usage : node scripts/bl-retour-libre.mjs <numero-bl>');
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

let totalRembourse = 0;

for (const d of transit.designations || []) {
  const reference = `transit-${transit._id}-des-${d._id}`;
  const revertRef = `revert-${reference}`;

  const debitTx = await db.collection('transactions').findOne({
    sourcePaiementId: reference,
    type: 'DEBIT',
  });
  const alreadyReverted = await db.collection('transactions').findOne({
    sourcePaiementId: revertRef,
  });

  let refunded = false;
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
    totalRembourse += montant;
    refunded = true;
    console.log(`  [REMBOURSE] ${d.nom} : ${montant} MRU → caisse ${debitTx.caisseId}`);
  }

  if (d.statutDesignation !== 'LIBRE') {
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
          'designations.$.commentaire': 'Remis à LIBRE — montant retourné au payeur (script admin)',
        },
      }
    );
    console.log(`  [LIBRE] ${d.nom} : ${d.statutDesignation} → LIBRE`);
  } else if (refunded) {
    console.log(`  [LIBRE] ${d.nom} : déjà LIBRE (remboursement seul)`);
  }
}

console.log('-'.repeat(80));
console.log(`Total remboursé : ${totalRembourse.toFixed(2)} MRU`);

// Recalcule le statut de la FactureManutention liée (même règle que
// syncFactureManutentionStatusFromTransit).
if (transit.factureManutentionId) {
  const fresh = await db.collection('transits').findOne({ _id: transit._id });
  const designations = fresh.designations || [];
  let paid = 0;
  let validatedAdmin = 0;
  let openOrReserved = 0;
  let bonLivretTotal = 0;
  for (const d of designations) {
    const s = d.statutDesignation;
    if (s === 'VALIDEE_ADMIN') {
      validatedAdmin += 1;
      paid += 1;
    } else if (s === 'PAYEE' || s === 'VALIDEE_TRANSIT') {
      paid += 1;
    } else if (s === 'LIBRE' || s === 'RESERVEE' || s === 'REJETEE' || !s) {
      openOrReserved += 1;
    }
    if ((d.nom || '').trim().toLowerCase() === 'bon de livret') {
      bonLivretTotal += Number(d.montant) || 0;
    }
  }
  let next;
  if (validatedAdmin === designations.length) {
    next = 'CLOTURE';
  } else if (paid > 0 && openOrReserved === 0) {
    next = 'PAYE_EN_ATTENTE_VALIDATION';
  } else if (paid > 0) {
    next = 'PAIEMENT_PARTIEL';
  } else {
    next = 'EN_ATTENTE_PAIEMENT';
  }
  const currentFm = await db.collection('facturemanutentions').findOne({ _id: transit.factureManutentionId });
  if (currentFm && currentFm.statut === 'EN_ATTENTE_VALIDATION') {
    console.log('FactureManutention en EN_ATTENTE_VALIDATION — statut non modifié.');
  } else {
    await db.collection('facturemanutentions').updateOne(
      { _id: transit.factureManutentionId },
      { $set: { statut: next, bonLivret: bonLivretTotal } }
    );
    console.log(`FactureManutention ${transit.factureManutentionId} → statut ${next}`);
  }
}

await mongoose.disconnect();
