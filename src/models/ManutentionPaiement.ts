import mongoose, { Schema, model, models } from 'mongoose';
import { IManutentionPaiement, ManutentionPaiementStatus } from '@/types';

const ManutentionPaiementSchema = new Schema<IManutentionPaiement>(
  {
    factureManutentionId: {
      type: String,
      required: [true, 'L\'ID de la facture manutention est requis'],
    },
    montant: {
      type: Number,
      required: true,
      min: 0,
    },
    datePaiement: {
      type: Date,
      required: true,
    },
    recuUrl: {
      type: String,
      default: null,
    },
    recuFilename: {
      type: String,
      default: null,
    },
    statut: {
      type: String,
      enum: Object.values(ManutentionPaiementStatus),
      default: ManutentionPaiementStatus.EN_ATTENTE,
    },
    payeurId: {
      type: String,
      required: true,
    },
    validePar: {
      type: String,
      default: null,
    },
    dateValidation: {
      type: Date,
      default: null,
    },
    commentaire: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
ManutentionPaiementSchema.index({ factureManutentionId: 1 });
ManutentionPaiementSchema.index({ payeurId: 1 });
ManutentionPaiementSchema.index({ statut: 1 });
ManutentionPaiementSchema.index({ createdAt: -1 });

const ManutentionPaiement = models.ManutentionPaiement || model<IManutentionPaiement>('ManutentionPaiement', ManutentionPaiementSchema);

export default ManutentionPaiement;
