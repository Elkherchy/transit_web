import mongoose, { Schema, model, models } from 'mongoose';
import { IFacture, FactureStatus } from '@/types';

const FactureSchema = new Schema(
  {
    transitId: {
      type: String,
      required: [true, 'L\'ID du transit est requis'],
      unique: true,
    },
    bl: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },
    payeurId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    numero: {
      type: String,
      required: [true, 'Le numéro de facture est requis'],
      unique: true,
    },
    totalOperations: {
      type: Number,
      required: true,
      min: 0,
    },
    interet: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalFinal: {
      type: Number,
      required: true,
      min: 0,
    },
    statut: {
      type: String,
      enum: Object.values(FactureStatus),
      default: FactureStatus.BROUILLON,
    },
    dateEmission: {
      type: Date,
    },
    montantPaye: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to calculate totalFinal
FactureSchema.pre('save', function() {
  this.totalFinal = this.totalOperations + this.interet;
});

// Index for faster queries (only non-unique indexes)
FactureSchema.index({ statut: 1 });
FactureSchema.index({ clientId: 1 });

const Facture = models.Facture || model<IFacture>('Facture', FactureSchema);

export default Facture;
