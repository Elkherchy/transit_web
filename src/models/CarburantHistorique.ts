import { Model, Schema, model, models } from 'mongoose';
import {
  CarburantHistoriqueSource,
  CarburantHistoriqueType,
  ICarburantHistorique,
} from '@/types';

const CarburantHistoriqueSchema = new Schema<ICarburantHistorique>(
  {
    vehiculeId: {
      type: String,
      required: [true, 'Vehicule requis'],
      trim: true,
      index: true,
    },
    matricule: {
      type: String,
      required: [true, 'Matricule requis'],
      trim: true,
      uppercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(CarburantHistoriqueType),
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(CarburantHistoriqueSource),
      required: true,
      index: true,
    },
    fuelDate: {
      type: Date,
      index: true,
    },
    quantite: {
      type: Number,
      min: 0,
      required: true,
    },
    before: {
      type: Number,
      min: 0,
      required: true,
    },
    after: {
      type: Number,
      min: 0,
      required: true,
    },
    compteurPrecedentKm: {
      type: Number,
      min: 0,
    },
    compteurActuelKm: {
      type: Number,
      min: 0,
    },
    nombreTrajets: {
      type: Number,
      min: 0,
    },
    rendementCarburantParTrajet: {
      type: Number,
      min: 0,
    },
    rendementCompteurParTrajet: {
      type: Number,
      min: 0,
    },
    distanceKm: {
      type: Number,
      min: 0,
    },
    consommationL100: {
      type: Number,
      min: 0,
    },
    batchKey: {
      type: String,
      trim: true,
      index: true,
    },
    voyageId: {
      type: String,
      trim: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    createdBy: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

CarburantHistoriqueSchema.index({ vehiculeId: 1, createdAt: -1 });
CarburantHistoriqueSchema.index({ matricule: 1, createdAt: -1 });

const existingModel = models.CarburantHistorique as Model<ICarburantHistorique> | undefined;
if (
  existingModel &&
  (!existingModel.schema.path('source') ||
    !existingModel.schema.path('voyageId') ||
    !existingModel.schema.path('fuelDate') ||
    !existingModel.schema.path('compteurActuelKm'))
) {
  delete models.CarburantHistorique;
}

const CarburantHistorique =
  (models.CarburantHistorique as Model<ICarburantHistorique> | undefined) ||
  model<ICarburantHistorique>('CarburantHistorique', CarburantHistoriqueSchema);

export default CarburantHistorique;
