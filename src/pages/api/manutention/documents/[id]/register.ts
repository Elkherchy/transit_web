import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FactureManutention, Transit } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * POST /api/manutention/documents/[id]/register
 *
 * Enregistre en base un document déjà uploadé sur S3 (via presign-upload).
 * Évite la limite Vercel 4,5 Mo : le fichier ne transite jamais par la fonction.
 *
 * Body : { key, name, size }
 *   - key  : clé S3 retournée par presign-upload
 *   - name : nom d'origine (pour affichage)
 *   - size : taille en octets
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<unknown>>
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
    const { key, name, size } = (req.body || {}) as {
      key?: string;
      name?: string;
      size?: number;
    };
    if (!key || typeof key !== 'string' || key.includes('..')) {
      return res.status(400).json({ success: false, error: 'Clé invalide' });
    }
    // Sécurité : la clé doit être dans le dossier de cette manutention.
    const expectedPrefix = `transit/manutention/${id}/`;
    if (!key.startsWith(expectedPrefix)) {
      return res
        .status(400)
        .json({ success: false, error: 'Clé hors du dossier autorisé' });
    }

    const facture = await FactureManutention.findById(id);
    if (!facture) {
      return res
        .status(404)
        .json({ success: false, error: 'Facture manutention non trouvée' });
    }

    const newDoc = {
      key,
      name: name && typeof name === 'string' ? name : key.split('/').pop() || key,
      size: Number(size) || 0,
      uploadedAt: new Date(),
    };

    if (!facture.documents) facture.documents = [];
    facture.documents.push(newDoc);
    await facture.save();

    const savedDoc = facture.documents[facture.documents.length - 1];

    // Propage au dossier transit lié (best-effort).
    if (facture.transitId) {
      try {
        await Transit.findByIdAndUpdate(facture.transitId, {
          $push: {
            documents: {
              key,
              name: newDoc.name,
              size: newDoc.size,
              uploadedAt: newDoc.uploadedAt,
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
      message: 'Document enregistré',
    });
  } catch (error) {
    console.error('register document error:', error);
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
