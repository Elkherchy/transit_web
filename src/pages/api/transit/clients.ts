import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Client } from '@/models';
import { ClientStatus } from '@/models/Client';
import { ApiResponse, ITransitClient } from '@/types';
import { AuthenticatedRequest, withAgentTransit, withTransitAccess } from '@/middleware/auth';

const LIMIT = 30;

async function listClients(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransitClient[]>>) {
  try {
    await connectDB();
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    // N'affiche que les clients VALIDÉS — exclut les EN_ATTENTE pour qu'ils
    // n'apparaissent pas dans le sélecteur de création de manutention ni
    // dans les autres pages transit consommatrices de cette liste.
    const filter: Record<string, unknown> = {
      actif: true,
      statut: ClientStatus.VALIDE,
    };
    if (q) {
      filter.nom = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }
    const rows = await Client.find(filter).sort({ nom: 1 }).limit(LIMIT).lean();
    const data: ITransitClient[] = rows.map((c) => ({
      _id: String(c._id),
      nom: c.nom,
      actif: Boolean(c.actif),
    }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List clients error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createClient(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransitClient>>) {
  try {
    await connectDB();
    const nom = typeof req.body?.nom === 'string' ? req.body.nom.trim() : '';
    if (!nom) {
      return res.status(400).json({ success: false, error: 'Le nom du client est requis' });
    }
    const doc = await Client.create({ nom, actif: true });
    return res.status(201).json({
      success: true,
      data: {
        _id: String(doc._id),
        nom: doc.nom,
        actif: doc.actif,
      },
      message: 'Client créé',
    });
  } catch (error) {
    console.error('Create client error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withTransitAccess(listClients)(req, res);
    case 'POST':
      return withAgentTransit(createClient)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
