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
     * Banque_Transit par index unique partiel).
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

CaisseSchema.index(
  { caisseType: 1, isDefaultGeneral: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefaultGeneral: true },
  }
);

CaisseSchema.index(
  { caisseType: 1, isDefaultBanque: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefaultBanque: true },
  }
);

// En développement, Next.js peut réutiliser un ancien modèle compilé — on invalide
// le cache si le schéma a changé.
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
