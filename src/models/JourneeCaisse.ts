import { Schema, model, models } from 'mongoose';
import {
  IJourneeCaisse,
  JourneeCaisseStatus,
  JourneeClientPaiementStatus,
} from '@/types';

const AlimentationGeneraleSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  source: { type: String, default: null },
  reference: { type: String, default: null },
}, { _id: false });

const AlimentationPayeurSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
  },
  payeurId: {
    type: String,
    required: true,
  },
  caisseId: {
    type: String,
    required: true,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, { _id: false });

const ClientPaiementJourneeSchema = new Schema({
  paiementId: {
    type: String,
    required: true,
  },
  factureId: {
    type: String,
    required: true,
  },
  transitId: {
    type: String,
    default: null,
  },
  clientId: {
    type: String,
    default: null,
  },
  clientNom: {
    type: String,
    default: null,
  },
  factureNumero: {
    type: String,
    default: null,
  },
  banqueId: {
    type: String,
    required: true,
  },
  banqueNom: {
    type: String,
    default: null,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  reference: {
    type: String,
    default: null,
  },
  statut: {
    type: String,
    enum: Object.values(JourneeClientPaiementStatus),
    default: JourneeClientPaiementStatus.EN_VALIDATION,
  },
  valideTransitBy: {
    type: String,
    default: null,
  },
  valideTransitAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

const ClientFactureJourneeSchema = new Schema({
  factureId: {
    type: String,
    required: true,
  },
  transitId: {
    type: String,
    default: null,
  },
  clientId: {
    type: String,
    default: null,
  },
  clientNom: {
    type: String,
    default: null,
  },
  factureNumero: {
    type: String,
    required: true,
  },
  banqueId: {
    type: String,
    required: true,
  },
  banqueNom: {
    type: String,
    default: null,
  },
  montant: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, { _id: false });

const JourneeCaisseSchema = new Schema<IJourneeCaisse>(
  {
    date: {
      type: Date,
      required: true,
    },
    caissierId: {
      type: String,
      required: true,
    },
    statut: {
      type: String,
      enum: Object.values(JourneeCaisseStatus),
      default: JourneeCaisseStatus.OUVERTE,
    },
    soldeGeneralDebut: {
      type: Number,
      required: true,
      default: 0,
    },
    soldeGeneralFin: {
      type: Number,
      default: null,
    },
    alimentationsAdmin: {
      type: [AlimentationGeneraleSchema],
      default: [],
    },
    alimentationsPayeurs: {
      type: [AlimentationPayeurSchema],
      default: [],
    },
    clientPaiements: {
      type: [ClientPaiementJourneeSchema],
      default: [],
    },
    clientFactures: {
      type: [ClientFactureJourneeSchema],
      default: [],
    },
    transitsTraitesIds: {
      type: [String],
      default: [],
    },
    // KPI snapshot figés à la clôture — historique frozen.
    depotsAdminTotal: { type: Number, default: null },
    depotsAdminCount: { type: Number, default: null },
    alimentationsTotalReal: { type: Number, default: null },
    alimentationsCountReal: { type: Number, default: null },
    closedAt: { type: Date, default: null },
    valideTransitBy: { type: String, default: null },
    valideTransitAt: { type: Date, default: null },
    valideAdminBy: { type: String, default: null },
    valideAdminAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Une seule journée par caissier par jour. Le code normalise `date` au début de jour
// avant insertion pour que cet index unique fonctionne comme attendu.
JourneeCaisseSchema.index({ caissierId: 1, date: 1 }, { unique: true });
JourneeCaisseSchema.index({ statut: 1 });
JourneeCaisseSchema.index({ date: -1 });

const JourneeCaisse = models.JourneeCaisse || model<IJourneeCaisse>('JourneeCaisse', JourneeCaisseSchema);

export default JourneeCaisse;
