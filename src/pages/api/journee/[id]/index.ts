import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Client, Facture, JourneeCaisse, Transit, User } from '@/models';
import {
  ApiResponse,
  IJourneeCaisse,
  ITransit,
  IUserResponse,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface JourneeDetail {
  journee: IJourneeCaisse;
  transits: ITransit[];
  payeurs: Record<string, IUserResponse>;
  caissier?: IUserResponse;
}

/**
 * GET /api/journee/[id]
 * Détail journée + transits travaillés + payeurs concernés. Utilisé par la
 * page agent transit (validation par-désignation) et admin (validation finale).
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<JourneeDetail>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    const journee = await JourneeCaisse.findById(id).lean();
    if (!journee) {
      return res.status(404).json({ success: false, error: 'Journée introuvable' });
    }

    const journeeDate = new Date((journee as { date: Date }).date);
    const dayStart = new Date(journeeDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Rattrapage: injecter les factures client du jour absentes de clientFactures.
    const existingFactures =
      (journee as { clientFactures?: Array<{ factureId: string }> }).clientFactures || [];
    const existingFactureIds = new Set(existingFactures.map((f) => String(f.factureId)));
    const facturesRaw = await Facture.find({
      createdAt: { $gte: dayStart, $lt: dayEnd },
      clientId: { $ne: null },
    })
      .select('_id transitId clientId numero totalFinal createdAt')
      .lean();

    const clientIdsFromFactures = facturesRaw
      .map((f) => String((f as { clientId?: unknown }).clientId || ''))
      .filter((cid) => mongoose.isValidObjectId(cid));

    const clientIdsFromPaiements = ((journee as {
      clientPaiements?: Array<{ clientId?: string }>;
    }).clientPaiements || [])
      .map((p) => String(p.clientId || ''))
      .filter((cid) => mongoose.isValidObjectId(cid));

    const clientIds = Array.from(new Set([...clientIdsFromFactures, ...clientIdsFromPaiements]));
    const clients = clientIds.length
      ? await Client.find({ _id: { $in: clientIds } }).select('nom').lean()
      : [];
    const clientById = new Map(clients.map((c) => [String(c._id), c.nom || null]));

    const inferredClientFactures = facturesRaw
      .filter((f) => !existingFactureIds.has(String(f._id)))
      .map((f) => {
        const clientId = String((f as { clientId?: unknown }).clientId || '');
        return {
          factureId: String(f._id),
          transitId: (f as { transitId?: unknown }).transitId
            ? String((f as { transitId?: unknown }).transitId)
            : undefined,
          clientId: clientId || undefined,
          clientNom: clientId ? clientById.get(clientId) || undefined : undefined,
          factureNumero: String((f as { numero?: unknown }).numero || ''),
          banqueId: '',
          banqueNom: undefined,
          montant: Number((f as { totalFinal?: unknown }).totalFinal || 0),
          date: new Date((f as { createdAt?: Date }).createdAt || journeeDate),
        };
      });

    const existingClientPaiements =
      (journee as {
        clientPaiements?: Array<{ clientId?: string; clientNom?: string }>;
      }).clientPaiements || [];
    const clientPaiementsEnriched = existingClientPaiements.map((p) => {
      if (p.clientNom) return p;
      const clientId = String(p.clientId || '');
      return {
        ...p,
        clientNom: clientId ? clientById.get(clientId) || undefined : undefined,
      };
    });

    const journeeWithClientOps = {
      ...journee,
      clientPaiements: clientPaiementsEnriched,
      clientFactures: [...existingFactures, ...inferredClientFactures],
    };

    const transits = await Transit.find({
      _id: {
        $in:
          (journeeWithClientOps as { transitsTraitesIds: string[] }).transitsTraitesIds ||
          [],
      },
    }).lean();

    // Collecter tous les payeurs concernés (alimentations + désignations).
    const payeurIds = new Set<string>();
    for (const a of (journee as { alimentationsPayeurs: { payeurId: string }[] }).alimentationsPayeurs || []) {
      payeurIds.add(String(a.payeurId));
    }
    for (const t of transits as unknown as ITransit[]) {
      for (const d of t.designations || []) {
        if (d.payeurId) payeurIds.add(String(d.payeurId));
      }
    }
    const users = await User.find({ _id: { $in: Array.from(payeurIds) } })
      .select('_id nom email role')
      .lean();
    const payeurs: Record<string, IUserResponse> = {};
    for (const u of users) payeurs[String(u._id)] = u as unknown as IUserResponse;

    const caissier = await User.findById((journee as { caissierId: string }).caissierId)
      .select('_id nom email role')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        journee: journeeWithClientOps as unknown as IJourneeCaisse,
        transits: transits as unknown as ITransit[],
        payeurs,
        caissier: (caissier as unknown as IUserResponse) || undefined,
      },
    });
  } catch (error) {
    console.error('GET /api/journee/[id] error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
]);
