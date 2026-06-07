import mongoose, { Schema, model, models } from 'mongoose';
import { CaisseType, TransactionType } from '@/types';

/**
 * Statut d'un mouvement caisse en attente de validation par l'admin transit.
 */
export enum MouvementPendingStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDE = 'VALIDE',
  REJETE = 'REJETE',
}

export enum MouvementPendingKind {
  /** Ajout de solde sur un seul compte (CREDIT). */
  CREDIT = 'CREDIT',
  /** Débit d'un seul compte (DEBIT). */
  DEBIT = 'DEBIT',
  /** Transfert : DEBIT source + CREDIT destination. */
  TRANSFER = 'TRANSFER',
}

export interface IMouvementPending {
  _id: string;
  kind: MouvementPendingKind;
  /** Compte cible pour CREDIT/DEBIT, ou source pour TRANSFER. */
  sourceCaisseId: string;
  sourceCaisseNom?: string;
  /** Pour TRANSFER uniquement. */
  destinationCaisseId?: string;
  destinationCaisseNom?: string;
  montant: number;
  description: string;
  date: Date;
  /** Domaine fonctionnel (pour scoping admin). */
  caisseType?: CaisseType;
  /** Image justificative (chèque, reçu, …) stockée sur S3. */
  recuUrl?: string;
  recuFilename?: string;
  statut: MouvementPendingStatus;
  createdBy: string;
  valideBy?: string;
  valideAt?: Date;
  rejetePar?: string;
  rejeteAt?: Date;
  commentaire?: string;
  /** IDs des transactions créées lors de la validation (audit). */
  transactionDebitId?: string;
  transactionCreditId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MouvementPendingSchema = new Schema<IMouvementPending>(
  {
    kind: {
      type: String,
      enum: Object.values(MouvementPendingKind),
      required: true,
    },
    sourceCaisseId: {
      type: String,
      required: true,
      index: true,
    },
    sourceCaisseNom: { type: String },
    destinationCaisseId: { type: String, index: true },
    destinationCaisseNom: { type: String },
    montant: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    caisseType: {
      type: String,
      enum: Object.values(CaisseType),
    },
    recuUrl: { type: String },
    recuFilename: { type: String },
    statut: {
      type: String,
      enum: Object.values(MouvementPendingStatus),
      default: MouvementPendingStatus.EN_ATTENTE,
      index: true,
    },
    createdBy: { type: String, required: true },
    valideBy: { type: String },
    valideAt: { type: Date },
    rejetePar: { type: String },
    rejeteAt: { type: Date },
    commentaire: { type: String, trim: true },
    transactionDebitId: { type: String },
    transactionCreditId: { type: String },
  },
  { timestamps: true }
);

MouvementPendingSchema.index({ statut: 1, createdAt: -1 });

// Helper type pour la vérification de TransactionType (utilisé dans valider).
export const transactionTypeOf = (
  kind: MouvementPendingKind
): TransactionType | undefined => {
  if (kind === MouvementPendingKind.CREDIT) return TransactionType.CREDIT;
  if (kind === MouvementPendingKind.DEBIT) return TransactionType.DEBIT;
  return undefined;
};

const MouvementPending =
  models.MouvementPending ||
  model<IMouvementPending>('MouvementPending', MouvementPendingSchema);

export default MouvementPending;
