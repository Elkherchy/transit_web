import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import mongoose from 'mongoose';
import { Client, Facture, JourneeCaisse } from '@/models';
import {
  ApiResponse,
  IClientFactureJournee,
  IJourneeCaisse,
  JourneeCaisseStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { getOrCreateOpenJournee } from '@/lib/journee/journeeHelpers';
import { computeJourneeKpisForDate } from '@/lib/journee/computeJourneeKpis';

/**
 * GET /api/journee/current
 *
 * Renvoie la journée OUVERTE du caissier (la crée si absente). Si la journée
 * du jour est déjà clôturée, on la renvoie telle quelle (les endpoints
 * d'opération vérifieront `statut === OUVERTE`).
 *
 * Les KPI (dépôts admin, alimentations payeurs) sont :
 *   - calculés à la volée depuis les transactions si la journée est OUVERTE
 *   - lus depuis le snapshot figé sinon (`depotsAdminTotal`, etc.)
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IJourneeCaisse>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();

    const j = await getOrCreateOpenJournee(req.user!.userId);
    const fresh = await JourneeCaisse.findById(j._id).lean();
    const journee = (fresh as unknown as IJourneeCaisse) || j;

    let result: IJourneeCaisse = journee;
    if (journee.statut === JourneeCaisseStatus.OUVERTE) {
      const kpis = await computeJourneeKpisForDate(journee.date);
      result = { ...journee, ...kpis };
    }

    // Rattrapage historique: certaines factures client créées manuellement
    // n'ont pas été poussées dans `journee.clientFactures`. On les reconstruit
    // à partir des factures du jour pour garantir l'affichage dans la clôture.
    const dayStart = new Date(journee.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const facturesRaw = await Facture.find({
      createdAt: { $gte: dayStart, $lt: dayEnd },
      clientId: { $ne: null },
    })
      .select('_id transitId clientId numero totalFinal createdAt')
      .lean();

    const existing = result.clientFactures || [];
    const existingIds = new Set(existing.map((f) => String(f.factureId)));

    const clientIds = Array.from(
      new Set(
        facturesRaw
          .map((f) => String((f as { clientId?: unknown }).clientId || ''))
          .filter((id) => mongoose.isValidObjectId(id))
      )
    );
    const clients = clientIds.length
      ? await Client.find({ _id: { $in: clientIds } }).select('nom').lean()
      : [];
    const clientById = new Map(
      clients.map((c) => [String(c._id), c.nom || null])
    );

    const inferred: IClientFactureJournee[] = facturesRaw
      .filter((f) => !existingIds.has(String(f._id)))
      .map((f) => {
        const clientId = String((f as { clientId?: unknown }).clientId || '');
        const montant = Number((f as { totalFinal?: unknown }).totalFinal || 0);
        return {
          factureId: String(f._id),
          transitId: (f as { transitId?: string }).transitId
            ? String((f as { transitId?: string }).transitId)
            : undefined,
          clientId: clientId || undefined,
          clientNom: clientId ? clientById.get(clientId) || undefined : undefined,
          factureNumero: String((f as { numero?: unknown }).numero || ''),
          banqueId: '',
          banqueNom: undefined,
          montant,
          date: new Date((f as { createdAt?: Date }).createdAt || dayStart),
        };
      });

    if (inferred.length > 0) {
      result = {
        ...result,
        clientFactures: [...existing, ...inferred],
      };
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('GET /api/journee/current error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.CAISSIER]);
