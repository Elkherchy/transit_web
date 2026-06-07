import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { FichierLogistique, Voyage } from '@/models';
import {
  ApiResponse,
  IFichierLogistique,
  FichierLogistiqueStatus,
  VoyageStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

interface FichierWithStats extends IFichierLogistique {
  nbVoyages: number;
  nbReserves: number;
  nbRetournes: number;
  nbValides: number;
  totalPrixTransport: number;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function generateReference(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const r = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `LOG-${y}${m}-${r}`;
}

interface VoyageInput {
  date?: string;
  client?: string;
  clientId?: string;
  clientSource?: string;
  bl?: string;
  ntc?: string;
  ntcs?: string[];
  telephone?: string;
  societe?: string;
  tp?: string;
  magasinage?: string | null;
  surestaries?: string | null;
  note?: string;
  prixTransport?: number;
  commissionChauffeur?: number;
}

/**
 * POST /api/logistique/fichiers
 * Crée un fichier logistique (dossier) + tous les voyages associés.
 *
 * Auth : ADMIN, AGENT_RECEPTION_LOGISTIQUE.
 *
 * Body : {
 *   date: string (ISO),
 *   note?: string,
 *   voyages: VoyageInput[]
 * }
 *
 * Chaque voyage est créé au statut CREE (sans matricule, sans chauffeur).
 */
async function createFichier(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ fichier: IFichierLogistique; nbVoyages: number }>>
) {
  try {
    await connectDB();
    const { date, note, voyages } = req.body || {};

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date requise' });
    }
    const fichierDate = new Date(date);
    if (Number.isNaN(fichierDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Date invalide' });
    }

    if (!Array.isArray(voyages) || voyages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Au moins un voyage est requis',
      });
    }

    // Validation par ligne voyage (souple — chaque champ texte est optionnel
    // sauf le client qui sert d'identifiant minimal).
    for (let i = 0; i < voyages.length; i++) {
      const v = voyages[i] as VoyageInput;
      const hasInfo =
        Boolean(v.client?.trim() || v.bl?.trim() || v.ntc?.trim());
      if (!hasInfo) {
        return res.status(400).json({
          success: false,
          error: `Voyage #${i + 1} : client / BL / NTC requis`,
        });
      }
    }

    // Création du fichier (référence unique avec retry simple si collision).
    let fichierDoc = null;
    for (let attempt = 0; attempt < 5 && !fichierDoc; attempt++) {
      const reference = generateReference(fichierDate);
      try {
        fichierDoc = await FichierLogistique.create({
          reference,
          date: fichierDate,
          note: note ? String(note).trim() : null,
          statut: FichierLogistiqueStatus.OUVERT,
          createdBy: req.user!.userId,
        });
      } catch (e) {
        const err = e as { code?: number };
        if (err?.code !== 11000) throw e;
      }
    }
    if (!fichierDoc) {
      return res.status(500).json({
        success: false,
        error: 'Génération de référence impossible — réessayez',
      });
    }

    // Création des voyages liés.
    const voyageDocs = (voyages as VoyageInput[]).map((v) => ({
      fichierLogistiqueId: String(fichierDoc!._id),
      date: v.date ? new Date(v.date) : fichierDate,
      clientSource: v.client ? String(v.client).trim() : v.clientSource ? String(v.clientSource).trim() : undefined,
      clientId: v.clientId ? String(v.clientId).trim() : undefined,
      bl: v.bl ? String(v.bl).trim().toUpperCase() : undefined,
      ntc: v.ntc ? String(v.ntc).trim().toUpperCase() : undefined,
      ntcs: Array.isArray(v.ntcs)
        ? v.ntcs
            .map((n) => String(n).trim().toUpperCase())
            .filter((n) => n.length > 0)
        : v.ntc
          ? [String(v.ntc).trim().toUpperCase()]
          : [],
      telephone: v.telephone ? String(v.telephone).trim() : undefined,
      societe: v.societe ? String(v.societe).trim() : undefined,
      tp: v.tp ? String(v.tp).trim() : undefined,
      magasinage: parseOptionalDate(v.magasinage),
      surestaries: parseOptionalDate(v.surestaries),
      note: v.note ? String(v.note).trim() : undefined,
      prixTransport: Number.isFinite(Number(v.prixTransport))
        ? Math.max(0, Number(v.prixTransport))
        : 6000,
      commissionChauffeur: Number.isFinite(Number(v.commissionChauffeur))
        ? Math.max(0, Number(v.commissionChauffeur))
        : 300,
      statutVoyage: VoyageStatus.CREE,
    }));

    await Voyage.insertMany(voyageDocs);

    return res.status(201).json({
      success: true,
      data: {
        fichier: fichierDoc.toObject() as unknown as IFichierLogistique,
        nbVoyages: voyageDocs.length,
      },
      message: `Fichier créé avec ${voyageDocs.length} voyage(s)`,
    });
  } catch (error) {
    console.error('POST /api/logistique/fichiers error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * GET /api/logistique/fichiers?statut=...
 * Liste des fichiers logistique avec stats dérivées (nb voyages par statut).
 */
async function listFichiers(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<FichierWithStats[]>>
) {
  try {
    await connectDB();
    const { statut, limit = '50' } = req.query;
    const filter: Record<string, unknown> = {};
    if (
      statut &&
      Object.values(FichierLogistiqueStatus).includes(
        statut as FichierLogistiqueStatus
      )
    ) {
      filter.statut = statut;
    }

    // L'agent réception logistique doit valider (soumettre) le dossier avant
    // qu'il ne soit visible côté Transit. AGENT_TRANSIT et COMPTABLE ne voient
    // donc pas les dossiers encore au statut OUVERT.
    const role = req.user!.role;
    if (
      role === UserRole.AGENT_TRANSIT ||
      role === UserRole.COMPTABLE
    ) {
      const requestedStatut = filter.statut as FichierLogistiqueStatus | undefined;
      if (requestedStatut === FichierLogistiqueStatus.OUVERT) {
        return res.status(200).json({ success: true, data: [] });
      }
      if (!requestedStatut) {
        filter.statut = {
          $in: [
            FichierLogistiqueStatus.PRET_VALIDATION,
            FichierLogistiqueStatus.VALIDE,
          ],
        };
      }
    }
    const lim = Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50));
    const fichiers = await FichierLogistique.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(lim)
      .lean();

    const ids = fichiers.map((f) => String(f._id));
    const voyages = await Voyage.find({ fichierLogistiqueId: { $in: ids } })
      .select('fichierLogistiqueId statutVoyage prixTransport')
      .lean();

    type VoyAgg = { fichierLogistiqueId?: unknown; statutVoyage?: string; prixTransport?: number };
    const stats = new Map<
      string,
      { nbVoyages: number; nbReserves: number; nbRetournes: number; nbValides: number; totalPrixTransport: number }
    >();
    for (const v of voyages as VoyAgg[]) {
      const k = String(v.fichierLogistiqueId || '');
      const cur =
        stats.get(k) || {
          nbVoyages: 0,
          nbReserves: 0,
          nbRetournes: 0,
          nbValides: 0,
          totalPrixTransport: 0,
        };
      cur.nbVoyages += 1;
      if (
        v.statutVoyage === VoyageStatus.RESERVE ||
        v.statutVoyage === VoyageStatus.EN_COURS
      )
        cur.nbReserves += 1;
      else if (v.statutVoyage === VoyageStatus.RETOURNE) cur.nbRetournes += 1;
      else if (v.statutVoyage === VoyageStatus.VALIDE) cur.nbValides += 1;
      cur.totalPrixTransport += Number(v.prixTransport) || 0;
      stats.set(k, cur);
    }

    const data: FichierWithStats[] = fichiers.map((f) => {
      const s = stats.get(String(f._id)) || {
        nbVoyages: 0,
        nbReserves: 0,
        nbRetournes: 0,
        nbValides: 0,
        totalPrixTransport: 0,
      };
      return {
        ...(f as unknown as IFichierLogistique),
        ...s,
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('GET /api/logistique/fichiers error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(listFichiers, [
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_RECEPTION_LOGISTIQUE,
        UserRole.AGENT_TRANSIT,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(createFichier, [
        UserRole.ADMIN,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_RECEPTION_LOGISTIQUE,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
