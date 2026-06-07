import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import connectDB from '@/lib/db';
import User from '@/models/User';
import { UserRole } from '@/types';

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const exact = args.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1).trim();

  const index = args.findIndex((arg) => arg === flag);
  if (index >= 0) {
    return args[index + 1]?.trim();
  }

  return undefined;
}

async function askMissing(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current?: string
): Promise<string> {
  if (current?.trim()) return current.trim();
  const value = (await rl.question(`${label}: `)).trim();
  if (!value) {
    throw new Error(`${label} requis`);
  }
  return value;
}

async function main() {
  const rl = createInterface({ input, output });

  try {
    const nom = await askMissing(rl, 'Nom', getArg('--nom'));
    const email = (await askMissing(rl, 'Email', getArg('--email'))).toLowerCase();
    const password = await askMissing(rl, 'Mot de passe', getArg('--password'));

    if (password.length < 6) {
      throw new Error('Le mot de passe doit contenir au moins 6 caractères');
    }

    await connectDB();

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      console.log(`Un utilisateur existe déjà avec cet email: ${email}`);
      process.exit(1);
    }

    const user = await User.create({
      nom,
      email,
      password,
      role: UserRole.ADMIN,
      actif: true,
    });

    console.log('Admin créé avec succès.');
    console.log(`ID: ${String(user._id)}`);
    console.log(`Nom: ${user.nom}`);
    console.log(`Email: ${user.email}`);
    console.log(`Rôle: ${user.role}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Erreur inconnue lors de la création admin'
  );
  process.exit(1);
});
