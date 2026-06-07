import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Caisse, User } from '@/models';
import {
  ADMIN_TRANSIT_CREATABLE_ROLES,
  ApiResponse,
  IUserResponse,
  UserRole,
  CaisseType,
} from '@/types';
import { AuthenticatedRequest, withAdmin } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse } from '@/lib/caisse';
import mongoose from 'mongoose';

/** Voir api/users/index.ts pour le détail. */
function manageableRolesFor(creatorRole: UserRole | undefined): readonly UserRole[] {
  if (creatorRole === UserRole.ADMIN) return Object.values(UserRole);
  if (creatorRole === UserRole.ADMIN_TRANSIT) return ADMIN_TRANSIT_CREATABLE_ROLES;
  return [];
}

async function getUser(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const user = await User.findById(id)
      .select('nom email role caisse caisseCompteId telephone actif')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    const data: IUserResponse = {
      _id: user._id.toString(),
      nom: user.nom,
      email: user.email,
      role: user.role as UserRole,
      caisse: user.caisse as CaisseType | undefined,
      caisseCompteId: user.caisseCompteId ? String(user.caisseCompteId) : undefined,
      telephone: user.telephone,
      actif: user.actif,
    };

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateUser(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    // Un admin scopé ne peut éditer/désactiver qu'un utilisateur dont le rôle
    // entre dans son périmètre. Le super-ADMIN garde un accès total.
    const manageable = manageableRolesFor(req.user?.role);
    if (!manageable.includes(user.role as UserRole)) {
      return res.status(403).json({
        success: false,
        error: 'Votre rôle ne permet pas de gérer cet utilisateur',
      });
    }

    const { nom, email, role, caisse, telephone, actif, password } = req.body;

    if (email !== undefined) {
      const nextEmail = String(email).toLowerCase().trim();
      const taken = await User.findOne({
        email: nextEmail,
        _id: { $ne: id },
      });
      if (taken) {
        return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
      }
      user.email = nextEmail;
    }

    if (nom !== undefined) user.nom = String(nom).trim();
    if (telephone !== undefined) user.telephone = telephone ? String(telephone).trim() : undefined;
    if (actif !== undefined) user.actif = Boolean(actif);

    if (role !== undefined) {
      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({ success: false, error: 'Rôle invalide' });
      }
      // Le nouveau rôle doit aussi être dans le périmètre du créateur.
      if (!manageable.includes(role as UserRole)) {
        return res.status(403).json({
          success: false,
          error: `Votre rôle ne permet pas d'attribuer le rôle "${role}"`,
        });
      }
      user.role = role;
    }

    const effectiveRole = user.role as UserRole;
    if (effectiveRole === UserRole.COMPTABLE) {
      if (caisse !== undefined) {
        if (!Object.values(CaisseType).includes(caisse)) {
          return res.status(400).json({ success: false, error: 'Caisse invalide' });
        }
        user.caisse = caisse;
      }
      user.set('caisseCompteId', undefined);
    } else if (effectiveRole === UserRole.CAISSIER) {
      // Auto-link à General_Transit (caissier = transit-side).
      const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
      if (!general) {
        return res.status(500).json({
          success: false,
          error: 'Caisse générale introuvable — créez-la d’abord',
        });
      }
      user.set('caisse', undefined);
      user.caisseCompteId = String(general._id);
    } else {
      user.set('caisseCompteId', undefined);
      user.set('caisse', undefined);
    }

    if (user.role === UserRole.COMPTABLE && !user.caisse) {
      return res.status(400).json({
        success: false,
        error: 'Une caisse est requise pour ce rôle',
      });
    }

    if (password !== undefined && String(password).length > 0) {
      if (String(password).length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Le mot de passe doit contenir au moins 6 caractères',
        });
      }
      user.password = String(password);
    }

    await user.save();

    if (user.role === UserRole.CAISSIER && user.caisseCompteId) {
      await Caisse.updateMany(
        { caissierUserId: String(user._id), _id: { $ne: user.caisseCompteId } },
        { $unset: { caissierUserId: '' } }
      );
      await Caisse.findByIdAndUpdate(user.caisseCompteId, {
        $set: { caissierUserId: String(user._id) },
      });
    } else {
      await Caisse.updateMany(
        { caissierUserId: String(user._id) },
        { $unset: { caissierUserId: '' } }
      );
    }

    const fresh = await User.findById(id)
      .select('nom email role caisse caisseCompteId telephone actif')
      .lean();

    const data: IUserResponse = {
      _id: fresh!._id.toString(),
      nom: fresh!.nom,
      email: fresh!.email,
      role: fresh!.role as UserRole,
      caisse: fresh!.caisse as CaisseType | undefined,
      caisseCompteId: fresh!.caisseCompteId ? String(fresh!.caisseCompteId) : undefined,
      telephone: fresh!.telephone,
      actif: fresh!.actif,
    };

    return res.status(200).json({ success: true, data, message: 'Utilisateur mis à jour' });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function deleteUser(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<null>>
) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (req.user?.userId === id) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas supprimer votre propre compte',
      });
    }

    // Un admin scopé ne peut supprimer qu'un utilisateur de son périmètre.
    const target = await User.findById(id).select('role').lean();
    if (!target) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }
    const manageable = manageableRolesFor(req.user?.role);
    if (!manageable.includes(target.role as UserRole)) {
      return res.status(403).json({
        success: false,
        error: 'Votre rôle ne permet pas de supprimer cet utilisateur',
      });
    }

    await User.findByIdAndDelete(id);

    return res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAdmin(getUser)(req, res);
    case 'PUT':
      return withAdmin(updateUser)(req, res);
    case 'DELETE':
      return withAdmin(deleteUser)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
