import { Schema, model, models } from 'mongoose';
import { IVoyage, VoyageStatus } from '@/types';

const VoyageSchema = new Schema<IVoyage>(
  {
    // === Identification voyage =====================================
    date: {
      type: Date,
      required: [true, 'La date est requise'],
    },
    /** Matricule — saisi par le chauffeur lors de la réservation. */
    matricule: {
      type: String,
      trim: true,
      uppercase: true,
    },
    telephone: {
      type: String,
      trim: true,
    },
    clientSource: {
      type: String,
      trim: true,
    },
    societe: {
      type: String,
      trim: true,
    },
    tp: {
      type: String,
      trim: true,
    },
    /** @deprecated NTC unique — utiliser `ntcs[]`. Conservé pour les voyages
     *  existants en base. Le serializer le concatène à `ntcs` à la lecture. */
    ntc: {
      type: String,
      trim: true,
      uppercase: true,
    },
    /** Liste des NTC associés (un BL peut en porter plusieurs). */
    ntcs: {
      type: [
        {
          type: String,
          trim: true,
          uppercase: true,
        },
      ],
      default: [],
    },
    bl: {
      type: String,
      trim: true,
      uppercase: true,
    },
    magasinage: {
      type: Date,
      default: null,
    },
    surestaries: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      trim: true,
    },

    // === Workflow nouveau (fichier logistique) =====================
    fichierLogistiqueId: {
      type: String,
      index: true,
      default: null,
    },
    statutVoyage: {
      type: String,
      enum: Object.values(VoyageStatus),
      default: VoyageStatus.CREE,
      index: true,
    },
    chauffeurId: {
      type: String,
      default: null,
      index: true,
    },
    /** LogistiqueClient._id associé à ce voyage. */
    clientId: {
      type: String,
      default: null,
      index: true,
    },
    prixTransport: {
      type: Number,
      min: 0,
      default: 0,
    },
    commissionChauffeur: {
      type: Number,
      min: 0,
      default: 0,
    },
    scanDepartAt: { type: Date, default: null },
    scanDepartPhotoUrl: { type: String, default: null },
    scanDepartPhotoName: { type: String, default: null },
    scanRetourAt: { type: Date, default: null },
    scanRetourPhotoUrl: { type: String, default: null },
    scanRetourPhotoName: { type: String, default: null },
    valideTransitBy: { type: String, default: null },
    valideTransitAt: { type: Date, default: null },
    commissionPaidAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

VoyageSchema.index({ date: -1 });
VoyageSchema.index({ matricule: 1 });
VoyageSchema.index({ createdAt: -1 });

const Voyage = models.Voyage || model<IVoyage>('Voyage', VoyageSchema);

export default Voyage;
