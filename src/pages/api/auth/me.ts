import type { NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/db';
import { User } from '@/models';
import { ApiResponse, IUserResponse, UserRole } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';

function toUserResponse(u: {
  _id: unknown;
  nom: string;
  email: string;
  role: UserRole;
  caisse?: string;
  caisseCompteId?: string;
  telephone?: string;
  actif: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): IUserResponse {
  return {
    _id: String(u._id),
    nom: u.nom,
    email: u.email,
    role: u.role,
    caisse: u.caisse as IUserResponse['caisse'],
    caisseCompteId: u.caisseCompteId,
    telephone: u.telephone,
    actif: u.actif,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function getMe(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  try {
    await connectDB();

    const user = await User.findById(req.user!.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé',
      });
    }

    return res.status(200).json({
      success: true,
      data: toUserResponse(user),
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
    });
  }
}

async function patchMe(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  try {
    await connectDB();

    const user = await User.findById(req.user!.userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé',
      });
    }

    const body = req.body as Record<string, unknown>;
    const nom = body.nom;
    const email = body.email;
    const currentPassword = body.currentPassword;
    const newPassword = body.newPassword;
    const confirmPassword = body.confirmPassword;

    const wantsPassword =
      newPassword !== undefined &&
      newPassword !== null &&
      String(newPassword).length > 0;

    if (wantsPassword) {
      if (!currentPassword || String(currentPassword).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Indiquez votre mot de passe actuel pour en définir un nouveau.',
        });
      }
      const match = await bcrypt.compare(String(currentPassword), user.password);
      if (!match) {
        return res.status(400).json({
          success: false,
          error: 'Mot de passe actuel incorrect.',
        });
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.',
        });
      }
      if (String(newPassword) !== String(confirmPassword ?? '')) {
        return res.status(400).json({
          success: false,
          error: 'La confirmation ne correspond pas au nouveau mot de passe.',
        });
      }
      user.password = String(newPassword);
    }

    if (nom !== undefined) {
      const n = String(nom).trim();
      if (n.length < 1) {
        return res.status(400).json({
          success: false,
          error: 'Le nom ne peut pas être vide.',
        });
      }
      user.nom = n;
    }

    if (email !== undefined) {
      const nextEmail = String(email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Adresse e-mail invalide.',
        });
      }
      const taken = await User.findOne({
        email: nextEmail,
        _id: { $ne: user._id },
      });
      if (taken) {
        return res.status(400).json({
          success: false,
          error: 'Cette adresse e-mail est déjà utilisée.',
        });
      }
      user.email = nextEmail;
    }

    await user.save();

    const fresh = await User.findById(user._id);
    if (!fresh) {
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }

    return res.status(200).json({
      success: true,
      data: toUserResponse(fresh),
      message: 'Profil mis à jour',
    });
  } catch (error) {
    console.error('Patch me error:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
    });
  }
}

async function route(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  switch (req.method) {
    case 'GET':
      return getMe(req, res);
    case 'PATCH':
      return patchMe(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}

export default withAuth(route);
