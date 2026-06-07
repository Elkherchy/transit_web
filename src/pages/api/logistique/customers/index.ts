import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { LogistiqueClient } from '@/models';
import { ApiResponse, ILogistiqueClient } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { UserRole } from '@/types';

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

async function listCustomers(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILogistiqueClient[]>>
) {
  try {
    await connectDB();
    const { search, includeInactive } = req.query;

    const query: Record<string, unknown> = {};
    if (!includeInactive || String(includeInactive) === 'false') {
      query.actif = true;
    }
    if (search && typeof search === 'string' && search.trim()) {
      const s = search.trim();
      query.$or = [
        { nom: { $regex: s, $options: 'i' } },
        { numero: { $regex: s, $options: 'i' } },
        { societe: { $regex: s, $options: 'i' } },
      ];
    }

    const docs = await LogistiqueClient.find(query)
      .sort({ nom: 1 })
      .limit(500)
      .lean();
    return res
      .status(200)
      .json({ success: true, data: docs.map(serialize) });
  } catch (err) {
    console.error('List logistique customers error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createCustomer(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ILogistiqueClient>>
) {
  try {
    await connectDB();
    const { nom, numero, societe } = req.body || {};

    const trimmedNom = String(nom || '').trim();
    if (!trimmedNom) {
      return res.status(400).json({
        success: false,
        error: 'Le nom du client est requis',
      });
    }

    const existing = await LogistiqueClient.findOne({
      nom: trimmedNom,
      actif: true,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Un client avec ce nom existe déjà',
      });
    }

    const doc = await LogistiqueClient.create({
      nom: trimmedNom,
      numero: numero ? String(numero).trim() : null,
      societe: societe ? String(societe).trim() : null,
      actif: true,
      createdBy: req.user?.userId,
    });

    return res
      .status(201)
      .json({ success: true, data: serialize(doc.toObject()), message: 'Client créé' });
  } catch (err) {
    console.error('Create logistique customer error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

const WRITE_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
];

function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return listCustomers(req, res);
    case 'POST':
      if (!req.user?.role || !WRITE_ROLES.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Création réservée aux admins et agents réception logistique',
        });
      }
      return createCustomer(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res
        .status(405)
        .json({ success: false, error: `Méthode ${req.method} non autorisée` });
  }
}

// Lecture : ouverte aux rôles logistique + transit (cohérence cross-domaine).
// Création / suppression : admins + agent réception (filtré dans le handler).
export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_LOGISTIQUE,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_RECEPTION_LOGISTIQUE,
  UserRole.COMPTABLE,
  UserRole.CHAUFFEUR,
]);
