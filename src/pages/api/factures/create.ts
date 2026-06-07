import type { NextApiResponse } from 'next';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Client, Facture, JourneeCaisse, Transaction } from '@/models';
import {
  CaisseType,
  CompteType,
  FactureStatus,
  TransactionType,
  UserRole,
} from '@/types';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';
import { ensureDefaultGeneralCaisse } from '@/lib/caisse';

function generateFactureNumero(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `F-${year}${month}-${random}`;
}

async function buildUniqueFactureNumero(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const numero = generateFactureNumero();
    const exists = await Facture.exists({ numero });
    if (!exists) return numero;
  }
  return `F-${Date.now()}`;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    const user = req.user;

    // Caissier, admin (super) et admin transit peuvent créer des factures.
    if (
      user?.role !== UserRole.CAISSIER &&
      user?.role !== UserRole.ADMIN &&
      user?.role !== UserRole.ADMIN_TRANSIT
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { clientId, banqueId, montant } = req.body;

    if (!clientId || !banqueId || !montant || montant <= 0) {
      return res
        .status(400)
        .json({ error: 'Invalid client, banque, or montant' });
    }

    if (
      !mongoose.isValidObjectId(String(clientId)) ||
      !mongoose.isValidObjectId(String(banqueId))
    ) {
      return res.status(400).json({ error: 'Invalid client or banque id' });
    }

    const banque = await Caisse.findById(String(banqueId)).lean();
    if (!banque || !banque.actif || banque.type !== CompteType.BANQUE) {
      return res.status(400).json({ error: 'Compte banque invalide' });
    }

    const totalOperations = parseFloat(montant);
    const numero = await buildUniqueFactureNumero();
    // Facture manuelle: on génère un id transit technique valide pour satisfaire le schéma.
    const transitId = new mongoose.Types.ObjectId().toString();

    // Create facture
    const facture = new Facture({
      transitId,
      clientId: new mongoose.Types.ObjectId(String(clientId)),
      numero,
      totalOperations,
      interet: 0,
      totalFinal: totalOperations,
      statut: FactureStatus.BROUILLON,
      montantPaye: 0,
    });

    await facture.save();

    // Enregistrer l'évènement dans la journée ouverte pour l'affichage
    // du rapport `cloturer-journee` côté caissier.
    const journee = await getOrCreateOpenJournee(req.user!.userId);
    const clientDoc = await Client.findById(String(clientId)).select('nom').lean();

    await JourneeCaisse.findByIdAndUpdate(journee._id, {
      $push: {
        clientFactures: {
          factureId: String(facture._id),
          transitId,
          clientId: String(clientId),
          clientNom: clientDoc?.nom || null,
          factureNumero: numero,
          banqueId: String(banqueId),
          banqueNom: banque.nom || null,
          montant: totalOperations,
          date: new Date(),
        },
      },
    });

    // La facture créée par le caissier doit apparaître dans la caisse
    // General_Transit (recette client). Idempotent via sourcePaiementId
    // = `facture-${factureId}` (filtré dans computeJourneeKpis pour ne pas
    // gonfler le compteur "Dépôts admin").
    try {
      const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
      const sourcePaiementId = `facture-${String(facture._id)}`;
      const dup = await Transaction.findOne({ sourcePaiementId });
      if (!dup) {
        await Transaction.create({
          caisseId: general._id,
          type: TransactionType.CREDIT,
          montant: totalOperations,
          description: `Facture ${numero}${
            clientDoc?.nom ? ` — ${clientDoc.nom}` : ''
          } (Banque ${banque.nom || ''})`,
          date: new Date(),
          reference: numero,
          userId: req.user!.userId,
          sourcePaiementId,
        });
      }
    } catch (txErr) {
      // Une erreur ici ne doit pas bloquer la création de la facture.
      console.error('Facture → caisse General_Transit transaction error:', txErr);
    }

    return res.status(201).json({
      success: true,
      data: facture,
    });
  } catch (error) {
    console.error('Error creating facture:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
