/**
 * Phase 7 — Migration vers le nouveau workflow Transit (par-désignation + journée caisse).
 *
 * Ce script normalise les données existantes :
 *
 *  1. Pour chaque Transit existant : initialise les champs manquants des
 *     désignations (statutDesignation = LIBRE, payeurId = null, etc.). Ne touche
 *     pas aux désignations déjà migrées (statutDesignation déjà défini).
 *
 *  2. Pour chaque FactureManutention existante sans champs `client`/`objet`
 *     (créées avant le nouveau workflow) : ajoute des valeurs par défaut
 *     ('—') pour ne pas casser le rendu front. Ne crée PAS de transit auto
 *     pour les anciennes factures (elles ont déjà leur transit éventuel via
 *     l'ancien flow `completeManutentionToTransit`).
 *
 *  3. Pour chaque Transit déjà cloturé/validé sans `journeeId` : laisse à null.
 *     Une journée "héritée" peut être créée manuellement si besoin via l'admin.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrateTransitWorkflow.ts
 *
 * Variables d'environnement requises :
 *   MONGODB_URI — URI de connexion MongoDB
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { Transit, FactureManutention } from '@/models';
import { DesignationStatus } from '@/types';

interface RawDesignation {
  _id?: mongoose.Types.ObjectId;
  nom: string;
  montant: number;
  statutDesignation?: string;
  payeurId?: mongoose.Types.ObjectId | null;
  reservedAt?: Date | null;
  paidAt?: Date | null;
  recuUrl?: string | null;
  recuFilename?: string | null;
  valideTransitBy?: mongoose.Types.ObjectId | null;
  valideTransitAt?: Date | null;
  valideAdminBy?: mongoose.Types.ObjectId | null;
  valideAdminAt?: Date | null;
  commentaire?: string | null;
}

interface RawTransit {
  _id: mongoose.Types.ObjectId;
  designations?: RawDesignation[];
  journeeId?: mongoose.Types.ObjectId | null;
  factureManutentionId?: mongoose.Types.ObjectId | null;
  factureClientId?: mongoose.Types.ObjectId | null;
}

async function migrateTransits(): Promise<{ scanned: number; updated: number }> {
  const all = (await Transit.find({}).lean()) as unknown as RawTransit[];
  let updated = 0;

  for (const t of all) {
    const designations = Array.isArray(t.designations) ? t.designations : [];
    const needs = designations.some((d) => !d.statutDesignation);
    if (!needs) continue;

    const normalized = designations.map((d) => ({
      _id: d._id,
      nom: d.nom,
      montant: d.montant,
      statutDesignation: d.statutDesignation || DesignationStatus.LIBRE,
      payeurId: d.payeurId ?? null,
      reservedAt: d.reservedAt ?? null,
      paidAt: d.paidAt ?? null,
      recuUrl: d.recuUrl ?? null,
      recuFilename: d.recuFilename ?? null,
      valideTransitBy: d.valideTransitBy ?? null,
      valideTransitAt: d.valideTransitAt ?? null,
      valideAdminBy: d.valideAdminBy ?? null,
      valideAdminAt: d.valideAdminAt ?? null,
      commentaire: d.commentaire ?? null,
    }));

    await Transit.updateOne(
      { _id: t._id },
      {
        $set: {
          designations: normalized,
          journeeId: t.journeeId ?? null,
          factureManutentionId: t.factureManutentionId ?? null,
          factureClientId: t.factureClientId ?? null,
        },
      }
    );
    updated += 1;
  }

  return { scanned: all.length, updated };
}

interface RawFM {
  _id: mongoose.Types.ObjectId;
  client?: string;
  objet?: string;
  clientId?: mongoose.Types.ObjectId | null;
}

async function migrateFactureManutentions(): Promise<{
  scanned: number;
  updated: number;
}> {
  const all = (await FactureManutention.find({}).lean()) as unknown as RawFM[];
  let updated = 0;
  for (const f of all) {
    if (f.client && f.objet) continue;
    await FactureManutention.updateOne(
      { _id: f._id },
      {
        $set: {
          client: f.client || '—',
          objet: f.objet || '—',
          clientId: f.clientId ?? null,
        },
      }
    );
    updated += 1;
  }
  return { scanned: all.length, updated };
}

async function run() {
  await dbConnect();
  console.log('✓ Connecté à MongoDB');

  console.log('\n→ Migration des dossiers Transit (désignations + champs nouveaux)…');
  const t = await migrateTransits();
  console.log(
    `  Transits scannés : ${t.scanned} · Transits mis à jour : ${t.updated}`
  );

  console.log('\n→ Migration des FactureManutention (champs client/objet)…');
  const f = await migrateFactureManutentions();
  console.log(
    `  Factures scannées : ${f.scanned} · Factures mises à jour : ${f.updated}`
  );

  console.log('\n✓ Migration terminée.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('Migration error:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
