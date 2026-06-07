import mongoose, { Schema, model } from 'mongoose';
import { LocationStatut, LocationType } from '@/types';

const LocationSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(LocationType),
      required: true,
      index: true,
    },
    clientNom: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    vehiculeInterneId: {
      type: String,
      trim: true,
      index: true,
    },
    vehiculeInterneMatricule: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    vehiculeClientId: {
      type: String,
      trim: true,
      index: true,
    },
    vehiculeClientMatricule: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    conteneurNumero: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    dateDebut: {
      type: Date,
      required: true,
      index: true,
    },
    dateFin: {
      type: Date,
      default: undefined,
      index: true,
    },
    montantJournalier: {
      type: Number,
      required: true,
      min: 0,
    },
    totalEstime: {
      type: Number,
      required: true,
      min: 0,
    },
    statut: {
      type: String,
      enum: Object.values(LocationStatut),
      required: true,
      default: LocationStatut.BROUILLON,
      index: true,
    },
    note: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

LocationSchema.index({ createdAt: -1 });

// En dev (hot-reload), un ancien schema peut rester cache dans mongoose.models.
// On supprime le modele existant pour recharger les enums a jour.
if (mongoose.models.Location) {
  delete mongoose.models.Location;
}

export default model('Location', LocationSchema);
