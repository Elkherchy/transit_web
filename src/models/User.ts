import mongoose, { Schema, model, models } from 'mongoose';
import { IUser, UserRole, CaisseType } from '@/types';
import bcrypt from 'bcryptjs';

const UserSchema = new Schema<IUser>(
  {
    nom: {
      type: String,
      required: [true, 'Le nom est requis'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'L\'email est requis'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est requis'],
      minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: [true, 'Le rôle est requis'],
    },
    caisse: {
      type: String,
      enum: Object.values(CaisseType),
      required: function(this: IUser) {
        // Seul COMPTABLE conserve une caisse logique TRANSIT/LOGISTIQUE.
        return this.role === UserRole.COMPTABLE;
      },
    },
    caisseCompteId: {
      type: String,
      trim: true,
    },
    telephone: {
      type: String,
      trim: true,
    },
    actif: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
UserSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete (ret as { password?: string }).password;
    return ret;
  },
});

const User = models.User || model<IUser>('User', UserSchema);

export default User;
