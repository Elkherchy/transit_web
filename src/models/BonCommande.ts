import { Schema, model, models } from 'mongoose';
import { BonCommandeStatut, LogistiqueClient } from '@/types';

const LigneSchema = new Schema(
  {
    voyageId: {
      type: Schema.Types.ObjectId,
      ref: 'Voyage',
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    montant: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const BonCommandeSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    /**
     * Numéro de facture séquentiel (001, 002, …) saisi/calculé à la création
     * du bon en mode simple. Distinct de `reference` (UID interne BC-…-…).
     */
    numero: {
      type: String,
      trim: true,
      index: true,
    },
    client: {
      type: String,
      required: true,
    },
    /**
     * Détail des lignes voyage (mode avancé).
     * Mode "facture simple" : tableau vide, le `total` est saisi directement.
     */
    lignes: {
      type: [LigneSchema],
      default: [],
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    statut: {
      type: String,
      enum: Object.values(BonCommandeStatut),
      required: true,
      default: BonCommandeStatut.BROUILLON,
    },
    date: {
      type: Date,
    },
    caisseId: {
      type: Schema.Types.ObjectId,
      ref: 'Caisse',
    },
    caisseNom: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    paidAt: {
      type: Date,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

BonCommandeSchema.index({ client: 1, statut: 1 });
BonCommandeSchema.index({ createdAt: -1 });

export default models.BonCommande || model('BonCommande', BonCommandeSchema);
