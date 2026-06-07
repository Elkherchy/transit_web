/**
 * Script d'initialisation des clients logistiques par défaut
 * Usage: node -r ts-node/register src/scripts/seedLogistiqueClients.ts
 */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import LogistiqueClientConfig from '@/models/LogistiqueClientConfig';
import { LogistiqueClient } from '@/types';

async function seedClients() {
  try {
    await dbConnect();
    console.log('Connected to MongoDB');

    const defaultClients = Object.values(LogistiqueClient).map((name) => ({
      name,
      description: `Client logistique: ${name}`,
      actif: true,
    }));

    for (const client of defaultClients) {
      const existing = await LogistiqueClientConfig.findOne({
        name: { $regex: `^${client.name}$`, $options: 'i' },
      });

      if (!existing) {
        await LogistiqueClientConfig.create(client);
        console.log(`✓ Created client: ${client.name}`);
      } else {
        console.log(`✓ Client already exists: ${client.name}`);
      }
    }

    console.log('✓ Seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding clients:', error);
    process.exit(1);
  }
}

void seedClients();
