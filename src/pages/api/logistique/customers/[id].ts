import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { LogistiqueClient } from '@/models';
import { ApiResponse, ILogistiqueClient, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

const WRITE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
];

function serialize(doc: Record<string, unknown>): ILogistiqueClient {
  return {
    _id: String(doc._id),
    nom: String(doc.nom || ''),
    numero: doc.numero ? String(doc.numero) : undefined,
    societe: doc.societe ? String(doc.societe) : undefined,
    actif: Boolean(doc.actif),
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
    createdAt: new Date(String(doc.createdAt)),
    updatedAt: new Date(String(doc.updatedAt)),
  };
}

async function getOne(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILogistiqueClient>>
) {
  const { id } = req.query;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }
  await connectDB();
  const doc = await LogistiqueClient.findById(id).lean();
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Client introuvable' });
  }
  return res.status(200).json({ success: true, data: serialize(doc) });
}

async function update(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILogistiqueClient>>
) {
  const { id } = req.query;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }
  await connectDB();
  const doc = await LogistiqueClient.findById(id);
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Client introuvable' });
  }

  const { nom, numero, societe, actif } = req.body || {};

  if (nom !== undefined) doc.nom = String(nom).trim();
  if (numero !== undefined) doc.numero = numero ? String(numero).trim() : null;
  if (societe !== undefined) doc.societe = societe ? String(societe).trim() : null;
  if (actif !== undefined) doc.actif = Boolean(actif);

  await doc.save();
  return res.status(200).json({ success: true, data: serialize(doc.toObject()) });
}

async function remove(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<null>>
) {
  const { id } = req.query;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }
  await connectDB();
  // Soft-delete : on désactive plutôt que de supprimer (préserve l'historique
  // des voyages qui référencent ce client).
  const doc = await LogistiqueClient.findByIdAndUpdate(
    id,
    { $set: { actif: false } },
    { new: true }
  );
  if (!doc) {
    return res.status(404).json({ success: false, error: 'Client introuvable' });
  }
  return res
    .status(200)
    .json({ success: true, data: null, message: 'Client désactivé' });
}

function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method === 'GET') return getOne(req, res);
  if (!req.user?.role || !WRITE_ROLES.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Modification réservée aux admins et agents réception logistique',
    });
  }
  if (req.method === 'PATCH' || req.method === 'PUT') return update(req, res);
  if (req.method === 'DELETE') return remove(req, res);
  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res
    .status(405)
    .json({ success: false, error: `Méthode ${req.method} non autorisée` });
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
  UserRole.COMPTABLE,
  UserRole.CHAUFFEUR,
]);
