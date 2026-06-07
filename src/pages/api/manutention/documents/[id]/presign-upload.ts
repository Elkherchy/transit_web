import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import path from 'path';
import connectDB from '@/lib/db';
import { FactureManutention } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { getUploadSignedUrl } from '@/lib/s3';

/**
 * POST /api/manutention/documents/[id]/presign-upload
 *
 * Génère une URL S3 présignée (PUT direct) pour uploader un document de
 * manutention SANS passer par la fonction Vercel (qui plafonne à ~4,5 Mo).
 *
 * Body: { fileName: string, contentType: string }
 * Resp: { uploadUrl, key, headers }
 *
 * Le client doit ensuite faire un `fetch(uploadUrl, { method: 'PUT', body: file })`
 * puis appeler `POST /api/manutention/documents/[id]/register` avec la clé
 * retournée pour enregistrer le document en base.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<
    ApiResponse<{ uploadUrl: string; key: string; headers: Record<string, string> }>
  >
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    const facture = await FactureManutention.findById(id).lean();
    if (!facture) {
      return res
        .status(404)
        .json({ success: false, error: 'Facture manutention non trouvée' });
    }

    const { fileName, contentType } = (req.body || {}) as {
      fileName?: string;
      contentType?: string;
    };
    if (!fileName || typeof fileName !== 'string') {
      return res
        .status(400)
        .json({ success: false, error: 'fileName requis' });
    }
    const ext = path.extname(fileName) || '';
    const safeBase = `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const key = `transit/manutention/${id}/${safeBase}`;

    const presigned = await getUploadSignedUrl(
      key,
      contentType || 'application/octet-stream',
      3600
    );

    return res.status(200).json({
      success: true,
      data: {
        uploadUrl: presigned.uploadUrl,
        key: presigned.key,
        headers: presigned.headers,
      },
    });
  } catch (error) {
    console.error('presign-upload error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
  UserRole.COMPTABLE,
]);
