import { Model, Schema, model, models } from 'mongoose';
import { IVehicule, VehiculeCategorie } from '@/types';

const VehiculeSchema = new Schema<IVehicule>(
  {
    matricule: {
      type: String,
      required: [true, 'Le matricule est requis'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    categorie: {
      type: String,
      enum: Object.values(VehiculeCategorie),
      required: true,
      default: VehiculeCategorie.INTERNE,
      index: true,
    },
    chauffeurId: {
      type: String,
      trim: true,
      default: undefined,
    },
    clientNom: {
      type: String,
      trim: true,
      default: undefined,
    },
    carburant: {
      type: Number,
      min: 0,
      default: 0,
    },
    actif: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

VehiculeSchema.index({ matricule: 1 }, { unique: true });
VehiculeSchema.index({ chauffeurId: 1 });
VehiculeSchema.index({ createdAt: -1 });

const existingVehiculeModel = models.Vehicule as Model<IVehicule> | undefined;

// In dev hot-reload, Next.js may reuse an older compiled model missing new paths.
// If carburant path is absent, rebuild the model so writes are not silently dropped.
if (existingVehiculeModel && !existingVehiculeModel.schema.path('carburant')) {
  delete models.Vehicule;
}

if (existingVehiculeModel && !existingVehiculeModel.schema.path('categorie')) {
  delete models.Vehicule;
}

const Vehicule = (models.Vehicule as Model<IVehicule> | undefined) || model<IVehicule>('Vehicule', VehiculeSchema);

export default Vehicule;
