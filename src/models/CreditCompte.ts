import mongoose, { Schema, model, models } from 'mongoose';
import type { ICreditCompte } from '@/types';

const CreditCompteSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    clientNom: {
      type: String,
      required: true,
      trim: true,
    },
    montant: {
      type: Number,
      required: true,
      min: 0,
    },
    numero: {
      type: String,
      required: true,
      unique: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reference: {
      type: String,
      trim: true,
      default: undefined,
    },
    description: {
      type: String,
      trim: true,
      default: undefined,
    },
    caisseClientId: {
      type: String,
      default: undefined,
    },
    createdBy: {
      type: String,
      required: true,
    },
    statut: {
      type: String,
      enum: ['EN_ATTENTE', 'ACTIF', 'ANNULE'],
      default: 'EN_ATTENTE',
    },
  },
  { timestamps: true }
);

const CreditCompte =
  models.CreditCompte ||
  model<ICreditCompte>('CreditCompte', CreditCompteSchema);

export default CreditCompte;
