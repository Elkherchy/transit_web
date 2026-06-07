import mongoose, { Schema, model, models } from 'mongoose';

export interface ILogistiqueClientDoc {
  _id: mongoose.Types.ObjectId;
  nom: string;
  /** Numéro principal (téléphone ou identifiant client). */
  numero?: string;
  societe?: string;
  actif: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LogistiqueClientSchema = new Schema<ILogistiqueClientDoc>(
  {
    nom: {
      type: String,
      required: [true, 'Le nom du client logistique est requis'],
      trim: true,
    },
    numero: { type: String, trim: true, default: null },
    societe: { type: String, trim: true, default: null },
    actif: { type: Boolean, default: true },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
);

LogistiqueClientSchema.index({ nom: 1 });
LogistiqueClientSchema.index({ numero: 1 });

// En dev, Next.js peut réutiliser un ancien modèle compilé avec les champs
// d'origine (telephone, email, ntc, adresse, note). On invalide le cache si
// l'ancien schéma est détecté pour reconstruire celui à 3 champs.
const existing = models.LogistiqueClient as mongoose.Model<unknown> | undefined;
if (existing && existing.schema.path('telephone')) {
  delete models.LogistiqueClient;
}

const LogistiqueClient =
  models.LogistiqueClient ||
  model<ILogistiqueClientDoc>('LogistiqueClient', LogistiqueClientSchema);

export default LogistiqueClient;
