import mongoose, { Schema, model, models } from 'mongoose';
import { ITransit, TransitStatus, DesignationStatus } from '@/types';

const DesignationSchema = new Schema({
  nom: {
    type: String,
    required: true,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
  // Workflow par-désignation : verrou payeur, paiement+reçu, validations.
  statutDesignation: {
    type: String,
    enum: Object.values(DesignationStatus),
    default: DesignationStatus.LIBRE,
  },
  payeurId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reservedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  // Reçu principal (legacy / 1er upload) — gardé pour rétro-compatibilité.
  recuUrl: { type: String, default: null },
  recuFilename: { type: String, default: null },
  // Liste de tous les reçus uploadés au paiement (multi-upload). Le premier
  // est aussi reflété dans `recuUrl`/`recuFilename` pour les anciens callers.
  recus: {
    type: [
      new Schema(
        {
          key: { type: String, required: true },
          name: { type: String, default: '' },
          size: { type: Number, default: 0 },
          uploadedAt: { type: Date, default: Date.now },
        },
        { _id: true }
      ),
    ],
    default: [],
  },
  valideTransitBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  valideTransitAt: { type: Date, default: null },
  valideAdminBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  valideAdminAt: { type: Date, default: null },
  commentaire: { type: String, default: null },
}, { _id: true });

const DocumentSchema = new Schema({
  key: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const TransitSchema = new Schema<ITransit>(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    client: {
      type: String,
      required: [true, 'Le client est requis'],
      trim: true,
    },
    bl: {
      type: String,
      required: [true, 'Le BL est requis'],
      trim: true,
      uppercase: true,
    },
    objet: {
      type: String,
      required: [true, 'L\'objet est requis'],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'La date est requise'],
      default: Date.now,
    },
    designations: {
      type: [DesignationSchema],
      default: [],
    },
    documents: {
      type: [DocumentSchema],
      default: [],
    },
    statut: {
      type: String,
      enum: Object.values(TransitStatus),
      default: TransitStatus.EN_COURS,
    },
    interet: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: String,
      required: true,
    },
    factureManutentionId: {
      type: Schema.Types.ObjectId,
      ref: 'FactureManutention',
      default: null,
    },
    journeeId: {
      type: Schema.Types.ObjectId,
      ref: 'JourneeCaisse',
      default: null,
    },
    valideTransitBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    valideTransitAt: { type: Date, default: null },
    valideAdminBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    valideAdminAt: { type: Date, default: null },
    factureClientId: {
      type: Schema.Types.ObjectId,
      ref: 'Facture',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
TransitSchema.index({ client: 1 });
TransitSchema.index({ bl: 1 });
TransitSchema.index({ statut: 1 });
TransitSchema.index({ createdAt: -1 });
TransitSchema.index({ journeeId: 1 });
TransitSchema.index({ factureManutentionId: 1 });
TransitSchema.index({ 'designations.payeurId': 1 });
TransitSchema.index({ 'designations.statutDesignation': 1 });

const Transit = models.Transit || model<ITransit>('Transit', TransitSchema);

export default Transit;
