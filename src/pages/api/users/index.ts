import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Caisse, User } from '@/models';
import { ensureDefaultGeneralCaisse } from '@/lib/caisse';
import {
  ADMIN_LOGISTIQUE_CREATABLE_ROLES,
  ADMIN_TRANSIT_CREATABLE_ROLES,
  ApiResponse,
  IUserResponse,
  UserRole,
  CaisseType,
  PaginatedResponse,
} from '@/types';
import { AuthenticatedRequest, withAdmin } from '@/middleware/auth';

/**
 * Liste des rôles que l'utilisateur courant peut créer.
 * - Super-ADMIN  → tous les rôles
 * - ADMIN_TRANSIT → AGENT_TRANSIT, CAISSIER, USER_PAYEUR
 * - ADMIN_LOGISTIQUE → CHAUFFEUR, AGENT_RECEPTION_LOGISTIQUE
 * - Autres → aucun (la route est déjà protégée par withAdmin, mais
 *   on garde une vérification défensive).
 */
function creatableRolesFor(creatorRole: UserRole | undefined): readonly UserRole[] {
  if (creatorRole === UserRole.ADMIN) {
    return Object.values(UserRole);
  }
  if (creatorRole === UserRole.ADMIN_TRANSIT) {
    return ADMIN_TRANSIT_CREATABLE_ROLES;
  }
  if (creatorRole === UserRole.ADMIN_LOGISTIQUE) {
    return ADMIN_LOGISTIQUE_CREATABLE_ROLES;
  }
  return [];
}

async function listUsers(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IUserResponse>>>
) {
  try {
    await connectDB();

    const { page = '1', limit = '20', search, role } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      query.role = role;
    }

    // Scope : un admin scopé ne voit que les rôles de son périmètre + son
    // propre rôle. Le super-ADMIN voit tout.
    const callerRole = req.user?.role;
    if (callerRole !== UserRole.ADMIN) {
      const visibleRoles = [
        ...creatableRolesFor(callerRole),
        callerRole as UserRole,
      ].filter(Boolean);
      query.role = query.role
        ? { $in: visibleRoles.filter((r) => r === query.role) }
        : { $in: visibleRoles };
    }

    if (search && typeof search === 'string' && search.trim()) {
      const s = search.trim();
      query.$or = [
        { nom: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('nom email role caisse caisseCompteId telephone actif createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    const data: IUserResponse[] = users.map((u) => ({
      _id: u._id.toString(),
      nom: u.nom,
      email: u.email,
      role: u.role as UserRole,
      caisse: u.caisse as CaisseType | undefined,
      caisseCompteId: u.caisseCompteId ? String(u.caisseCompteId) : undefined,
      telephone: u.telephone,
      actif: u.actif,
    }));

    return res.status(200).json({
      success: true,
      data: {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createUser(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IUserResponse>>
) {
  try {
    await connectDB();

    const { nom, email, password, role, caisse, telephone, actif } = req.body;

    if (!nom || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Nom, email, mot de passe et rôle sont requis',
      });
    }

    if (!Object.values(UserRole).includes(role)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide' });
    }

    // Vérifie que le créateur a le droit de créer ce rôle (admin scopé).
    const creatableRoles = creatableRolesFor(req.user?.role);
    if (!creatableRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: `Votre rôle ne permet pas de créer un utilisateur avec le rôle "${role}"`,
      });
    }

    if (role === UserRole.COMPTABLE && (!caisse || !Object.values(CaisseType).includes(caisse))) {
      return res.status(400).json({
        success: false,
        error: 'Une caisse (Transit ou Logistique) est requise pour ce rôle',
      });
    }

    // CAISSIER : automatiquement lié à la caisse générale (pas de saisie côté client).
    // `caisseCompteId` du body est ignoré pour ce rôle ; il est résolu côté serveur.
    let caissierCaisseId: string | undefined;
    if (role === UserRole.CAISSIER) {
      // Caissier = transit-side : lie sa caisse à General_Transit.
      const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
      if (!general) {
        return res.status(500).json({
          success: false,
          error: 'Caisse générale introuvable — créez-la d’abord',
        });
      }
      caissierCaisseId = String(general._id);
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
    }

    const payload: Record<string, unknown> = {
      nom: String(nom).trim(),
      email: String(email).toLowerCase().trim(),
      password: String(password),
      role,
      telephone: telephone ? String(telephone).trim() : undefined,
      actif: actif !== false,
    };

    if (role === UserRole.COMPTABLE) {
      payload.caisse = caisse;
    }
    if (role === UserRole.CAISSIER && caissierCaisseId) {
      payload.caisseCompteId = caissierCaisseId;
    }

    const user = await User.create(payload);

    if (role === UserRole.CAISSIER && caissierCaisseId) {
      // Réassigne ce caissier comme propriétaire de la caisse générale
      // (les autres caisses qu'il pouvait gérer sont libérées).
      await Caisse.updateMany(
        { caissierUserId: user._id.toString(), _id: { $ne: caissierCaisseId } },
        { $unset: { caissierUserId: '' } }
      );
      await Caisse.findByIdAndUpdate(caissierCaisseId, {
        $set: { caissierUserId: user._id.toString() },
      });
    }

    const userResponse: IUserResponse = {
      _id: user._id.toString(),
      nom: user.nom,
      email: user.email,
      role: user.role as UserRole,
      caisse: user.caisse as CaisseType | undefined,
      caisseCompteId: user.caisseCompteId ? String(user.caisseCompteId) : undefined,
      telephone: user.telephone,
      actif: user.actif,
    };

    return res.status(201).json({
      success: true,
      data: userResponse,
      message: 'Utilisateur créé',
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAdmin(listUsers)(req, res);
    case 'POST':
      return withAdmin(createUser)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
