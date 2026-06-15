/**
 * Change the password of an ADMIN user.
 *
 * Usage:
 *   node scripts/change-admin-password.mjs <email> <new-password>
 *
 * Example:
 *   node scripts/change-admin-password.mjs admin@example.com MonNouveauMotDePasse123
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
try {
  const envPath = resolve(__dirname, '../.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env not found — rely on environment variables already set
}

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI non défini. Vérifiez votre fichier .env');
  process.exit(1);
}

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage : node scripts/change-admin-password.mjs <email> <nouveau-mot-de-passe>');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('❌  Le mot de passe doit contenir au moins 6 caractères.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);

const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
  nom: String,
}, { collection: 'users' });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

const user = await User.findOne({ email: email.trim().toLowerCase() });

if (!user) {
  console.error(`❌  Aucun utilisateur trouvé avec l'email : ${email}`);
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`✅  Utilisateur trouvé : ${user.nom} (${user.role})`);

const salt = await bcrypt.genSalt(10);
const hashed = await bcrypt.hash(newPassword, salt);

await User.updateOne({ _id: user._id }, { $set: { password: hashed } });

console.log(`✅  Mot de passe mis à jour pour ${user.email}`);

await mongoose.disconnect();
