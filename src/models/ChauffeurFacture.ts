import { Schema, model, models } from 'mongoose';
import { ChauffeurFactureStatut } from '@/types';

const ChauffeurFactureSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    chauffeurId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    weekStart: {
      type: Date,
      required: true,
      index: true,
    },
    weekEnd: {
      type: Date,
      required: true,
      index: true,
    },
    nombreCharges: {
      type: Number,
      required: true,
      min: 0,
    },
    montantCharge: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    statut: {
      type: String,
      enum: Object.values(ChauffeurFactureStatut),
      required: true,
      default: ChauffeurFactureStatut.BROUILLON,
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
      trim: true,
    },
  },
  { timestamps: true }
);

ChauffeurFactureSchema.index({ chauffeurId: 1, weekStart: 1, weekEnd: 1 }, { unique: true });
ChauffeurFactureSchema.index({ statut: 1, createdAt: -1 });

export default models.ChauffeurFacture || model('ChauffeurFacture', ChauffeurFactureSchema);
