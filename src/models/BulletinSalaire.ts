import { Model, Schema, model, models } from 'mongoose';
import { BulletinStatut, IBulletinSalaire } from '@/types';

const LigneSchema = new Schema(
  {
    libelle: { type: String, required: true, trim: true },
    montant: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const BulletinSalaireSchema = new Schema<IBulletinSalaire>(
  {
    salarieId: { type: String, required: true, trim: true, index: true },
    periode: { type: String, required: true, trim: true }, // "YYYY-MM"
    salaireBrut: { type: Number, required: true, min: 0 },
    primes: { type: [LigneSchema], default: [] },
    retenues: { type: [LigneSchema], default: [] },
    totalPrimes: { type: Number, default: 0 },
    totalRetenues: { type: Number, default: 0 },
    salaireNet: { type: Number, default: 0 },
    statut: {
      type: String,
      enum: Object.values(BulletinStatut),
      default: BulletinStatut.BROUILLON,
    },
    caisseId: { type: String, trim: true, default: undefined },
    transactionId: { type: String, trim: true, default: undefined },
    payePar: { type: String, trim: true, default: undefined },
    datePaiement: { type: Date, default: undefined },
    note: { type: String, trim: true, default: undefined },
    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

BulletinSalaireSchema.index({ salarieId: 1, periode: 1 }, { unique: true });
BulletinSalaireSchema.index({ statut: 1 });
BulletinSalaireSchema.index({ periode: -1 });

const BulletinSalaire =
  (models.BulletinSalaire as Model<IBulletinSalaire> | undefined) ||
  model<IBulletinSalaire>('BulletinSalaire', BulletinSalaireSchema);

export default BulletinSalaire;
