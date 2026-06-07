import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { DepenseCategorie } from '@/models';
import { DepenseCategorieStatus } from '@/models/DepenseCategorie';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ id: string }>>
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
    const cat = await DepenseCategorie.findById(id);
    if (!cat) {
      return res
        .status(404)
        .json({ success: false, error: 'Catégorie introuvable' });
    }
    if (cat.statut !== DepenseCategorieStatus.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        error: 'Seules les catégories en attente peuvent être rejetées',
      });
    }
    await DepenseCategorie.findByIdAndDelete(cat._id);
    return res.status(200).json({
      success: true,
      data: { id },
      message: 'Catégorie rejetée et supprimée',
    });
  } catch (error) {
    console.error('POST /api/depenses/categories/[id]/rejeter error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
