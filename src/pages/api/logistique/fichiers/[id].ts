import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FichierLogistique, Voyage, User } from '@/models';
import {
  ApiResponse,
  IFichierLogistique,
  IVoyage,
  IUserResponse,
  UserRole,
  VoyageStatus,
  FichierLogistiqueStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface FichierDetail {
  fichier: IFichierLogistique;
  voyages: IVoyage[];
  chauffeurs: Record<string, IUserResponse>;
  createur?: IUserResponse;
}

interface VoyageInput {
  _id?: string;
  date?: string;
  client?: string;
  clientSource?: string;
  bl?: string;
  ntc?: string;
  telephone?: string;
  societe?: string;
  tp?: string;
  magasinage?: string | null;
  surestaries?: string | null;
  note?: string;
  prixTransport?: number;
  commissionChauffeur?: number;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Vérifie qu'aucun voyage du fichier n'est encore engagé par un chauffeur
 * (statut autre que CREE) — bloque modif/suppression du dossier.
 */
async function hasEngagedVoyages(fichierId: string): Promise<boolean> {
  const count = await Voyage.countDocuments({
    fichierLogistiqueId: fichierId,
    $or: [
      { chauffeurId: { $ne: null } },
      { statutVoyage: { $ne: VoyageStatus.CREE } },
    ],
  });
  return count > 0;
}

/**
 * GET /api/logistique/fichiers/[id]
 * Détail d'un fichier logistique : fichier + voyages + map chauffeurs.
 */
async function getFichier(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<FichierDetail>>
) {
  await connectDB();
  const id = String(req.query.id);
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const fichier = await FichierLogistique.findById(id).lean();
  if (!fichier) {
    return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  }

  // Tant que l'agent réception n'a pas validé/soumis le dossier (statut OUVERT),
  // celui-ci doit rester invisible côté Transit / Comptable.
  const role = req.user!.role;
  if (
    (role === UserRole.AGENT_TRANSIT || role === UserRole.COMPTABLE) &&
    (fichier as { statut?: FichierLogistiqueStatus }).statut ===
      FichierLogistiqueStatus.OUVERT
  ) {
    return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  }

  const voyages = await Voyage.find({ fichierLogistiqueId: id })
    .sort({ createdAt: 1 })
    .lean();

  const chauffeurIds = new Set<string>();
  for (const v of voyages as { chauffeurId?: unknown }[]) {
    if (v.chauffeurId) chauffeurIds.add(String(v.chauffeurId));
  }
  const users = await User.find({ _id: { $in: Array.from(chauffeurIds) } })
    .select('_id nom email role')
    .lean();
  const chauffeurs: Record<string, IUserResponse> = {};
  for (const u of users) chauffeurs[String(u._id)] = u as unknown as IUserResponse;

  let createur: IUserResponse | undefined;
  const createdBy = (fichier as { createdBy?: unknown }).createdBy;
  if (createdBy) {
    const c = await User.findById(createdBy).select('_id nom email role').lean();
    if (c) createur = c as unknown as IUserResponse;
  }

  return res.status(200).json({
    success: true,
    data: {
      fichier: fichier as unknown as IFichierLogistique,
      voyages: voyages as unknown as IVoyage[],
      chauffeurs,
      createur,
    },
  });
}

/**
 * PUT /api/logistique/fichiers/[id]
 * Modification d'un dossier logistique : date, note + voyages (replace).
 * Refuse si un voyage est déjà réservé/engagé (chauffeurId != null
 * ou statutVoyage != CREE).
 */
async function updateFichier(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ fichierId: string; nbVoyages: number }>>
) {
  await connectDB();
  const id = String(req.query.id);
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const fichier = await FichierLogistique.findById(id);
  if (!fichier) {
    return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  }

  if (fichier.statut === FichierLogistiqueStatus.VALIDE) {
    return res.status(400).json({
      success: false,
      error: 'Dossier validé — modification impossible',
    });
  }

  if (await hasEngagedVoyages(id)) {
    return res.status(400).json({
      success: false,
      error: 'Au moins un voyage est déjà réservé par un chauffeur — modification impossible',
    });
  }

  const { date, note, voyages } = req.body || {};
  if (!Array.isArray(voyages) || voyages.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Au moins un voyage est requis',
    });
  }

  for (let i = 0; i < voyages.length; i++) {
    const v = voyages[i] as VoyageInput;
    const hasInfo = Boolean(v.client?.trim() || v.bl?.trim() || v.ntc?.trim());
    if (!hasInfo) {
      return res.status(400).json({
        success: false,
        error: `Voyage #${i + 1} : client / BL / NTC requis`,
      });
    }
  }

  if (date) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ success: false, error: 'Date invalide' });
    }
    fichier.date = d;
  }
  fichier.note = note ? String(note).trim() : '';
  await fichier.save();

  // Replace strategy : on supprime tous les voyages CREE puis on les recrée.
  // (la garde au-dessus assure qu'aucun voyage n'est engagé).
  await Voyage.deleteMany({ fichierLogistiqueId: id });

  const docs = (voyages as VoyageInput[]).map((v) => ({
    fichierLogistiqueId: id,
    date: v.date ? new Date(v.date) : fichier.date,
    clientSource: v.client
      ? String(v.client).trim()
      : v.clientSource
        ? String(v.clientSource).trim()
        : undefined,
    bl: v.bl ? String(v.bl).trim().toUpperCase() : undefined,
    ntc: v.ntc ? String(v.ntc).trim().toUpperCase() : undefined,
    telephone: v.telephone ? String(v.telephone).trim() : undefined,
    societe: v.societe ? String(v.societe).trim() : undefined,
    tp: v.tp ? String(v.tp).trim() : undefined,
    magasinage: parseOptionalDate(v.magasinage),
    surestaries: parseOptionalDate(v.surestaries),
    note: v.note ? String(v.note).trim() : undefined,
    prixTransport: Number.isFinite(Number(v.prixTransport))
      ? Math.max(0, Number(v.prixTransport))
      : 6000,
    commissionChauffeur: Number.isFinite(Number(v.commissionChauffeur))
      ? Math.max(0, Number(v.commissionChauffeur))
      : 300,
    statutVoyage: VoyageStatus.CREE,
  }));

  await Voyage.insertMany(docs);

  return res.status(200).json({
    success: true,
    data: { fichierId: id, nbVoyages: docs.length },
    message: `Dossier mis à jour — ${docs.length} voyage(s)`,
  });
}

/**
 * DELETE /api/logistique/fichiers/[id]
 * Supprime un dossier + ses voyages — uniquement si AUCUN voyage n'est encore
 * réservé par un chauffeur. Refuse aussi les dossiers déjà validés.
 */
async function deleteFichier(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ fichierId: string }>>
) {
  await connectDB();
  const id = String(req.query.id);
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const fichier = await FichierLogistique.findById(id);
  if (!fichier) {
    return res.status(404).json({ success: false, error: 'Fichier introuvable' });
  }

  if (fichier.statut === FichierLogistiqueStatus.VALIDE) {
    return res.status(400).json({
      success: false,
      error: 'Dossier validé — suppression impossible',
    });
  }

  if (await hasEngagedVoyages(id)) {
    return res.status(400).json({
      success: false,
      error: 'Au moins un voyage est déjà réservé par un chauffeur — suppression impossible',
    });
  }

  await Voyage.deleteMany({ fichierLogistiqueId: id });
  await FichierLogistique.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    data: { fichierId: id },
    message: 'Dossier supprimé',
  });
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getFichier, [
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_RECEPTION_LOGISTIQUE,
        UserRole.AGENT_TRANSIT,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'PUT':
      return withAuth(updateFichier, [
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_RECEPTION_LOGISTIQUE,
      ])(req, res);
    case 'DELETE':
      return withAuth(deleteFichier, [
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_RECEPTION_LOGISTIQUE,
      ])(req, res);
    default:
      return res
        .status(405)
        .json({ success: false, error: 'Méthode non autorisée' });
  }
}
