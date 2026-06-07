import { Schema, model, models } from 'mongoose';

/**
 * Catégorie de dépense (liste maintenue côté Transit).
 *
 * - L'AGENT_TRANSIT propose de nouvelles catégories de dépenses qui restent
 *   EN_ATTENTE jusqu'à validation par l'ADMIN_TRANSIT.
 * - Une fois VALIDE, la catégorie devient sélectionnable par le caissier lors
 *   de l'enregistrement d'une dépense.
 * - REJETEE = suppression effective (workflow simple).
 */
export enum DepenseCategorieStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDE = 'VALIDE',
}

export interface IDepenseCategorie {
  _id: string;
  nom: string;
  description?: string;
  statut: DepenseCategorieStatus;
  actif: boolean;
  createdBy: string;
  valideBy?: string;
  valideAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DepenseCategorieSchema = new Schema<IDepenseCategorie>(
  {
    nom: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    statut: {
      type: String,
      enum: Object.values(DepenseCategorieStatus),
      default: DepenseCategorieStatus.EN_ATTENTE,
      index: true,
    },
    actif: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
    valideBy: { type: String, default: null },
    valideAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DepenseCategorieSchema.index({ nom: 1 });

const DepenseCategorie =
  models.DepenseCategorie ||
  model<IDepenseCategorie>('DepenseCategorie', DepenseCategorieSchema);

export default DepenseCategorie;
