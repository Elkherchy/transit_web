import mongoose, { Schema, model, models } from 'mongoose';
import { IPaiement, PaiementStatus } from '@/types';

const PaiementSchema = new Schema<IPaiement>(
  {
    factureId: {
      type: String,
      required: [true, 'L\'ID de la facture est requis'],
    },
    montant: {
      type: Number,
      required: [true, 'Le montant est requis'],
      min: 0,
    },
    datePaiement: {
      type: Date,
      required: [true, 'La date de paiement est requise'],
      default: Date.now,
    },
    recuUrl: {
      type: String,
    },
    recuFilename: {
      type: String,
    },
    statut: {
      type: String,
      enum: Object.values(PaiementStatus),
      default: PaiementStatus.EN_ATTENTE,
    },
    payeurId: {
      type: String,
      required: [true, 'L\'ID du payeur est requis'],
    },
    validePar: {
      type: String,
    },
    dateValidation: {
      type: Date,
    },
    commentaire: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
PaiementSchema.index({ factureId: 1 });
PaiementSchema.index({ payeurId: 1 });
PaiementSchema.index({ statut: 1 });

const Paiement = models.Paiement || model<IPaiement>('Paiement', PaiementSchema);

export default Paiement;
