import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { User } from '@/models';
import { ApiResponse, IUserResponse, UserRole } from '@/types';
import { withAdmin, AuthenticatedRequest } from '@/middleware/auth';

const ALLOWED_ROLES = new Set<string>(Object.values(UserRole));

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    const { nom, email, password, telephone, role } = req.body ?? {};

    if (!nom || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nom, email et mot de passe requis',
      });
    }

    if (typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit faire au moins 12 caractères',
      });
    }

    const requestedRole = typeof role === 'string' && ALLOWED_ROLES.has(role)
      ? (role as UserRole)
      : UserRole.USER_PAYEUR;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet email est déjà utilisé',
      });
    }

    const user = await User.create({
      nom,
      email,
      password,
      role: requestedRole,
      telephone,
      actif: true,
    });

    const userResponse: IUserResponse = {
      _id: user._id.toString(),
      nom: user.nom,
      email: user.email,
      role: user.role as UserRole,
      telephone: user.telephone,
      actif: user.actif,
    };

    return res.status(201).json({
      success: true,
      data: userResponse,
      message: 'Compte créé',
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
    });
  }
}

export default withAdmin(handler);
