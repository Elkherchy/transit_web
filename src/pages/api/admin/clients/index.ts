import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Client } from '@/models';
import { ClientStatus } from '@/models/Client';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse } from '@/lib/caisse';

export interface IClientResponse {
  _id: string;
  nom: string;
  telephone?: string;
  email?: string;
  caisseId?: string;
  actif: boolean;
  statut?: ClientStatus;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function serialize(c: {
  _id: unknown;
  nom: string;
  telephone?: unknown;
  email?: unknown;
  caisseId?: unknown;
  actif?: boolean;
  statut?: ClientStatus;
  createdBy?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}): IClientResponse {
  return {
    _id: String(c._id),
    nom: c.nom,
    telephone: c.telephone ? String(c.telephone) : undefined,
    email: c.email ? String(c.email) : undefined,
    caisseId: c.caisseId ? String(c.caisseId) : undefined,
    actif: c.actif !== false,
    statut: c.statut || ClientStatus.VALIDE,
    createdBy: c.createdBy ? String(c.createdBy) : undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function getClients(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IClientResponse[]>>
) {
  try {
    await connectDB();
    const { q, statut } = req.query;
    const filter: Record<string, unknown> = { actif: true };
    if (typeof q === 'string' && q.trim()) {
      const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { nom: { $regex: safe, $options: 'i' } },
        { telephone: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
      ];
    }

    // Filtrage par statut (paramètre explicite).
    if (
      typeof statut === 'string' &&
      Object.values(ClientStatus).includes(statut as ClientStatus)
    ) {
      filter.statut = statut;
    } else {
      // Par défaut, on ne montre PAS les EN_ATTENTE sauf pour ADMIN/ADMIN_TRANSIT
      // qui doivent pouvoir les valider, et pour le créateur AGENT_TRANSIT qui
      // doit voir ses propres demandes en attente.
      const role = req.user!.role;
      if (
        role !== UserRole.ADMIN &&
        role !== UserRole.ADMIN_TRANSIT
      ) {
        if (role === UserRole.AGENT_TRANSIT) {
          filter.$or = [
            { statut: { $ne: ClientStatus.EN_ATTENTE } },
            { statut: ClientStatus.EN_ATTENTE, createdBy: req.user!.userId },
          ];
        } else {
          filter.statut = { $ne: ClientStatus.EN_ATTENTE };
        }
      }
    }

    const rows = await Client.find(filter).sort({ nom: 1 }).limit(200).lean();
    return res.status(200).json({
      success: true,
      data: rows.map((r) => serialize(r as unknown as Parameters<typeof serialize>[0])),
    });
  } catch (error) {
    console.error('GET /api/admin/clients error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createClient(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IClientResponse>>
) {
  try {
    await connectDB();
    const { nom, telephone, email } = req.body || {};
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Le nom du client est requis',
      });
    }
    // AGENT_TRANSIT : client créé EN_ATTENTE, sans caisse, jusqu'à validation
    // admin transit. ADMIN/ADMIN_TRANSIT : création directe avec caisse.
    const isAgent = req.user!.role === UserRole.AGENT_TRANSIT;
    const doc = await Client.create({
      nom: String(nom).trim(),
      telephone: telephone ? String(telephone).trim() : null,
      email: email ? String(email).trim().toLowerCase() : null,
      actif: true,
      statut: isAgent ? ClientStatus.EN_ATTENTE : ClientStatus.VALIDE,
      createdBy: req.user!.userId,
      valideBy: isAgent ? null : req.user!.userId,
      valideAt: isAgent ? null : new Date(),
    });

    if (!isAgent) {
      // Création automatique de la caisse client liée (admins uniquement).
      const caisseId = await ensureClientCaisse(String(doc._id), doc.nom);
      doc.caisseId = String(caisseId);
      await doc.save();
    }

    return res.status(201).json({
      success: true,
      data: serialize(doc.toObject()),
      message: isAgent
        ? 'Client créé — en attente de validation par l\'admin transit'
        : 'Client créé — caisse associée générée',
    });
  } catch (error) {
    console.error('POST /api/admin/clients error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getClients, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    case 'POST':
      return withAuth(createClient, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
