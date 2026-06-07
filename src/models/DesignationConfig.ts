import mongoose, { Schema, model, models } from 'mongoose';
import { IDesignationConfig } from '@/types';

const DesignationConfigSchema = new Schema<IDesignationConfig>(
  {
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      unique: true,
      trim: true,
    },
    actif: {
      type: Boolean,
      default: true,
    },
    ordre: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
DesignationConfigSchema.index({ actif: 1 });
DesignationConfigSchema.index({ ordre: 1 });

const DesignationConfig = models.DesignationConfig || model<IDesignationConfig>('DesignationConfig', DesignationConfigSchema);

export default DesignationConfig;
