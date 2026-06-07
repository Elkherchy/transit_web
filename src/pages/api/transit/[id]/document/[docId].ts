import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import { ApiResponse } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import mongoose from 'mongoose';
import { transitDocumentUpload } from '@/lib/transitDocumentMulter';
import { removeTransitStoredFile, storeTransitDocument } from '@/lib/transitDocumentStorage';

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

function readJsonBody(req: NextApiRequest): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

async function handler(
  req: AuthenticatedRequest & {
    file?: Express.Multer.File;
  },
  res: NextApiResponse<ApiResponse<unknown>>
) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const docId = Array.isArray(req.query.docId) ? req.query.docId[0] : req.query.docId;

  if (!id || !docId || !mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(docId)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  try {
    await connectDB();

    if (req.method === 'DELETE') {
      const transit = await Transit.findById(id);
      if (!transit) {
        return res.status(404).json({ success: false, error: 'Transit non trouvé' });
      }

      const doc = transit.documents?.find(
        (d: { _id?: mongoose.Types.ObjectId }) => d._id?.toString() === docId
      ) as { key?: string } | undefined;
      const key = doc?.key;
      if (key) {
        await removeTransitStoredFile(key);
      }

      transit.documents = transit.documents?.filter(
        (d: { _id?: mongoose.Types.ObjectId }) => d._id?.toString() !== docId
      );
      await transit.save();

      return res.status(200).json({
        success: true,
        message: 'Document supprimé',
      });
    }

    if (req.method === 'PATCH') {
      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req);
      } catch {
        return res.status(400).json({ success: false, error: 'Corps JSON invalide' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ success: false, error: 'Nom requis' });
      }

      const transit = await Transit.findById(id);
      if (!transit) {
        return res.status(404).json({ success: false, error: 'Transit non trouvé' });
      }

      const sub = transit.documents?.id(docId as string);
      if (!sub) {
        return res.status(404).json({ success: false, error: 'Document non trouvé' });
      }

      sub.set('name', name);
      await transit.save();

      return res.status(200).json({
        success: true,
        data: {
          _id: sub._id,
          key: sub.get('key'),
          name: sub.get('name'),
          size: sub.get('size'),
          uploadedAt: sub.get('uploadedAt'),
        },
        message: 'Document renommé',
      });
    }

    if (req.method === 'PUT') {
      await runMiddleware(req, res, transitDocumentUpload.single('file'));

      if (!req.file?.buffer) {
        return res.status(400).json({ success: false, error: 'Aucun fichier' });
      }

      const transit = await Transit.findById(id);
      if (!transit) {
        return res.status(404).json({ success: false, error: 'Transit non trouvé' });
      }

      const sub = transit.documents?.id(docId as string);
      if (!sub) {
        return res.status(404).json({ success: false, error: 'Document non trouvé' });
      }

      const oldKey = sub.get('key') as string;

      const stored = await storeTransitDocument(String(id), {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
      });

      sub.set('key', stored.key);
      sub.set('name', stored.name);
      sub.set('size', stored.size);
      sub.set('uploadedAt', new Date());
      await transit.save();

      if (oldKey && oldKey !== stored.key) {
        await removeTransitStoredFile(oldKey);
      }

      return res.status(200).json({
        success: true,
        data: {
          _id: sub._id,
          key: sub.get('key'),
          name: sub.get('name'),
          size: sub.get('size'),
          uploadedAt: sub.get('uploadedAt'),
        },
        message: 'Fichier remplacé',
      });
    }

    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  } catch (error) {
    console.error('Document error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withAuth(handler);
