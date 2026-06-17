import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Facture, Paiement, Transit } from '@/models';
import {
  ApiResponse,
  IPaiement,
  PaiementStatus,
  FactureStatus,
  TransitStatus,
  UserRole,
} from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { storeRecuDocument } from '@/lib/transitDocumentStorage';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  },
});

const uploadMiddleware = upload.single('recu');

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (fn as (r: NextApiRequest, s: NextApiResponse, cb: (result?: unknown) => void) => void)(
      req,
      res,
      (result?: unknown) => {
        if (result instanceof Error) reject(result);
        else resolve();
      }
    );
  });
}

async function handler(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse<ApiResponse<IPaiement>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    await runMiddleware(req, res, uploadMiddleware);

    const { id } = req.query;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const paiement = await Paiement.findById(id);

    if (!paiement) {
      return res.status(404).json({ success: false, error: 'Paiement non trouvé' });
    }

    // Check if user is the payeur
    if (paiement.payeurId !== req.user!.userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Aucun fichier uploadé' });
    }

    if (paiement.statut !== PaiementStatus.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        error: 'Ce paiement ne peut plus recevoir de reçu dans cet état',
      });
    }

    let stored;
    try {
      stored = await storeRecuDocument({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
    } catch (storeErr) {
      const msg =
        storeErr instanceof Error ? storeErr.message : 'Échec enregistrement du reçu';
      console.error('storeRecuDocument:', storeErr);
      return res.status(503).json({ success: false, error: msg });
    }

    paiement.recuUrl = stored.recuUrl;
    paiement.recuFilename = req.file.originalname;
    paiement.statut = PaiementStatus.EN_VALIDATION;
    await paiement.save();

    const facture = await Facture.findById(paiement.factureId);
    if (facture) {
      facture.statut = FactureStatus.EN_VALIDATION;
      await facture.save();
      const transit = await Transit.findById(facture.transitId);
      if (transit) {
        transit.statut = TransitStatus.EN_VALIDATION;
        await transit.save({ validateModifiedOnly: true });
      }
    }

    return res.status(200).json({
      success: true,
      data: paiement as IPaiement,
      message: 'Reçu enregistré — dossier en validation comptable',
    });
  } catch (error) {
    console.error('Upload recu error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withAuth(handler, [UserRole.USER_PAYEUR]);
