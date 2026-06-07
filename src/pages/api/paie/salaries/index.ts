import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Salarie, User } from '@/models';
import { ApiResponse, ISalarieResponse, PaginatedResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withComptable } from '@/middleware/auth';

function roleToPoste(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return 'Administrateur';
    case UserRole.AGENT_TRANSIT:
      return 'Agent transit';
    case UserRole.COMPTABLE:
      return 'Comptable';
    case UserRole.CAISSIER:
      return 'Caissier';
    case UserRole.CHAUFFEUR:
      return 'Chauffeur';
    case UserRole.USER_PAYEUR:
      return 'Payeur';
    default:
      return 'Employe';
  }
}

function splitFullName(fullName: string): { prenom: string; nom: string } {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return { prenom: 'N/A', nom: 'N/A' };
  const parts = normalized.split(' ');
  if (parts.length === 1) return { prenom: parts[0], nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

async function listSalaries(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<ISalarieResponse>>>
) {
  try {
    await connectDB();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
        { poste: { $regex: search, $options: 'i' } },
      ];
    }
    if (req.query.actif !== undefined) {
      query.actif = req.query.actif !== 'false';
    }

    const [docs, total] = await Promise.all([
      Salarie.find(query).sort({ nom: 1 }).skip(skip).limit(limit).lean(),
      Salarie.countDocuments(query),
    ]);

    const userIds = docs.map((d) => d.userId).filter(Boolean) as string[];
    const compteIds = docs.map((d) => d.banqueCompteId).filter(Boolean) as string[];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('nom email').lean()
      : [];
    const comptes = compteIds.length
      ? await Caisse.find({ _id: { $in: compteIds } }).select('nom').lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const compteMap = new Map(comptes.map((c) => [String(c._id), String(c.nom || '')]));

    const data: ISalarieResponse[] = docs.map((d) => {
      const u = d.userId ? userMap.get(d.userId) : undefined;
      return {
        _id: String(d._id),
        userId: d.userId,
        nom: d.nom,
        prenom: d.prenom,
        poste: d.poste,
        salaireBrut: Number(d.salaireBrut || 0),
        banqueCompteId: d.banqueCompteId,
        rib: d.rib,
        banque: d.banque,
        dateEmbauche: d.dateEmbauche,
        actif: Boolean(d.actif),
        userNom: u ? String(u.nom || '') : undefined,
        userEmail: u ? String(u.email || '') : undefined,
        banqueCompteNom: d.banqueCompteId
          ? compteMap.get(String(d.banqueCompteId))
          : undefined,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('List salaries error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createSalarie(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ISalarieResponse>>
) {
  try {
    await connectDB();
    const { userId, nom, prenom, poste, salaireBrut, rib, banque, banqueCompteId, dateEmbauche } = req.body as {
      userId?: string;
      nom?: string;
      prenom?: string;
      poste?: string;
      salaireBrut?: number;
      rib?: string;
      banque?: string;
      banqueCompteId?: string;
      dateEmbauche?: string;
    };

    const nNom = String(nom || '').trim();
    const nPrenom = String(prenom || '').trim();
    const nPoste = String(poste || '').trim();

    const montant = Number(salaireBrut || 0);
    if (!Number.isFinite(montant) || montant < 0) {
      return res.status(400).json({ success: false, error: 'Salaire brut invalide' });
    }

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ success: false, error: 'Utilisateur requis' });
    }

    let linkedUserNom: string | undefined;
    let linkedUserEmail: string | undefined;
    let linkedUserRole: UserRole | undefined;
    const u = await User.findById(userId).select('nom email role actif').lean();
    if (!u || !u.actif) {
      return res.status(400).json({ success: false, error: 'Utilisateur introuvable ou inactif' });
    }

    const existingForUser = await Salarie.findOne({ userId }).select('_id').lean();
    if (existingForUser) {
      return res.status(400).json({ success: false, error: 'Cet utilisateur est deja lie a un salarie' });
    }

    linkedUserNom = String(u.nom || '');
    linkedUserEmail = String(u.email || '');
    linkedUserRole = u.role as UserRole;

    const derived = splitFullName(linkedUserNom);
    const finalNom = nNom || derived.nom;
    const finalPrenom = nPrenom || derived.prenom;
    const finalPoste = nPoste || roleToPoste(linkedUserRole);

    if (!finalNom || !finalPrenom || !finalPoste) {
      return res.status(400).json({ success: false, error: 'Donnees salarie invalides' });
    }

    let resolvedCompteId: string | undefined;
    let resolvedBanqueNom: string | undefined;
    if (banqueCompteId) {
      if (!mongoose.isValidObjectId(banqueCompteId)) {
        return res.status(400).json({ success: false, error: 'Compte banque invalide' });
      }
      const compte = await Caisse.findById(banqueCompteId)
        .select('nom actif kind')
        .lean();
      if (!compte || !compte.actif || String(compte.kind) === 'USER') {
        return res.status(400).json({ success: false, error: 'Compte banque introuvable ou invalide' });
      }
      resolvedCompteId = String(compte._id);
      resolvedBanqueNom = String(compte.nom || '');
    }

    const doc = await Salarie.create({
      userId,
      nom: finalNom,
      prenom: finalPrenom,
      poste: finalPoste,
      salaireBrut: montant,
      banqueCompteId: resolvedCompteId,
      rib: String(rib || '').trim() || undefined,
      banque: resolvedBanqueNom || String(banque || '').trim() || undefined,
      dateEmbauche: dateEmbauche ? new Date(dateEmbauche) : undefined,
      actif: true,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: String(doc._id),
        userId: doc.userId,
        nom: doc.nom,
        prenom: doc.prenom,
        poste: doc.poste,
        salaireBrut: Number(doc.salaireBrut),
        banqueCompteId: doc.banqueCompteId,
        rib: doc.rib,
        banque: doc.banque,
        dateEmbauche: doc.dateEmbauche,
        actif: doc.actif,
        userNom: linkedUserNom,
        userEmail: linkedUserEmail,
        banqueCompteNom: resolvedBanqueNom,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      message: 'Salarie cree',
    });
  } catch (err) {
    console.error('Create salarie error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET': return withComptable(listSalaries)(req, res);
    case 'POST': return withComptable(createSalarie)(req, res);
    default: return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
