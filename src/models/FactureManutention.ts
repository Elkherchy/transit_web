import mongoose, { Schema, model, models } from 'mongoose';
import { IFactureManutention, FactureManutentionStatus } from '@/types';

const LigneEntrepriseSchema = new Schema({
  nomEntreprise: {
    type: String,
    required: true,
    trim: true,
  },
  bl: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: true });

const DocumentSchema = new Schema({
  key: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const FactureManutentionSchema = new Schema<IFactureManutention>(
  {
    bl: {
      type: String,
      required: [true, 'Le BL est requis'],
      trim: true,
      uppercase: true,
    },
    // Client + objet saisis par l'admin lors de la création — propagés au transit auto-créé.
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    client: {
      type: String,
      trim: true,
      default: '',
    },
    objet: {
      type: String,
      trim: true,
      default: '',
    },
    // Champ legacy : conservé pour les anciens dossiers, plus utilisé dans le
    // nouveau workflow (admin saisit directement le `bonLivret`).
    lignesEntreprise: {
      type: [LigneEntrepriseSchema],
      default: [],
    },
    bonLivret: {
      type: Number,
      default: 0,
      min: 0,
    },
    documents: {
      type: [DocumentSchema],
      default: [],
    },
    statut: {
      type: String,
      enum: Object.values(FactureManutentionStatus),
      default: FactureManutentionStatus.BROUILLON,
    },
    payeurId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
    },
    transitId: {
      type: Schema.Types.ObjectId,
      ref: 'Transit',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Si des lignes entreprise sont fournies (ancien workflow), on agrège leur
// total dans `bonLivret`. Sinon, `bonLivret` est conservé tel que saisi par
// l'admin (nouveau workflow).
FactureManutentionSchema.pre('save', function() {
  if (Array.isArray(this.lignesEntreprise) && this.lignesEntreprise.length > 0) {
    this.bonLivret = this.lignesEntreprise.reduce((sum, ligne) => sum + (ligne.montant || 0), 0);
  }
});

// Indexes for faster queries
FactureManutentionSchema.index({ createdBy: 1 });
FactureManutentionSchema.index({ payeurId: 1 });
FactureManutentionSchema.index({ statut: 1 });
// BL unique — interdit deux manutentions avec le même Bill of Lading,
// tous statuts confondus (BROUILLON, EN_ATTENTE_VALIDATION, etc.).
FactureManutentionSchema.index({ bl: 1 }, { unique: true });
FactureManutentionSchema.index({ transitId: 1 });
FactureManutentionSchema.index({ createdAt: -1 });

// Next.js dev recharge les modules mais conserve `mongoose.models` — l'ancien
// schéma reste actif tant que le process n'est pas relancé. On invalide le
// cache si le champ `statut` n'inclut pas tous les statuts (notamment
// EN_ATTENTE_VALIDATION ajouté plus tard).
const existingModel = models.FactureManutention as
  | mongoose.Model<unknown>
  | undefined;
if (existingModel) {
  const statutPath = existingModel.schema.path('statut') as
    | { options?: { enum?: unknown[] } }
    | undefined;
  const enumValues = Array.isArray(statutPath?.options?.enum)
    ? statutPath?.options?.enum
    : [];
  const requiredValues = Object.values(FactureManutentionStatus);
  const hasAll = requiredValues.every((v) => enumValues!.includes(v));
  if (!hasAll) {
    delete models.FactureManutention;
  }
}

const FactureManutention =
  models.FactureManutention ||
  model<IFactureManutention>('FactureManutention', FactureManutentionSchema);

export default FactureManutention;
