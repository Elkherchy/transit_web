import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Salarie, User } from '@/models';
import { ApiResponse, ISalarieResponse, UserRole } from '@/types';
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

async function getSalarie(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ISalarieResponse>>) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await Salarie.findById(id).lean();
  if (!doc) return res.status(404).json({ success: false, error: 'Salarie introuvable' });

  const [u, compte] = await Promise.all([
    doc.userId ? User.findById(doc.userId).select('nom email').lean() : Promise.resolve(null),
    doc.banqueCompteId ? Caisse.findById(doc.banqueCompteId).select('nom').lean() : Promise.resolve(null),
  ]);
  return res.status(200).json({
    success: true,
    data: {
      _id: String(doc._id),
      userId: doc.userId,
      nom: doc.nom,
      prenom: doc.prenom,
      poste: doc.poste,
      salaireBrut: Number(doc.salaireBrut || 0),
      banqueCompteId: doc.banqueCompteId,
      rib: doc.rib,
      banque: doc.banque,
      dateEmbauche: doc.dateEmbauche,
      actif: Boolean(doc.actif),
      userNom: u ? String(u.nom || '') : undefined,
      userEmail: u ? String(u.email || '') : undefined,
      banqueCompteNom: compte ? String(compte.nom || '') : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  });
}

async function updateSalarie(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ISalarieResponse>>) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await Salarie.findById(id);
  if (!doc) return res.status(404).json({ success: false, error: 'Salarie introuvable' });

  const { nom, prenom, poste, salaireBrut, rib, banque, banqueCompteId, dateEmbauche, actif, userId } = req.body as {
    nom?: string; prenom?: string; poste?: string; salaireBrut?: number;
    rib?: string; banque?: string; banqueCompteId?: string; dateEmbauche?: string; actif?: boolean; userId?: string;
  };

  if (nom !== undefined) doc.nom = String(nom).trim() || doc.nom;
  if (prenom !== undefined) doc.prenom = String(prenom).trim() || doc.prenom;
  if (poste !== undefined) doc.poste = String(poste).trim() || doc.poste;
  if (salaireBrut !== undefined) {
    const v = Number(salaireBrut);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ success: false, error: 'Salaire brut invalide' });
    doc.salaireBrut = v;
  }
  if (rib !== undefined) doc.rib = String(rib).trim() || undefined;
  if (banque !== undefined) doc.banque = String(banque).trim() || undefined;
  if (banqueCompteId !== undefined) {
    if (banqueCompteId) {
      if (!mongoose.isValidObjectId(banqueCompteId)) {
        return res.status(400).json({ success: false, error: 'Compte banque invalide' });
      }
      const compte = await Caisse.findById(banqueCompteId).select('nom actif kind').lean();
      if (!compte || !compte.actif || String(compte.kind) === 'USER') {
        return res.status(400).json({ success: false, error: 'Compte banque introuvable ou invalide' });
      }
      doc.banqueCompteId = String(compte._id);
      doc.banque = String(compte.nom || '');
    } else {
      doc.banqueCompteId = undefined;
      doc.banque = undefined;
    }
  }
  if (dateEmbauche !== undefined) doc.dateEmbauche = dateEmbauche ? new Date(dateEmbauche) : undefined;
  if (actif !== undefined) doc.actif = Boolean(actif);
  if (userId !== undefined) {
    if (userId) {
      const u = await User.findById(userId).select('_id nom role actif').lean();
      if (!u || !u.actif) return res.status(400).json({ success: false, error: 'Utilisateur introuvable ou inactif' });

      const taken = await Salarie.findOne({ userId, _id: { $ne: doc._id } }).select('_id').lean();
      if (taken) {
        return res.status(400).json({ success: false, error: 'Cet utilisateur est deja lie a un autre salarie' });
      }

      const parsed = splitFullName(String(u.nom || ''));
      doc.nom = parsed.nom;
      doc.prenom = parsed.prenom;
      doc.poste = roleToPoste(u.role as UserRole);
    }
    doc.userId = userId || undefined;
  }

  await doc.save();
  const compteNom = doc.banqueCompteId
    ? await Caisse.findById(doc.banqueCompteId).select('nom').lean()
    : null;
  return res.status(200).json({ success: true, data: { _id: String(doc._id), userId: doc.userId, nom: doc.nom, prenom: doc.prenom, poste: doc.poste, salaireBrut: Number(doc.salaireBrut), banqueCompteId: doc.banqueCompteId, rib: doc.rib, banque: doc.banque, banqueCompteNom: compteNom ? String(compteNom.nom || '') : undefined, dateEmbauche: doc.dateEmbauche, actif: doc.actif, createdAt: doc.createdAt, updatedAt: doc.updatedAt }, message: 'Salarie mis a jour' });
}

async function deleteSalarie(req: AuthenticatedRequest, res: NextApiResponse) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const deleted = await Salarie.findByIdAndDelete(id).lean();
  if (!deleted) return res.status(404).json({ success: false, error: 'Salarie introuvable' });
  return res.status(200).json({ success: true, message: 'Salarie supprime' });
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET': return withComptable(getSalarie)(req, res);
    case 'PUT': return withComptable(updateSalarie)(req, res);
    case 'DELETE': return withComptable(deleteSalarie)(req, res);
    default: return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
