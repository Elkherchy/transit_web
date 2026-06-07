import { Schema, model, models } from 'mongoose';

/**
 * Dépense réelle enregistrée par le caissier.
 *
 * - Référence une `DepenseCategorie` validée (catégorie sélectionnée par
 *   l'utilisateur dans la liste maintenue par l'agent/admin transit).
 * - Au moment de la création, un DEBIT est passé sur la caisse source
 *   (caisse générale ou banque transit) et la dépense est rattachée à la
 *   journée caisse OUVERTE du caissier — visible dans la clôture.
 */
export interface IDepense {
  _id: string;
  categorieId: string;
  categorieNom: string;
  /** Bénéficiaire de la dépense (ClientDepense) — optionnel. */
  clientDepenseId?: string;
  clientDepenseNom?: string;
  montant: number;
  description?: string;
  date: Date;
  caisseId: string;
  caisseNom?: string;
  transactionId?: string;
  journeeId?: string;
  /** URL S3 d'un éventuel justificatif (facultatif). */
  recuUrl?: string;
  recuFilename?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepenseSchema = new Schema<IDepense>(
  {
    categorieId: { type: String, required: true, index: true },
    categorieNom: { type: String, required: true, trim: true },
    clientDepenseId: { type: String, default: null, index: true },
    clientDepenseNom: { type: String, trim: true, default: null },
    montant: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: null },
    date: { type: Date, required: true, default: Date.now, index: true },
    caisseId: { type: String, required: true, index: true },
    caisseNom: { type: String, trim: true, default: null },
    transactionId: { type: String, default: null },
    journeeId: { type: String, default: null, index: true },
    recuUrl: { type: String, default: null },
    recuFilename: { type: String, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

DepenseSchema.index({ createdAt: -1 });

const Depense = models.Depense || model<IDepense>('Depense', DepenseSchema);

export default Depense;
