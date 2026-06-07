import { Schema, model, models } from 'mongoose';
import { FichierLogistiqueStatus, IFichierLogistique } from '@/types';

const FichierLogistiqueSchema = new Schema<IFichierLogistique>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    statut: {
      type: String,
      enum: Object.values(FichierLogistiqueStatus),
      default: FichierLogistiqueStatus.OUVERT,
    },
    createdBy: {
      type: String,
      required: true,
    },
    valideTransitBy: { type: String, default: null },
    valideTransitAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FichierLogistiqueSchema.index({ statut: 1 });
FichierLogistiqueSchema.index({ date: -1 });
FichierLogistiqueSchema.index({ createdAt: -1 });

const FichierLogistique =
  models.FichierLogistique ||
  model<IFichierLogistique>('FichierLogistique', FichierLogistiqueSchema);

export default FichierLogistique;
