import { Schema, model, models } from 'mongoose';

/**
 * Bénéficiaire / fournisseur de dépense (« Client Dépense »).
 *
 * - Maintenu côté Transit : l'AGENT_TRANSIT propose un nouveau bénéficiaire,
 *   l'ADMIN_TRANSIT valide (ou rejette = suppression).
 * - À la validation, une caisse interne `kind=CLIENT` lui est associée pour
 *   suivre les montants payés / dûs.
 * - Le caissier sélectionne le bénéficiaire et son compte lié au moment de
 *   l'enregistrement d'une dépense.
 */
export enum ClientDepenseStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDE = 'VALIDE',
}

export interface IClientDepense {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
  description?: string;
  /** Caisse interne associée (kind=CLIENT) — créée à la validation. */
  caisseId?: string;
  statut: ClientDepenseStatus;
  actif: boolean;
  createdBy: string;
  valideBy?: string;
  valideAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ClientDepenseSchema = new Schema<IClientDepense>(
  {
    nom: { type: String, required: true, trim: true },
    telephone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    description: { type: String, trim: true, default: null },
    caisseId: { type: String, default: null },
    statut: {
      type: String,
      enum: Object.values(ClientDepenseStatus),
      default: ClientDepenseStatus.EN_ATTENTE,
      index: true,
    },
    actif: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
    valideBy: { type: String, default: null },
    valideAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ClientDepenseSchema.index({ nom: 1 });

const ClientDepense =
  models.ClientDepense ||
  model<IClientDepense>('ClientDepense', ClientDepenseSchema);

export default ClientDepense;
