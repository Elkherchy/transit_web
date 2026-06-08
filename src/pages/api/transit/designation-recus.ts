import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Transit } from '@/models';
import { ApiResponse, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ recus: Array<{ key: string; name?: string }>; nom: string }>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  const { id } = req.query;
  if (!id || !mongoose.isValidObjectId(String(id))) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }
  try {
    await connectDB();
    const transit = await Transit.findOne(
      { 'designations._id': new mongoose.Types.ObjectId(String(id)) },
      { 'designations.$': 1 }
    ).lean();
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }
    const desig = ((transit as { designations?: unknown[] }).designations || [])[0] as Record<string, unknown> | undefined;
    if (!desig) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }
    const recus: Array<{ key: string; name?: string }> = [];
    if (Array.isArray(desig.recus)) {
      for (const r of desig.recus as Array<{ key?: string; name?: string }>) {
        if (r?.key) recus.push({ key: r.key, name: r.name });
      }
    }
    if (recus.length === 0 && desig.recuUrl) {
      recus.push({ key: String(desig.recuUrl), name: desig.recuFilename ? String(desig.recuFilename) : undefined });
    }
    return res.status(200).json({
      success: true,
      data: { recus, nom: desig.nom ? String(desig.nom) : '' },
    });
  } catch (error) {
    console.error('GET /api/transit/designation-recus:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
]);
