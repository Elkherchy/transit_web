import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import { ApiResponse } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import mongoose from 'mongoose';
import { transitDocumentUpload } from '@/lib/transitDocumentMulter';
import { storeTransitDocument } from '@/lib/transitDocumentStorage';

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

    const transit = await Transit.findById(id);
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Transit non trouvé' });
    }

    const stored = await storeTransitDocument(String(id), {
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

    if (!transit.documents) {
      transit.documents = [];
    }
    transit.documents.push(newDoc);
    await transit.save({ validateModifiedOnly: true });

    const savedDoc = transit.documents[transit.documents.length - 1];

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

export default withAuth(handler);
