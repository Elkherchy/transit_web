import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/db';
import LogistiqueClientConfig, { ILogistiqueClientConfig } from '@/models/LogistiqueClientConfig';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';

async function listClients(_req: AuthenticatedRequest, res: NextApiResponse<any>) {
  try {
    await dbConnect();
    const clients = await LogistiqueClientConfig.find({ actif: true }).lean();
    return res.status(200).json({
      success: true,
      data: clients,
    });
  } catch (err) {
    console.error('Erreur get clients:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createClient(req: AuthenticatedRequest, res: NextApiResponse<any>) {
  try {
    await dbConnect();
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nom client invalide' });
    }

    const normalized = name.trim().toUpperCase();

    const existing = await LogistiqueClientConfig.findOne({
      name: { $regex: `^${normalized}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Ce client existe deja' });
    }

    const newClient = new LogistiqueClientConfig({
      name: normalized,
      description: description?.trim() || '',
      actif: true,
    });

    await newClient.save();

    return res.status(201).json({
      success: true,
      data: newClient.toObject() as ILogistiqueClientConfig,
    });
  } catch (err) {
    console.error('Erreur creation client:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  switch (req.method) {
    case 'GET':
      return withLogistique(listClients)(req as AuthenticatedRequest, res);
    case 'POST':
      return withLogistique(createClient)(req as AuthenticatedRequest, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
