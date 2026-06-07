import { Model, Schema, model, models } from 'mongoose';
import { ISalarie } from '@/types';

const SalarieSchema = new Schema<ISalarie>(
  {
    userId: { type: String, trim: true, default: undefined },
    nom: { type: String, required: true, trim: true },
    prenom: { type: String, required: true, trim: true },
    poste: { type: String, required: true, trim: true },
    salaireBrut: { type: Number, required: true, min: 0, default: 0 },
    banqueCompteId: { type: String, trim: true, default: undefined },
    rib: { type: String, trim: true, default: undefined },
    banque: { type: String, trim: true, default: undefined },
    dateEmbauche: { type: Date, default: undefined },
    actif: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SalarieSchema.index({ nom: 1, prenom: 1 });
SalarieSchema.index({ userId: 1 });
SalarieSchema.index({ banqueCompteId: 1 });
SalarieSchema.index({ actif: 1 });

const Salarie =
  (models.Salarie as Model<ISalarie> | undefined) ||
  model<ISalarie>('Salarie', SalarieSchema);

export default Salarie;
