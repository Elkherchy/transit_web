import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Facture, Paiement, Transit } from '@/models';
import {
  ApiResponse,
  IPaiement,
  PaiementStatus,
  FactureStatus,
  TransitStatus,
} from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { storeRecuDocument } from '@/lib/transitDocumentStorage';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non supporté'));
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

    const factureIdRaw = req.body?.factureId;
    if (!factureIdRaw || !mongoose.isValidObjectId(String(factureIdRaw))) {
      return res.status(400).json({ success: false, error: 'ID facture invalide' });
    }

    const facture = await Facture.findById(String(factureIdRaw));
    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture non trouvée' });
    }

    const uid = req.user!.userId;
    if (String(facture.payeurId || '') !== uid) {
      return res.status(403).json({
        success: false,
        error: 'Vous n’êtes pas le payeur désigné pour cette facture',
      });
    }

    if (facture.statut !== FactureStatus.EMIS) {
      return res.status(400).json({
        success: false,
        error: 'La facture doit être émise pour pouvoir payer',
      });
    }

    const pending = await Paiement.countDocuments({
      factureId: String(facture._id),
      statut: { $in: [PaiementStatus.EN_ATTENTE, PaiementStatus.EN_VALIDATION] },
    });
    if (pending > 0) {
      return res.status(400).json({
        success: false,
        error: 'Un paiement est déjà en cours pour cette facture',
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Le reçu de paiement est obligatoire' });
    }

    const montant = parseFloat(String(req.body?.montant ?? '').replace(',', '.'));
    if (Number.isNaN(montant) || montant <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    let datePaiement = new Date();
    if (req.body?.datePaiement) {
      const d = new Date(String(req.body.datePaiement));
      if (!Number.isNaN(d.getTime())) datePaiement = d;
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

    const paiement = await Paiement.create({
      factureId: String(facture._id),
      montant,
      datePaiement,
      recuUrl: stored.recuUrl,
      recuFilename: req.file.originalname,
      statut: PaiementStatus.EN_VALIDATION,
      payeurId: uid,
    });

    facture.statut = FactureStatus.EN_VALIDATION;
    await facture.save();

    const transit = await Transit.findById(facture.transitId);
    if (transit) {
      transit.statut = TransitStatus.EN_VALIDATION;
      await transit.save({ validateModifiedOnly: true });
    }

    return res.status(201).json({
      success: true,
      data: paiement as IPaiement,
      message: 'Paiement transmis — en attente de validation comptable',
    });
  } catch (error) {
    console.error('Soumettre paiement payeur error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = {
  api: { bodyParser: false },
};

export default withAuth(handler, [UserRole.USER_PAYEUR]);
