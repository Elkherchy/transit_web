import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { BonCommande } from '@/models';
import { ApiResponse } from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

/**
 * GET /api/logistique/bons-commande/next-numero
 * Retourne le prochain numéro séquentiel disponible (001, 002, …) pour
 * pré-remplir le formulaire de création.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ numero: string }>>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const docs = await BonCommande.find({ numero: { $exists: true, $ne: null } })
      .select('numero')
      .lean();
    let max = 0;
    for (const d of docs) {
      const n = parseInt(String(d.numero || '').replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    const numero = String(max + 1).padStart(3, '0');
    return res.status(200).json({ success: true, data: { numero } });
  } catch (err) {
    console.error('next-numero error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withLogistique(handler);
