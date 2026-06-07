import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { FactureManutention, Transit } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import mongoose from 'mongoose';
import { transitDocumentUpload } from '@/lib/transitDocumentMulter';
import { storeTransitDocument } from '@/lib/transitDocumentStorage';

/**
 * Liste des rôles autorisés à uploader un document de manutention :
 * - ADMIN, ADMIN_TRANSIT : admins transit (création directe)
 * - AGENT_TRANSIT        : crée des manutentions EN_ATTENTE_VALIDATION
 * - CAISSIER             : peut ajouter un justificatif a posteriori
 * - COMPTABLE            : vérification comptable
 */
const ALLOWED_UPLOAD_ROLES = [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
  UserRole.COMPTABLE,
];

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (fn as (r: NextApiRequest, s: NextApiResponse, cb: (e?: unknown) => void) => void)(
      req,
      res,
      (result: unknown) => {
        if (result instanceof Error) return reject(result);
        resolve();
      }
    );
  });
}

async function handler(
  req: AuthenticatedRequest & {
    file?: Express.Multer.File;
  },
  res: NextApiResponse<ApiResponse<unknown>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  try {
    await connectDB();
    await runMiddleware(req, res, transitDocumentUpload.single('file'));

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: 'Aucun fichier uploadé' });
    }

    const facture = await FactureManutention.findById(id);
    if (!facture) {
      return res.status(404).json({ success: false, error: 'Facture manutention non trouvée' });
    }

    // Stocker avec préfixe manutention pour isolation
    const stored = await storeTransitDocument(`manutention/${id}`, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
    });

    const newDoc = {
      key: stored.key,
      name: stored.name,
      size: stored.size,
      uploadedAt: new Date(),
    };

    if (!facture.documents) {
      facture.documents = [];
    }
    facture.documents.push(newDoc);
    await facture.save();

    const savedDoc = facture.documents[facture.documents.length - 1];

    // Propage le document au dossier transit lié (pour qu'il soit visible
    // dans /dashboard/transit/details). Best-effort : ne bloque pas la
    // réponse en cas d'échec.
    if (facture.transitId) {
      try {
        await Transit.findByIdAndUpdate(facture.transitId, {
          $push: {
            documents: {
              key: stored.key,
              name: stored.name,
              size: stored.size,
              uploadedAt: new Date(),
            },
          },
        });
      } catch (syncErr) {
        console.error('Propagation document vers transit:', syncErr);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: savedDoc._id,
        key: savedDoc.key,
        name: savedDoc.name,
        size: savedDoc.size,
        uploadedAt: savedDoc.uploadedAt,
      },
      message: 'Document uploadé avec succès',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withAuth(handler, ALLOWED_UPLOAD_ROLES);
