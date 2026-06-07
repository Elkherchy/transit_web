import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FactureManutention, Transit } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { removeTransitStoredFiles } from '@/lib/transitDocumentStorage';

/**
 * POST /api/manutention/documents/[id]/delete-doc
 *
 * Body : { key: string }
 *
 * Supprime un document précis d'une manutention :
 *  - Retire du tableau `facture.documents`
 *  - Supprime l'objet S3
 *  - Retire aussi du transit lié pour rester cohérent
 *
 * Accessible aux mêmes rôles que l'upload (ADMIN, ADMIN_TRANSIT,
 * ADMIN_LOGISTIQUE, AGENT_TRANSIT, CAISSIER, COMPTABLE).
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ id: string; removed: number }>>
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
    const { key } = (req.body || {}) as { key?: string };
    if (!key || typeof key !== 'string' || key.includes('..')) {
      return res.status(400).json({ success: false, error: 'Clé invalide' });
    }

    const facture = await FactureManutention.findById(id);
    if (!facture) {
      return res
        .status(404)
        .json({ success: false, error: 'Facture introuvable' });
    }

    const before = (facture.documents || []).length;
    facture.documents = (facture.documents || []).filter(
      (d: unknown) => (d as { key?: string }).key !== key
    );
    const removed = before - (facture.documents || []).length;
    if (removed === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'Document non trouvé sur la facture' });
    }
    await facture.save();

    // Supprime l'objet S3.
    try {
      await removeTransitStoredFiles([key]);
    } catch (s3Err) {
      console.error('S3 delete document:', s3Err);
    }

    // Propage au transit lié.
    if (facture.transitId) {
      try {
        await Transit.findByIdAndUpdate(facture.transitId, {
          $pull: { documents: { key } },
        });
      } catch (syncErr) {
        console.error('Propagation suppression doc → transit:', syncErr);
      }
    }

    return res.status(200).json({
      success: true,
      data: { id, removed },
      message: 'Document supprimé',
    });
  } catch (error) {
    console.error('POST /api/manutention/documents/[id]/delete-doc:', error);
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
