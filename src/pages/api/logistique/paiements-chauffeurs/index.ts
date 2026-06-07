import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Voyage, User, Caisse } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  UserRole,
  VoyageStatus,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface ChauffeurPaiementRow {
  chauffeurId: string;
  nom: string;
  email: string;
  telephone?: string;
  caisseId?: string;
  soldeCaisse: number;
  /** Voyages avec commission gagnée non encore payée. */
  nbVoyagesAPayer: number;
  /** Total commissions à payer (gagnées non payées). */
  totalAPayer: number;
  /** Total commissions déjà payées (historique). */
  totalDejaPaye: number;
}

/**
 * GET /api/logistique/paiements-chauffeurs
 *
 * Liste les chauffeurs avec :
 *   - solde caisse CHAUFFEUR
 *   - total commissions à payer (voyages RETOURNE/VALIDE sans commissionPaidAt)
 *   - total déjà payé (historique)
 *
 * Auth : ADMIN, COMPTABLE
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ChauffeurPaiementRow[]>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();

    const chauffeurs = await User.find({ role: UserRole.CHAUFFEUR, actif: true })
      .select('_id nom email telephone')
      .lean();

    const caisses = await Caisse.find({
      kind: CaisseKind.CHAUFFEUR,
      actif: true,
    })
      .select('_id chauffeurId solde')
      .lean();
    const caisseMap = new Map<string, { _id: string; solde: number }>();
    for (const c of caisses) {
      if (c.chauffeurId) {
        caisseMap.set(String(c.chauffeurId), {
          _id: String(c._id),
          solde: Number(c.solde) || 0,
        });
      }
    }

    const ids = chauffeurs.map((c) => String(c._id));

    const voyages = await Voyage.find({
      chauffeurId: { $in: ids },
      statutVoyage: { $in: [VoyageStatus.RETOURNE, VoyageStatus.VALIDE] },
    })
      .select('chauffeurId commissionChauffeur commissionPaidAt')
      .lean();

    const aPayer = new Map<string, { nb: number; total: number }>();
    const dejaPaye = new Map<string, number>();
    for (const v of voyages) {
      const cid = String(v.chauffeurId);
      const m = Number(v.commissionChauffeur) || 0;
      if (v.commissionPaidAt) {
        dejaPaye.set(cid, (dejaPaye.get(cid) || 0) + m);
      } else {
        const cur = aPayer.get(cid) || { nb: 0, total: 0 };
        cur.nb += 1;
        cur.total += m;
        aPayer.set(cid, cur);
      }
    }

    const data: ChauffeurPaiementRow[] = chauffeurs.map((c) => {
      const cid = String(c._id);
      const caisse = caisseMap.get(cid);
      const a = aPayer.get(cid) || { nb: 0, total: 0 };
      return {
        chauffeurId: cid,
        nom: c.nom,
        email: c.email,
        telephone: c.telephone,
        caisseId: caisse?._id,
        soldeCaisse: caisse?.solde ?? 0,
        nbVoyagesAPayer: a.nb,
        totalAPayer: a.total,
        totalDejaPaye: dejaPaye.get(cid) || 0,
      };
    });

    // Tri : à payer en premier, puis alpha.
    data.sort((a, b) => {
      if (a.nbVoyagesAPayer !== b.nbVoyagesAPayer) {
        return b.nbVoyagesAPayer - a.nbVoyagesAPayer;
      }
      return a.nom.localeCompare(b.nom);
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('GET /api/logistique/paiements-chauffeurs error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_LOGISTIQUE, UserRole.AGENT_TRANSIT, UserRole.COMPTABLE]);
