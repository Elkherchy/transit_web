import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { OperationValidation } from '@/models';
import { OperationValidationStatus } from '@/models/OperationValidation';
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
    const { motif } = (req.body || {}) as { motif?: string };
    const op = await OperationValidation.findById(id);
    if (!op) {
      return res
        .status(404)
        .json({ success: false, error: 'Opération introuvable' });
    }
    const pendingStatuses: OperationValidationStatus[] = [
      OperationValidationStatus.EN_ATTENTE_AGENT,
      OperationValidationStatus.EN_ATTENTE_ADMIN,
    ];
    if (!pendingStatuses.includes(op.statut as OperationValidationStatus)) {
      return res.status(400).json({
        success: false,
        error: "Cette opération n'est pas en attente",
      });
    }
    op.statut = OperationValidationStatus.REJETEE;
    op.validatedBy = req.user!.userId;
    op.validatedAt = new Date();
    op.rejectMotif = motif ? String(motif).trim() : null;
    await op.save();
    return res
      .status(200)
      .json({
        success: true,
        data: { id: String(op._id) },
        message: 'Opération rejetée',
      });
  } catch (error) {
    console.error('POST /api/operations-validation/[id]/rejeter:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
]);
