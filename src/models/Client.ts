import mongoose, { Schema, model, models } from 'mongoose';

/**
 * Statut de validation d'un client.
 * - VALIDE     : client utilisable partout (par défaut pour les admins qui créent directement).
 * - EN_ATTENTE : créé par AGENT_TRANSIT, en attente de validation ADMIN_TRANSIT.
 *                Non visible côté factures/transit jusqu'à validation.
 */
export enum ClientStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDE = 'VALIDE',
}

export interface IClientDoc {
  _id: mongoose.Types.ObjectId;
  nom: string;
  telephone?: string;
  email?: string;
  /** Caisse liée (kind=CLIENT) — créée automatiquement à la création du client. */
  caisseId?: string;
  actif: boolean;
  /** Workflow validation : par défaut VALIDE (admin direct) ; EN_ATTENTE pour AGENT_TRANSIT. */
  statut: ClientStatus;
  createdBy?: string;
  valideBy?: string;
  valideAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClientDoc>(
  {
    nom: {
      type: String,
      required: [true, 'Le nom du client est requis'],
      trim: true,
    },
    telephone: {
      type: String,
      trim: true,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    caisseId: {
      type: String,
      default: null,
    },
    actif: {
      type: Boolean,
      default: true,
    },
    statut: {
      type: String,
      enum: Object.values(ClientStatus),
      default: ClientStatus.VALIDE,
      index: true,
    },
    createdBy: { type: String, default: null },
    valideBy: { type: String, default: null },
    valideAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ClientSchema.index({ nom: 1 });
ClientSchema.index({ email: 1 });

const Client = models.Client || model<IClientDoc>('Client', ClientSchema);

export default Client;
