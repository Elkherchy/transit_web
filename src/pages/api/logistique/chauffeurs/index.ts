import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { User } from '@/models';
import { ApiResponse, IUserResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

async function listChauffeurs(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse[]>>
) {
  try {
    await connectDB();

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const query: Record<string, unknown> = {
      role: UserRole.CHAUFFEUR,
      actif: true,
    };

    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { telephone: { $regex: search, $options: 'i' } },
      ];
    }

    const chauffeurs = await User.find(query)
      .select('nom email role telephone actif createdAt updatedAt')
      .sort({ nom: 1 })
      .lean();

    const data: IUserResponse[] = chauffeurs.map((row) => ({
      _id: String(row._id),
      nom: row.nom,
      email: row.email,
      role: row.role,
      telephone: row.telephone,
      actif: row.actif,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List chauffeurs error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listChauffeurs)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
