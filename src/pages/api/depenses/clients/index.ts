import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { ClientDepense } from '@/models';
import {
  ClientDepenseStatus,
  type IClientDepense,
} from '@/models/ClientDepense';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

/**
 * GET /api/depenses/clients
 * Liste les bénéficiaires de dépense. Caissier/comptable ne voient que les
 * VALIDE ; AGENT_TRANSIT voit ses propres EN_ATTENTE en plus.
 */
async function listClients(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IClientDepense[]>>
) {
  try {
    await connectDB();
    const { statut, onlyValide } = req.query;
    const filter: Record<string, unknown> = { actif: true };
    const role = req.user!.role;

    if (onlyValide === '1' || onlyValide === 'true') {
      filter.statut = ClientDepenseStatus.VALIDE;
    } else if (
      typeof statut === 'string' &&
      Object.values(ClientDepenseStatus).includes(
        statut as ClientDepenseStatus
      )
    ) {
      filter.statut = statut;
    } else if (role !== UserRole.ADMIN && role !== UserRole.ADMIN_TRANSIT) {
      if (role === UserRole.AGENT_TRANSIT) {
        filter.$or = [
          { statut: ClientDepenseStatus.VALIDE },
          {
            statut: ClientDepenseStatus.EN_ATTENTE,
            createdBy: req.user!.userId,
          },
        ];
      } else {
        filter.statut = ClientDepenseStatus.VALIDE;
      }
    }

    const rows = await ClientDepense.find(filter).sort({ nom: 1 }).lean();
    return res
      .status(200)
      .json({ success: true, data: rows as unknown as IClientDepense[] });
  } catch (error) {
    console.error('GET /api/depenses/clients error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST /api/depenses/clients
 * AGENT_TRANSIT crée en EN_ATTENTE. Admin transit crée directement en VALIDE.
 * Body : { nom: string, telephone?: string, email?: string, description?: string }
 */
async function createClient(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IClientDepense>>
) {
  try {
    await connectDB();
    const { nom, telephone, email, description } = (req.body || {}) as {
      nom?: string;
      telephone?: string;
      email?: string;
      description?: string;
    };
    if (!nom || !String(nom).trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'Le nom est requis' });
    }

    const isAgent = req.user!.role === UserRole.AGENT_TRANSIT;
    const doc = await ClientDepense.create({
      nom: String(nom).trim(),
      telephone: telephone ? String(telephone).trim() : null,
      email: email ? String(email).trim().toLowerCase() : null,
      description: description ? String(description).trim() : null,
      statut: isAgent
        ? ClientDepenseStatus.EN_ATTENTE
        : ClientDepenseStatus.VALIDE,
      actif: true,
      createdBy: req.user!.userId,
      valideBy: isAgent ? null : req.user!.userId,
      valideAt: isAgent ? null : new Date(),
    });

    return res.status(201).json({
      success: true,
      data: doc.toObject() as unknown as IClientDepense,
      message: isAgent
        ? 'Client dépense créé — en attente de validation admin'
        : 'Client dépense créé',
    });
  } catch (error) {
    console.error('POST /api/depenses/clients error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return withAuth(listClients, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(createClient, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    default:
      return res
        .status(405)
        .json({ success: false, error: 'Méthode non autorisée' });
  }
}
