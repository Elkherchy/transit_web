import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { completeManutentionToTransit } from '@/lib/manutention/completeToTransit';
import { ApiResponse } from '@/types';
import { AuthenticatedRequest, withCaissier } from '@/middleware/auth';

interface ConvertToTransitResponse {
  transitId?: string;
}

// POST /api/manutention/convert-to-transit - Convertir une facture manutention en transit
async function convertToTransit(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ConvertToTransitResponse>>
) {
  try {
    await connectDB();

    const { factureManutentionId } = req.body;

    if (!factureManutentionId) {
      return res.status(400).json({
        success: false,
        error: 'ID de la facture manutention requis',
      });
    }

    const result = await completeManutentionToTransit({
      factureManutentionId,
      actorUserId: req.user!.userId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Erreur lors de la conversion',
      });
    }

    return res.status(200).json({
      success: true,
      data: { transitId: result.transitId },
      message: 'Facture manutention convertie en dossier transit avec succès',
    });
  } catch (error) {
    console.error('Convert to transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return withCaissier(convertToTransit)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
