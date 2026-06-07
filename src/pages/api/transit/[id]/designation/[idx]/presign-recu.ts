import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import path from 'path';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { getUploadSignedUrl } from '@/lib/s3';

/**
 * POST /api/transit/[id]/designation/[idx]/presign-recu
 *
 * Body : { fileName: string, contentType?: string }
 * Resp : { uploadUrl, key, headers }
 *
 * Génère une URL S3 présignée pour qu'un payeur uploade UN reçu directement
 * dans le bucket sans passer par la fonction Vercel (limite 4,5 Mo).
 * Plusieurs appels = plusieurs reçus pour la même désignation.
 *
 * Le payeur appelle ensuite POST .../payer avec la liste des clés via JSON.
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
    const transitId = String(req.query.id || '');
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit invalide' });
    }
    const transit = await Transit.findById(transitId).select('_id').lean();
    if (!transit) {
      return res
        .status(404)
        .json({ success: false, error: 'Transit introuvable' });
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
    const safeBase = `recu-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const key = `recus_snts/${safeBase}`;

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
    console.error('presign-recu error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.USER_PAYEUR, UserRole.ADMIN]);
