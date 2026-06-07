import mongoose, { Schema, model, models } from 'mongoose';

/**
 * Lot de validation d'opérations soumises par le caissier à l'AGENT_TRANSIT.
 *
 * Permet au caissier d'envoyer une ou plusieurs opérations de sa journée
 * (paiements payeur, paiements client, factures client, alimentations,
 * dépenses) à l'agent transit pour validation, SANS attendre la clôture
 * de fin de journée.
 *
 * Workflow :
 *   1. Caissier coche des opérations dans /caissier/cloturer-journee.
 *   2. Caissier clique « Envoyer à l'agent » → 1 OperationValidation créé
 *      par opération, statut EN_ATTENTE_AGENT.
 *   3. Agent transit voit la liste dans /transit/operations-a-valider,
 *      valide ou rejette chaque opération.
 *   4. Statut final : VALIDEE_AGENT ou REJETEE.
 */
export enum OperationType {
  CLIENT_FACTURE = 'CLIENT_FACTURE',
  CLIENT_PAIEMENT = 'CLIENT_PAIEMENT',
  PAYEUR_PAIEMENT = 'PAYEUR_PAIEMENT',
  ALIMENTATION = 'ALIMENTATION',
  DEPENSE = 'DEPENSE',
}

export enum OperationValidationStatus {
  /** Soumise par le caissier — attend validation AGENT_TRANSIT. */
  EN_ATTENTE_AGENT = 'EN_ATTENTE_AGENT',
  /** Validée par AGENT_TRANSIT — attend validation finale ADMIN_TRANSIT. */
  EN_ATTENTE_ADMIN = 'EN_ATTENTE_ADMIN',
  /** Validée par AGENT_TRANSIT (legacy / fallback final agent). */
  VALIDEE_AGENT = 'VALIDEE_AGENT',
  /** Validation finale par ADMIN_TRANSIT. */
  VALIDEE_ADMIN = 'VALIDEE_ADMIN',
  REJETEE = 'REJETEE',
}

export interface IOperationValidation {
  _id: string;
  opType: OperationType;
  /** Identifiant interne de l'opération (factureId, paiementId, etc.). */
  opId: string;
  /** Snapshot lisible (libellé, montant, contrepartie) pour affichage. */
  snapshot: {
    libelle?: string;
    montant?: number;
    contrepartie?: string;
    date?: Date;
  };
  statut: OperationValidationStatus;
  journeeId?: string;
  submittedBy: string;
  submittedAt: Date;
  validatedBy?: string;
  validatedAt?: Date;
  rejectMotif?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema(
  {
    libelle: { type: String, default: null },
    montant: { type: Number, default: null },
    contrepartie: { type: String, default: null },
    date: { type: Date, default: null },
  },
  { _id: false }
);

const OperationValidationSchema = new Schema<IOperationValidation>(
  {
    opType: {
      type: String,
      enum: Object.values(OperationType),
      required: true,
      index: true,
    },
    opId: { type: String, required: true, index: true },
    snapshot: { type: SnapshotSchema, default: () => ({}) },
    statut: {
      type: String,
      enum: Object.values(OperationValidationStatus),
      default: OperationValidationStatus.EN_ATTENTE_AGENT,
      index: true,
    },
    journeeId: { type: String, default: null, index: true },
    submittedBy: { type: String, required: true, index: true },
    submittedAt: { type: Date, default: Date.now },
    validatedBy: { type: String, default: null },
    validatedAt: { type: Date, default: null },
    rejectMotif: { type: String, default: null },
  },
  { timestamps: true }
);

// Unicité : une même opération ne peut pas être soumise deux fois en attente.
OperationValidationSchema.index(
  { opType: 1, opId: 1, statut: 1 },
  {
    unique: true,
    partialFilterExpression: {
      statut: OperationValidationStatus.EN_ATTENTE_AGENT,
    },
  }
);

// Invalide le cache Mongoose si le schéma stocké n'inclut pas tous les
// statuts (cas dev : nouveaux statuts EN_ATTENTE_ADMIN / VALIDEE_ADMIN).
const existingModel = models.OperationValidation as
  | mongoose.Model<unknown>
  | undefined;
if (existingModel) {
  const statutPath = existingModel.schema.path('statut') as
    | { options?: { enum?: unknown[] } }
    | undefined;
  const enumValues = Array.isArray(statutPath?.options?.enum)
    ? statutPath?.options?.enum
    : [];
  const requiredValues = Object.values(OperationValidationStatus);
  const hasAll = requiredValues.every((v) => enumValues!.includes(v));
  if (!hasAll) {
    delete models.OperationValidation;
  }
}

const OperationValidation =
  models.OperationValidation ||
  model<IOperationValidation>('OperationValidation', OperationValidationSchema);

export default OperationValidation;
