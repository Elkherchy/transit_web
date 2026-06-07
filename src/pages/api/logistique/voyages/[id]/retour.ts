import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import connectDB from '@/lib/db';
import { Voyage, Caisse, Transaction } from '@/models';
import {
  ApiResponse,
  IVoyage,
  VoyageStatus,
  UserRole,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureChauffeurCaisse } from '@/lib/caisse';
import { storeRecuDocument } from '@/lib/transitDocumentStorage';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté — image requise'));
    }
  },
}).single('photo');

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (fn as (r: NextApiRequest, s: NextApiResponse, cb: (r?: unknown) => void) => void)(
      req,
      res,
      (r?: unknown) => {
        if (r instanceof Error) reject(r);
        else resolve();
      }
    );
  });
}

/**
 * POST /api/logistique/voyages/[id]/retour
 *
 * Le chauffeur scanne le retour avec une photo (caméra ou upload). Effets :
 *   - statutVoyage : EN_COURS → RETOURNE
 *   - timestamp scanRetourAt + photo enregistrés
 *   - **+commissionChauffeur** crédité dans la caisse CHAUFFEUR
 *     (idempotent via `voyage-{id}-commission`).
 *
 * Le dossier (FichierLogistique) reste au statut OUVERT après le retour des
 * chauffeurs — c'est désormais l'agent réception logistique qui valide et
 * soumet manuellement le dossier au transit (OUVERT → PRET_VALIDATION).
 *
 * multipart/form-data : `photo` (file image obligatoire)
 * Auth : CHAUFFEUR
 */
async function handler(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse<ApiResponse<{ voyage: IVoyage; nouveauSoldeChauffeur: number }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    await runMiddleware(req, res, upload);

    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: 'Photo de scan retour obligatoire' });
    }

    const voyage = await Voyage.findById(id);
    if (!voyage) {
      return res.status(404).json({ success: false, error: 'Voyage introuvable' });
    }

    const uid = req.user!.userId;
    const isAdmin = req.user!.role === UserRole.ADMIN;
    if (!isAdmin && String(voyage.chauffeurId || '') !== uid) {
      return res.status(403).json({
        success: false,
        error: 'Ce voyage ne vous appartient pas',
      });
    }
    if (voyage.statutVoyage !== VoyageStatus.EN_COURS) {
      return res.status(400).json({
        success: false,
        error: 'Le voyage doit être EN_COURS pour effectuer le retour',
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
      const msg = storeErr instanceof Error ? storeErr.message : 'Échec stockage photo';
      console.error('storeRecuDocument retour:', storeErr);
      return res.status(503).json({ success: false, error: msg });
    }

    const now = new Date();
    voyage.statutVoyage = VoyageStatus.RETOURNE;
    voyage.scanRetourAt = now;
    voyage.scanRetourPhotoUrl = stored.recuUrl;
    voyage.scanRetourPhotoName = req.file.originalname;
    await voyage.save();

    // Crédit commission dans la caisse CHAUFFEUR (idempotent via sourcePaiementId).
    const commission = Number(voyage.commissionChauffeur) || 0;
    let nouveauSolde = 0;
    if (commission > 0) {
      const ref = `voyage-${id}-commission`;
      const dup = await Transaction.findOne({ sourcePaiementId: ref });
      if (!dup) {
        const chauffeurCaisseId = await ensureChauffeurCaisse(
          String(voyage.chauffeurId || uid)
        );
        await Transaction.create({
          caisseId: chauffeurCaisseId,
          type: TransactionType.CREDIT,
          montant: commission,
          description: `Commission voyage (en attente validation) — ${
            voyage.bl || voyage.ntc || String(voyage._id)
          }`,
          date: now,
          reference: String(voyage._id),
          userId: uid,
          sourcePaiementId: ref,
        });
        await Caisse.findByIdAndUpdate(chauffeurCaisseId, {
          $inc: { solde: commission },
        });

        const fresh = await Caisse.findById(chauffeurCaisseId).select('solde').lean();
        nouveauSolde = Number(fresh?.solde) || 0;
      } else {
        const chauffeurCaisseId = await ensureChauffeurCaisse(
          String(voyage.chauffeurId || uid)
        );
        const fresh = await Caisse.findById(chauffeurCaisseId).select('solde').lean();
        nouveauSolde = Number(fresh?.solde) || 0;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        voyage: voyage.toObject() as unknown as IVoyage,
        nouveauSoldeChauffeur: nouveauSolde,
      },
      message: `Retour enregistré — ${commission.toFixed(2)} MRU crédité (en attente)`,
    });
  } catch (error) {
    console.error('POST /api/logistique/voyages/[id]/retour error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = { api: { bodyParser: false } };

export default withAuth(handler, [UserRole.CHAUFFEUR, UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]);
