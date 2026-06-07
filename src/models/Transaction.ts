import mongoose, { Schema, model } from 'mongoose';
import { TransactionType } from '@/types';

const TransactionSchema = new Schema(
  {
    caisseId: {
      type: Schema.Types.ObjectId,
      ref: 'Caisse',
      required: [true, 'La caisse est requise'],
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: [true, 'Le type de transaction est requis'],
    },
    montant: {
      type: Number,
      required: [true, 'Le montant est requis'],
      min: 0,
    },
    description: {
      type: String,
      required: [true, 'La description est requise'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'La date est requise'],
      default: Date.now,
    },
    reference: {
      type: String,
      trim: true,
    },
    userId: {
      type: String,
      required: [true, "L'utilisateur auteur est requis"],
    },
    vehiculeId: {
      type: String,
      trim: true,
      index: true,
    },
    vehiculeMatricule: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    mirrorSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      default: undefined,
    },
    /** Idempotence : écritures caisse (débit payeur + crédit général) à la validation d’un paiement */
    sourcePaiementId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ type: 1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ mirrorSourceId: 1 });

// Next.js recharge les modules sans retirer mongoose.models : un ancien schéma (champ `caisse`)
// restait alors utilisé. On force la recompilation du modèle à chaque chargement du fichier.
if (mongoose.models.Transaction) {
  delete mongoose.models.Transaction;
}

const Transaction = model('Transaction', TransactionSchema);

export default Transaction;
