import mongoose, { Schema, model, models } from 'mongoose';
import { CaisseKind, CaisseType, CompteType } from '@/types';

/**
 * Statut de validation d'un compte caisse/banque créé manuellement.
 * - VALIDE     : compte utilisable (par défaut pour création directe admin)
 * - EN_ATTENTE : créé par AGENT_TRANSIT, en attente de validation ADMIN_TRANSIT
 */
export enum CaisseStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDE = 'VALIDE',
}

const CaisseSchema = new Schema(
  {
    nom: {
      type: String,
      required: [true, 'Le nom du compte est requis'],
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(CompteType),
      required: [true, 'Le type de compte est requis'],
      default: CompteType.CAISSE,
    },
    kind: {
      type: String,
      enum: Object.values(CaisseKind),
      required: [true, 'Le type de caisse est requis'],
    },
    /**
     * Domaine fonctionnel du compte (Transit ou Logistique). Permet de
     * partitionner les comptes générale/banque par domaine et de filtrer les
     * vues côté admin scopé.
     */
    caisseType: {
      type: String,
      enum: Object.values(CaisseType),
    },
    // Pour les comptes banque
    numeroCompte: {
      type: String,
      trim: true,
    },
    iban: {
      type: String,
      trim: true,
    },
    swift: {
      type: String,
      trim: true,
    },
    // Solde du compte
    solde: {
      type: Number,
      default: 0,
    },
    payeurId: {
      type: String,
      trim: true,
    },
    clientId: {
      type: String,
      trim: true,
    },
    chauffeurId: {
      type: String,
      trim: true,
    },
    vehiculeMatricule: {
      type: String,
      trim: true,
      uppercase: true,
    },
    caissierUserId: {
      type: String,
      trim: true,
    },
    actif: {
      type: Boolean,
      default: true,
    },
    isDefaultGeneral: {
      type: Boolean,
      default: false,
    },
    /**
     * Marque le compte BANQUE par défaut pour le domaine `caisseType` (un seul
     * Banque_Transit et un seul Banque_Logistique par index unique partiel).
     */
    isDefaultBanque: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
    },
    /** Workflow validation : par défaut VALIDE (création admin directe).
     *  EN_ATTENTE quand créé par AGENT_TRANSIT — non utilisable tant que pas
     *  validé par ADMIN_TRANSIT. */
    statut: {
      type: String,
      enum: Object.values(CaisseStatus),
      default: CaisseStatus.VALIDE,
      index: true,
    },
    createdBy: { type: String, trim: true, default: null },
    valideBy: { type: String, trim: true, default: null },
    valideAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CaisseSchema.index(
  { payeurId: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: CaisseKind.USER, actif: true },
  }
);

// Un seul Caisse GENERAL par domaine (un General_Transit + un General_Logistique).
CaisseSchema.index(
  { caisseType: 1, isDefaultGeneral: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefaultGeneral: true },
  }
);

// Un seul Caisse BANQUE par défaut par domaine (Banque_Transit + Banque_Logistique).
CaisseSchema.index(
  { caisseType: 1, isDefaultBanque: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefaultBanque: true },
  }
);

// En développement, Next.js peut réutiliser un ancien modèle compilé sans le
// champ `type` (avant l'ajout de CompteType.GENERAL) ou sans le champ
// `caisseType` (avant la séparation Transit/Logistique). On invalide le cache
// pour reconstruire le schéma à jour.
const existingCaisseModel = models.Caisse as mongoose.Model<unknown> | undefined;
if (existingCaisseModel) {
  const typePath = existingCaisseModel.schema.path('type') as
    | { options?: { enum?: unknown[] } }
    | undefined;
  const enumValues = Array.isArray(typePath?.options?.enum) ? typePath?.options?.enum : [];
  const hasCaisseType = !!existingCaisseModel.schema.path('caisseType');
  const hasStatut = !!existingCaisseModel.schema.path('statut');
  if (
    !typePath ||
    !enumValues.includes(CompteType.GENERAL) ||
    !hasCaisseType ||
    !hasStatut
  ) {
    delete models.Caisse;
  }
}

const Caisse = models.Caisse || model('Caisse', CaisseSchema);

export default Caisse;
