/**
 * Réconcilie les désignations déjà payées d'un transit avec la caisse payeur
 * (réutilise src/lib/reconcileDesignationPaiement.ts — même logique que
 * l'admin qui corrige un montant de désignation depuis l'UI).
 *
 * Usage:
 *   npx tsx scripts/reconcile-transit.mts <transitId> <userId>
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const [, , transitId, userId] = process.argv;
if (!transitId || !userId) {
  console.error('Usage : npx tsx scripts/reconcile-transit.mts <transitId> <userId>');
  process.exit(1);
}

const connectDB = (await import('../src/lib/db')).default;
const { reconcileTransitPaidDesignations } = await import(
  '../src/lib/reconcileDesignationPaiement'
);

await connectDB();
const applied = await reconcileTransitPaidDesignations(transitId, userId);
console.log(JSON.stringify(applied, null, 2));
console.log(`${applied.length} ajustement(s) appliqué(s).`);
process.exit(0);
