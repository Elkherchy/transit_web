import mongoose, { Document, Schema } from 'mongoose';

export interface ILogistiqueClientConfig extends Document {
  name: string;
  description?: string;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LogistiqueClientConfigSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    actif: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.LogistiqueClientConfig ||
  mongoose.model<ILogistiqueClientConfig>('LogistiqueClientConfig', LogistiqueClientConfigSchema);
