import mongoose from 'mongoose';
import { Caisse, Transaction, User } from '@/models';
import { CaisseKind, CaisseType, CompteType, TransactionType, UserRole } from '@/types';

const GENERAL_NOM_PAR_TYPE: Record<CaisseType, string> = {
  [CaisseType.TRANSIT]: 'General_Transit',
};

const BANQUE_NOM_PAR_TYPE: Record<CaisseType, string> = {
  [CaisseType.TRANSIT]: 'Banque_Transit',
};

/**
 * Récupère (et crée si besoin) la caisse GENERAL du domaine demandé.
 *
 * Garantie unique par un index partiel `(caisseType, isDefaultGeneral=true)`.
 */
export async function ensureDefaultGeneralCaisse(
  caisseType: CaisseType = CaisseType.TRANSIT
) {
  const def = await Caisse.findOne({
    caisseType,
    isDefaultGeneral: true,
    actif: true,
  }).lean();
  if (def) {
    if (def.type !== CompteType.GENERAL) {
      await Caisse.updateOne({ _id: def._id }, { $set: { type: CompteType.GENERAL } });
      return { ...def, type: CompteType.GENERAL };
    }
    return def;
  }

  // Migration douce : si une caisse GENERAL existe déjà pour ce domaine sans
  // le flag isDefaultGeneral, on la promeut. Évite les doublons après une
  // intervention manuelle.
  const anyGen = await Caisse.findOne({
    kind: CaisseKind.GENERAL,
    type: CompteType.GENERAL,
    caisseType,
    actif: true,
  });
  if (anyGen) {
    anyGen.isDefaultGeneral = true;
    anyGen.type = CompteType.GENERAL;
    await anyGen.save();
    return anyGen.toObject();
  }

  const created = await Caisse.create({
    nom: GENERAL_NOM_PAR_TYPE[caisseType],
    type: CompteType.GENERAL,
    kind: CaisseKind.GENERAL,
    caisseType,
    actif: true,
    isDefaultGeneral: true,
  });
  return created.toObject();
}

/**
 * Récupère (et crée si besoin) le compte BANQUE par défaut du domaine demandé.
 *
 * Garanti unique via index partiel `(caisseType, isDefaultBanque=true)`.
 */
export async function ensureBanqueCaisse(caisseType: CaisseType) {
  const def = await Caisse.findOne({
    caisseType,
    isDefaultBanque: true,
    actif: true,
  }).lean();
  if (def) return def;

  // Promotion d'une banque existante du domaine si elle n'a pas le flag.
  const anyBanque = await Caisse.findOne({
    type: CompteType.BANQUE,
    caisseType,
    actif: true,
  });
  if (anyBanque) {
    anyBanque.isDefaultBanque = true;
    await anyBanque.save();
    return anyBanque.toObject();
  }

  const created = await Caisse.create({
    nom: BANQUE_NOM_PAR_TYPE[caisseType],
    type: CompteType.BANQUE,
    kind: CaisseKind.GENERAL,
    caisseType,
    actif: true,
    isDefaultBanque: true,
  });
  return created.toObject();
}

export async function getSoldeMapForCaisseIds(
  ids: mongoose.Types.ObjectId[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;

  const rows = await Transaction.aggregate<{ _id: mongoose.Types.ObjectId; solde: number }>([
    { $match: { caisseId: { $in: ids } } },
    {
      $group: {
        _id: '$caisseId',
        solde: {
          $sum: {
            $cond: [
              { $eq: ['$type', TransactionType.CREDIT] },
              '$montant',
              { $multiply: ['$montant', -1] },
            ],
          },
        },
      },
    },
  ]);

  for (const r of rows) {
    map.set(String(r._id), r.solde);
  }
  return map;
}

export function mirrorDescriptionForGeneral(payeurNom: string, description: string) {
  const d = description.trim();
  return `[${payeurNom}] ${d}`;
}

/**
 * Caisse CLIENT liée au client ; la crée si besoin. Une caisse client
 * représente le compte du client dans le système : les factures émises au
 * nom du client sont débitées (créance) ; les paiements clients seraient
 * crédités. Renvoie l'`_id` Mongo de la caisse.
 */
export async function ensureClientCaisse(
  clientId: string,
  clientNom?: string
): Promise<mongoose.Types.ObjectId> {
  const existing = await Caisse.findOne({
    kind: CaisseKind.CLIENT,
    clientId: String(clientId),
    actif: true,
  });
  if (existing) {
    return existing._id as mongoose.Types.ObjectId;
  }

  // Récupère le nom client si pas fourni (pour libeller la caisse).
  let nom = clientNom;
  if (!nom) {
    const c = await mongoose.connection
      .collection('clients')
      .findOne({ _id: new mongoose.Types.ObjectId(clientId) });
    nom = (c?.nom as string) || 'Client';
  }

  const doc = await Caisse.create({
    nom: `Client — ${nom}`,
    type: CompteType.CAISSE,
    kind: CaisseKind.CLIENT,
    caisseType: CaisseType.TRANSIT,
    clientId: String(clientId),
    actif: true,
    isDefaultGeneral: false,
  });
  return doc._id as mongoose.Types.ObjectId;
}

/**
 * Caisse USER liée au payeur ; la crée si besoin (validation paiement).
 */
export async function ensurePayeurUserCaisse(
  payeurId: string
): Promise<mongoose.Types.ObjectId> {
  const existing = await Caisse.findOne({
    kind: CaisseKind.USER,
    payeurId: String(payeurId),
    actif: true,
  });
  if (existing) {
    return existing._id as mongoose.Types.ObjectId;
  }

  const user = await User.findById(payeurId);
  if (!user || user.role !== UserRole.USER_PAYEUR) {
    throw new Error('Utilisateur introuvable ou rôle non éligible');
  }

  const doc = await Caisse.create({
    nom: `Caisse — ${user.nom}`,
    type: CompteType.CAISSE,
    kind: CaisseKind.USER,
    caisseType: CaisseType.TRANSIT,
    payeurId: String(payeurId),
    actif: true,
    isDefaultGeneral: false,
  });
  return doc._id as mongoose.Types.ObjectId;
}

export interface RecordPaiementValidatedCaisseInput {
  paiementId: string;
  payeurId: string;
  montant: number;
  date: Date;
  actorUserId: string;
  factureNumero: string;
  transitId: string;
  bl: string;
  payeurNom: string;
}

/**
 * Débit sur la caisse USER du payeur (paiement = sortie de son compte) +
 * crédit en caisse générale (entrée des fonds).
 * Idempotent si déjà enregistré pour ce paiement.
 */
export async function recordPaiementValidatedToCaisse(
  input: RecordPaiementValidatedCaisseInput
): Promise<void> {
  const dup = await Transaction.findOne({ sourcePaiementId: input.paiementId });
  if (dup) {
    return;
  }

  // Phase 3 : les factures transit sont créditées directement sur le compte
  // bancaire Banque_Transit (et non plus sur la caisse générale).
  const banque = await ensureBanqueCaisse(CaisseType.TRANSIT);

  const payeurCaisseId = await ensurePayeurUserCaisse(input.payeurId);
  const description = `Paiement validé — Facture ${input.factureNumero} — BL ${input.bl}`;
  const reference = input.transitId;

  const primary = await Transaction.create({
    caisseId: payeurCaisseId,
    type: TransactionType.DEBIT,
    montant: input.montant,
    description,
    date: input.date,
    reference,
    userId: input.actorUserId,
    sourcePaiementId: input.paiementId,
  });

  await Transaction.create({
    caisseId: banque._id,
    type: TransactionType.CREDIT,
    montant: input.montant,
    description: mirrorDescriptionForGeneral(input.payeurNom, description),
    date: input.date,
    reference,
    userId: input.actorUserId,
    mirrorSourceId: primary._id,
    sourcePaiementId: input.paiementId,
  });
}

export interface RecordManutentionPaiementValidatedCaisseInput {
  manutentionPaiementId: string;
  montant: number;
  date: Date;
  actorUserId: string;
  actorCaisseId?: string;
  factureCreatedByUserId?: string;
  factureManutentionBl: string;
}

/**
 * Débit sur la caisse du caissier qui a créé la facture manutention
 * + crédit miroir dans la caisse générale.
 * Idempotent avec préfixe `manutention-`.
 */
export async function recordManutentionPaiementValidatedToCaisse(
  input: RecordManutentionPaiementValidatedCaisseInput
): Promise<void> {
  const sourcePaiementId = `manutention-${input.manutentionPaiementId}`;
  const dup = await Transaction.findOne({ sourcePaiementId });
  if (dup) {
    return;
  }

  const ownerUserId = input.factureCreatedByUserId || input.actorUserId;
  let caisseId = input.actorCaisseId;
  if (input.factureCreatedByUserId) {
    caisseId = undefined;
  }

  if (!caisseId) {
    const owner = await User.findById(ownerUserId).select('caisseCompteId').lean();
    caisseId = owner?.caisseCompteId ? String(owner.caisseCompteId) : undefined;
  }

  if (!caisseId) {
    const assignedCaisse = await Caisse.findOne({
      caissierUserId: ownerUserId,
      actif: true,
    })
      .select('_id')
      .lean();
    caisseId = assignedCaisse?._id ? String(assignedCaisse._id) : undefined;
  }

  if (!caisseId) {
    // Manutention = domaine transit (caissier et factures côté transit).
    const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
    caisseId = String(general._id);
  }

  const caisse = await Caisse.findById(caisseId).lean();
  if (!caisse || !caisse.actif) {
    throw new Error('Caisse du caissier introuvable');
  }

  // Phase 3 : crédit miroir sur Banque_Transit (et non plus la caisse générale).
  const banque = await ensureBanqueCaisse(CaisseType.TRANSIT);

  const description = `Paiement manutention validé — BL ${input.factureManutentionBl}`;
  const reference = input.manutentionPaiementId;

  const primary = await Transaction.create({
    caisseId,
    type: TransactionType.DEBIT,
    montant: input.montant,
    description,
    date: input.date,
    reference,
    userId: input.actorUserId,
    sourcePaiementId,
  });

  if (String(banque._id) !== String(caisseId)) {
    await Transaction.create({
      caisseId: banque._id,
      type: TransactionType.CREDIT,
      montant: input.montant,
      description: mirrorDescriptionForGeneral('Manutention', description),
      date: input.date,
      reference,
      userId: input.actorUserId,
      mirrorSourceId: primary._id,
      sourcePaiementId,
    });
  }
}
