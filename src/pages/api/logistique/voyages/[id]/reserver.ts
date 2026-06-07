import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import connectDB from '@/lib/db';
import { Voyage } from '@/models';
import { ApiResponse, VoyageStatus, UserRole, IVoyage } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureVehiculeCaisse } from '@/lib/caisse';
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
 * POST /api/logistique/voyages/[id]/reserver
 *
 * Le chauffeur connecté **réserve** un voyage CREE :
 *   - matricule (form field)
 *   - photo (file) — preuve de scan départ (caméra ou upload)
 *   - le voyage passe à EN_COURS (scan départ implicite, timestamp posé)
 *
 * Une caisse VEHICULE est créée pour ce matricule si elle n'existe pas encore.
 *
 * multipart/form-data : `matricule` (text), `photo` (file image obligatoire)
 * Auth : CHAUFFEUR
 */
async function handler(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse<ApiResponse<{ voyage: IVoyage }>>
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

    const { matricule } = req.body || {};
    const matNorm = String(matricule || '').trim().toUpperCase();
    if (!matNorm) {
      return res.status(400).json({ success: false, error: 'Matricule requis' });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: 'Photo de scan départ obligatoire' });
    }

    // Vérification rapide pour éviter d'uploader la photo si déjà pris.
    const preCheck = await Voyage.findById(id).select('statutVoyage').lean();
    if (!preCheck) {
      return res.status(404).json({ success: false, error: 'Voyage introuvable' });
    }
    if (preCheck.statutVoyage !== VoyageStatus.CREE) {
      return res.status(409).json({
        success: false,
        error: 'Ce voyage vient d’être réservé par un autre chauffeur',
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
      console.error('storeRecuDocument depart:', storeErr);
      return res.status(503).json({ success: false, error: msg });
    }

    // Réservation **atomique** : seule la première transition CREE → EN_COURS
    // gagne. Si un autre chauffeur a déjà réservé entre-temps, l'opération
    // échoue et on annule (pas d'effet de bord).
    const voyage = await Voyage.findOneAndUpdate(
      { _id: id, statutVoyage: VoyageStatus.CREE },
      {
        $set: {
          statutVoyage: VoyageStatus.EN_COURS,
          chauffeurId: req.user!.userId,
          matricule: matNorm,
          scanDepartAt: new Date(),
          scanDepartPhotoUrl: stored.recuUrl,
          scanDepartPhotoName: req.file.originalname,
        },
      },
      { new: true }
    );

    if (!voyage) {
      return res.status(409).json({
        success: false,
        error: 'Ce voyage vient d’être réservé par un autre chauffeur',
      });
    }

    try {
      await ensureVehiculeCaisse(matNorm);
    } catch (caisseErr) {
      console.error('ensureVehiculeCaisse error:', caisseErr);
    }

    return res.status(200).json({
      success: true,
      data: { voyage: voyage.toObject() as unknown as IVoyage },
      message: 'Voyage réservé — départ scanné',
    });
  } catch (error) {
    console.error('POST /api/logistique/voyages/[id]/reserver error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = { api: { bodyParser: false } };

export default withAuth(handler, [UserRole.CHAUFFEUR, UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE]);
