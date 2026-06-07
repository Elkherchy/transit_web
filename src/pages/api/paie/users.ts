import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { User } from '@/models';
import { ApiResponse, IUserResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withComptable } from '@/middleware/auth';

async function listPaieUsers(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse[]>>
) {
  try {
    await connectDB();

    const onlyActive = req.query.actif !== 'false';
    const query: Record<string, unknown> = {
      role: {
        $in: [
          UserRole.ADMIN,
          UserRole.AGENT_TRANSIT,
          UserRole.COMPTABLE,
          UserRole.CAISSIER,
        ],
      },
    };

    if (onlyActive) query.actif = true;

    const docs = await User.find(query)
      .select('nom email role caisse caisseCompteId telephone actif createdAt updatedAt')
      .sort({ nom: 1 })
      .lean();

    const data: IUserResponse[] = docs.map((u) => ({
      _id: String(u._id),
      nom: String(u.nom || ''),
      email: String(u.email || ''),
      role: u.role as UserRole,
      caisse: u.caisse,
      caisseCompteId: u.caisseCompteId ? String(u.caisseCompteId) : undefined,
      telephone: u.telephone,
      actif: Boolean(u.actif),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List paie users error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withComptable(listPaieUsers)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
