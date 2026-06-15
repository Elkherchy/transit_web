import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit, User } from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

export interface PayeurPaiementRow {
  designationId: string;
  transitId: string;
  bl?: string;
  client?: string;
  designationNom: string;
  montant: number;
  payeurId?: string;
  payeurNom?: string;
  payeurEmail?: string;
  paidAt: Date;
  statut: DesignationStatus;
  /** Reçus uploadés par le payeur — à passer à /api/documents pour ouvrir. */
  recus?: Array<{ key: string; name?: string }>;
}

/**
 * GET /api/journee/payeur-paiements
 *
 * Renvoie la liste des désignations payées par les USER_PAYEUR durant la
 * journée OUVERTE du caissier connecté (ou la journée du jour). Affiché dans
 * la page « Clôturer la journée » côté caissier pour visibilité des paiements
 * payeurs en cours.
 *
 * Auth : CAISSIER, ADMIN, ADMIN_TRANSIT.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PayeurPaiementRow[]>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    // Toutes les désignations PAYEE (en attente de traitement caissier),
    // sans filtre date — les paiements de 2-4 jours restent visibles
    // jusqu'à leur validation ou rejet.
    const transits = await Transit.find({
      'designations.statutDesignation': DesignationStatus.PAYEE,
    })
      .select('_id bl client designations')
      .lean();

    type LeanDesignation = {
      _id?: unknown;
      nom?: string;
      montant?: number;
      statutDesignation?: DesignationStatus;
      payeurId?: unknown;
      paidAt?: Date;
      recuUrl?: string;
      recuFilename?: string;
      recus?: Array<{ key?: string; name?: string }>;
    };

    const rows: PayeurPaiementRow[] = [];
    const payeurIds = new Set<string>();
    for (const tr of transits as Array<{
      _id: unknown;
      bl?: string;
      client?: string;
      designations?: LeanDesignation[];
    }>) {
      for (const d of tr.designations || []) {
        if (d.statutDesignation !== DesignationStatus.PAYEE) continue;
        if (!d.paidAt) continue;
        const paid = new Date(d.paidAt);
        const payeurId = d.payeurId ? String(d.payeurId) : undefined;
        if (payeurId) payeurIds.add(payeurId);
        // Agrège les reçus (multi-upload) + fallback champs legacy.
        const recus: Array<{ key: string; name?: string }> = [];
        if (Array.isArray(d.recus)) {
          for (const r of d.recus) {
            if (r?.key) recus.push({ key: r.key, name: r.name });
          }
        }
        if (recus.length === 0 && d.recuUrl) {
          recus.push({ key: d.recuUrl, name: d.recuFilename });
        }
        rows.push({
          designationId: d._id ? String(d._id) : '',
          transitId: String(tr._id),
          bl: tr.bl,
          client: tr.client,
          designationNom: d.nom || '',
          montant: Number(d.montant) || 0,
          payeurId,
          paidAt: paid,
          statut: d.statutDesignation || DesignationStatus.PAYEE,
          recus,
        });
      }
    }

    // Hydrate payeur info.
    if (payeurIds.size > 0) {
      const users = await User.find({ _id: { $in: Array.from(payeurIds) } })
        .select('_id nom email')
        .lean();
      const map = new Map(
        users.map((u) => [
          String(u._id),
          { nom: u.nom as string | undefined, email: u.email as string | undefined },
        ])
      );
      for (const r of rows) {
        if (r.payeurId) {
          const info = map.get(r.payeurId);
          if (info) {
            r.payeurNom = info.nom;
            r.payeurEmail = info.email;
          }
        }
      }
    }

    // Tri du plus récent au plus ancien.
    rows.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('GET /api/journee/payeur-paiements error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.CAISSIER,
]);
