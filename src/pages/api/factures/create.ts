import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import connectDB from '@/lib/db';
import {
  Caisse,
  Client,
  Facture,
  JourneeCaisse,
  OperationValidation,
} from '@/models';
import {
  OperationType,
  OperationValidationStatus,
} from '@/models/OperationValidation';
import { CompteType, FactureStatus, UserRole } from '@/types';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';
import { storeTransitDocument } from '@/lib/transitDocumentStorage';

// Multipart : la route peut recevoir soit du JSON classique, soit un
// FormData avec le document de justification (dépôt scanné, etc.).
export const config = {
  api: {
    bodyParser: false,
  },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non supporté (PDF/JPG/PNG)'));
  },
});

const uploadMiddleware = upload.single('justification');

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (
      fn as (
        r: NextApiRequest,
        s: NextApiResponse,
        cb: (result?: unknown) => void
      ) => void
    )(req, res, (result?: unknown) => {
      if (result instanceof Error) reject(result);
      else resolve();
    });
  });
}

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

async function handler(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    // Parse le multipart avant de lire req.body (multer remplit req.body
    // avec les champs texte et req.file avec le fichier). Fallback JSON.
    const contentType = String(req.headers['content-type'] || '');
    if (contentType.startsWith('multipart/form-data')) {
      await runMiddleware(req, res, uploadMiddleware);
    } else {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve());
        req.on('error', (e) => reject(e));
      });
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          (req as unknown as { body: unknown }).body = JSON.parse(raw);
        } catch {
          return res.status(400).json({ error: 'Body JSON invalide' });
        }
      }
    }

    const user = req.user;

    // Caissier, admin (super) et admin transit peuvent créer des dépôts.
    if (
      user?.role !== UserRole.CAISSIER &&
      user?.role !== UserRole.ADMIN &&
      user?.role !== UserRole.ADMIN_TRANSIT
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { clientId, banqueId, montant } = req.body as {
      clientId?: string;
      banqueId?: string;
      montant?: string | number;
    };

    if (!clientId || !banqueId || !montant || Number(montant) <= 0) {
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

    const totalOperations = parseFloat(String(montant));
    const numero = await buildUniqueFactureNumero();
    // Dépôt manuel : id transit technique valide pour satisfaire le schéma.
    const transitId = new mongoose.Types.ObjectId().toString();

    // Création du dépôt — la banque choisie est STOCKÉE mais PAS créditée à
    // ce stade. Le CREDIT banque + caisse client est différé à la validation
    // par l'agent transit (rien ne bouge tant que non validé ; en cas de
    // rejet, la facture est supprimée, aucun impact à annuler).
    const facture = new Facture({
      transitId,
      clientId: new mongoose.Types.ObjectId(String(clientId)),
      banqueId: new mongoose.Types.ObjectId(String(banqueId)),
      numero,
      totalOperations,
      interet: 0,
      totalFinal: totalOperations,
      statut: FactureStatus.EN_VALIDATION,
      montantPaye: 0,
    });

    await facture.save();

    // Upload du justificatif (dépôt scanné) → S3. Facultatif.
    if (req.file) {
      try {
        const stored = await storeTransitDocument(
          `factures/${String(facture._id)}`,
          {
            buffer: req.file.buffer,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        );
        facture.justificationUrl = stored.key;
        facture.justificationFilename = stored.name;
        await facture.save();
      } catch (uploadErr) {
        console.error('Facture justification upload S3 error:', uploadErr);
      }
    }

    // Enregistre l'évènement dans la journée ouverte (rapport caissier).
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

    // Envoie l'opération à l'agent transit pour validation.
    // Type CLIENT_FACTURE, statut EN_ATTENTE_AGENT. Idempotent via opId.
    try {
      const existing = await OperationValidation.findOne({
        opType: OperationType.CLIENT_FACTURE,
        opId: String(facture._id),
      });
      if (!existing) {
        await OperationValidation.create({
          opType: OperationType.CLIENT_FACTURE,
          opId: String(facture._id),
          snapshot: {
            libelle: `Dépôt ${numero}${clientDoc?.nom ? ` — ${clientDoc.nom}` : ''}`,
            montant: totalOperations,
            contrepartie: clientDoc?.nom || null,
            date: new Date(),
          },
          statut: OperationValidationStatus.EN_ATTENTE_AGENT,
          journeeId: String(journee._id),
          submittedBy: req.user!.userId,
          submittedAt: new Date(),
        });
      }
    } catch (opErr) {
      console.error('Facture → OperationValidation error:', opErr);
    }

    return res.status(201).json({
      success: true,
      data: facture,
      message:
        'Dépôt créé — en attente de validation par l\'agent transit (aucun impact caisse tant que non validé)',
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /Type de fichier non support/.test(error.message)
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating facture:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withAuth(handler);
