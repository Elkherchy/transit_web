import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, MouvementPending } from '@/models';
import {
  ApiResponse,
  CaisseType,
  UserRole,
} from '@/types';
import {
  MouvementPendingKind,
  MouvementPendingStatus,
  type IMouvementPending,
} from '@/models/MouvementPending';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { transitDocumentUpload } from '@/lib/transitDocumentMulter';
import { storeTransitDocument } from '@/lib/transitDocumentStorage';

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (
      fn as (
        r: NextApiRequest,
        s: NextApiResponse,
        cb: (e?: unknown) => void
      ) => void
    )(req, res, (result: unknown) => {
      if (result instanceof Error) return reject(result);
      resolve();
    });
  });
}

/**
 * GET /api/caisse/mouvement-pending?statut=EN_ATTENTE&caisseType=TRANSIT
 *
 * Liste les mouvements en attente / validés / rejetés. Filtre automatique
 * par caisseType pour les admins scopés. AGENT_TRANSIT voit ses propres
 * mouvements.
 */
async function listPending(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IMouvementPending[]>>
) {
  try {
    await connectDB();
    const { statut, caisseType, limit = '100' } = req.query;
    const filter: Record<string, unknown> = {};
    if (
      statut &&
      Object.values(MouvementPendingStatus).includes(
        statut as MouvementPendingStatus
      )
    ) {
      filter.statut = statut;
    }
    const role = req.user!.role;
    // Helper : pour TRANSIT, on inclut aussi les pendings legacy sans
    // caisseType (créés avant l'ajout du champ ou pour des caisses CLIENT
    // dont caisseType était undefined).
    const applyTransitFilter = () => {
      filter.$or = [
        { caisseType: CaisseType.TRANSIT },
        { caisseType: { $exists: false } },
        { caisseType: null },
      ];
    };
    if (role === UserRole.ADMIN_TRANSIT) {
      applyTransitFilter();
    } else if (role === UserRole.ADMIN_LOGISTIQUE) {
      filter.caisseType = CaisseType.LOGISTIQUE;
    } else if (
      caisseType === CaisseType.TRANSIT ||
      caisseType === 'TRANSIT'
    ) {
      applyTransitFilter();
    } else if (
      caisseType &&
      Object.values(CaisseType).includes(caisseType as CaisseType)
    ) {
      filter.caisseType = caisseType;
    }
    if (role === UserRole.AGENT_TRANSIT) {
      filter.createdBy = req.user!.userId;
    }
    const lim = Math.min(500, Math.max(1, parseInt(String(limit), 10) || 100));
    const rows = await MouvementPending.find(filter)
      .sort({ createdAt: -1 })
      .limit(lim)
      .lean();
    return res.status(200).json({
      success: true,
      data: rows as unknown as IMouvementPending[],
    });
  } catch (error) {
    console.error('GET /api/caisse/mouvement-pending error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST /api/caisse/mouvement-pending (multipart/form-data)
 *
 * Champs : kind (CREDIT|DEBIT|TRANSFER), sourceCaisseId, destinationCaisseId?,
 *   montant, description, date?, file (image obligatoire).
 *
 * Le mouvement est créé au statut EN_ATTENTE — il n'impacte PAS encore les
 * soldes des comptes. L'admin transit doit valider via POST
 * /api/caisse/mouvement-pending/[id]/valider pour que les transactions
 * réelles soient créées et les soldes mis à jour.
 *
 * Auth : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT.
 */
async function createPending(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse<ApiResponse<IMouvementPending>>
) {
  try {
    await connectDB();
    await runMiddleware(req, res, transitDocumentUpload.single('file'));

    const {
      kind,
      sourceCaisseId: rawSourceCaisseId,
      sourceClientId,
      destinationCaisseId: rawDestinationCaisseId,
      destinationClientId,
      montant,
      description,
      date,
    } = (req.body || {}) as {
      kind?: string;
      sourceCaisseId?: string;
      sourceClientId?: string;
      destinationCaisseId?: string;
      destinationClientId?: string;
      montant?: string | number;
      description?: string;
      date?: string;
    };

    // Résolution dynamique source/destination : un clientId est converti en
    // la caisse CLIENT du client (créée si besoin). Permet à l'agent de
    // sélectionner un client validé au lieu d'une caisse banque/générale,
    // côté source comme côté destination.
    const { Client } = await import('@/models');
    const { ClientStatus } = await import('@/models/Client');
    const { ensureClientCaisse } = await import('@/lib/caisse');

    async function resolveClientCaisse(
      clientId: string
    ): Promise<{ ok: true; id: string } | { ok: false; err: { status: number; msg: string } }> {
      if (!mongoose.isValidObjectId(String(clientId))) {
        return { ok: false, err: { status: 400, msg: 'clientId invalide' } };
      }
      const client = await Client.findById(clientId)
        .select('_id nom statut actif caisseId')
        .lean();
      if (!client || !client.actif) {
        return {
          ok: false,
          err: { status: 404, msg: 'Client introuvable ou inactif' },
        };
      }
      if (client.statut !== ClientStatus.VALIDE) {
        return {
          ok: false,
          err: { status: 400, msg: "Ce client n'est pas validé" },
        };
      }
      const id = client.caisseId
        ? String(client.caisseId)
        : String(await ensureClientCaisse(String(client._id), client.nom));
      return { ok: true, id };
    }

    let sourceCaisseId = rawSourceCaisseId;
    if (!sourceCaisseId && sourceClientId) {
      const r = await resolveClientCaisse(sourceClientId);
      if (!r.ok)
        return res
          .status(r.err.status)
          .json({ success: false, error: r.err.msg });
      sourceCaisseId = r.id;
    }

    let destinationCaisseId = rawDestinationCaisseId;
    if (!destinationCaisseId && destinationClientId) {
      const r = await resolveClientCaisse(destinationClientId);
      if (!r.ok)
        return res
          .status(r.err.status)
          .json({ success: false, error: r.err.msg });
      destinationCaisseId = r.id;
    }

    if (
      !kind ||
      !Object.values(MouvementPendingKind).includes(
        kind as MouvementPendingKind
      )
    ) {
      return res.status(400).json({ success: false, error: 'kind invalide' });
    }
    if (!sourceCaisseId || !mongoose.isValidObjectId(String(sourceCaisseId))) {
      return res.status(400).json({
        success: false,
        error: 'sourceCaisseId invalide',
      });
    }
    if (
      kind === MouvementPendingKind.TRANSFER &&
      (!destinationCaisseId ||
        !mongoose.isValidObjectId(String(destinationCaisseId)) ||
        String(destinationCaisseId) === String(sourceCaisseId))
    ) {
      return res.status(400).json({
        success: false,
        error: 'destinationCaisseId requis et distinct',
      });
    }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Montant invalide' });
    }
    if (!description || !String(description).trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'Description requise' });
    }
    // L'image justificative est obligatoire pour les transferts entre comptes
    // bancaires (preuve du virement). Elle reste optionnelle pour les
    // transferts impliquant un client (source ou destination) — la
    // description sert alors de justification écrite.
    const isClientRelated = Boolean(sourceClientId || destinationClientId);
    if (!isClientRelated && !req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Image justificative obligatoire',
      });
    }

    const source = await Caisse.findById(sourceCaisseId)
      .select('_id nom actif caisseType solde kind')
      .lean();
    if (!source || !source.actif) {
      return res.status(404).json({
        success: false,
        error: 'Compte source introuvable ou inactif',
      });
    }

    // Vérification du solde AVANT toute action (création pending ou upload S3).
    // Empêche un agent de soumettre un transfert/débit que le compte source
    // ne peut pas absorber, même avant validation admin.
    // Exception : transferts impliquant un client (source ou destination
    // CLIENT) — autorisés à dépasser le solde (créance comptable).
    const isClientTransfer = Boolean(
      sourceClientId || destinationClientId
    );
    if (
      (kind === MouvementPendingKind.TRANSFER ||
        kind === MouvementPendingKind.DEBIT) &&
      !isClientTransfer
    ) {
      const soldeSource = Number(source.solde) || 0;
      if (soldeSource < m) {
        return res.status(400).json({
          success: false,
          error: `Solde insuffisant sur ${source.nom} (${soldeSource.toLocaleString(
            'fr-FR',
            { minimumFractionDigits: 2 }
          )} MRU disponibles, ${m.toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
          })} MRU demandés)`,
        });
      }
    }
    let destination: typeof source | null = null;
    if (kind === MouvementPendingKind.TRANSFER && destinationCaisseId) {
      const found = await Caisse.findById(destinationCaisseId)
        .select('_id nom actif caisseType kind')
        .lean();
      if (!found || !found.actif) {
        return res.status(404).json({
          success: false,
          error: 'Compte destination introuvable ou inactif',
        });
      }
      destination = found;
    }

    // Scoping par domaine.
    // Note : on tolère les caisses CLIENT sans `caisseType` (legacy, créées
    // avant l'introduction du champ) — elles sont implicitement TRANSIT.
    const role = req.user!.role;
    const isTransitOk = (c: { caisseType?: unknown; kind?: unknown } | null) => {
      if (!c) return true;
      if (c.caisseType === CaisseType.TRANSIT) return true;
      if (!c.caisseType && c.kind === 'CLIENT') return true;
      return false;
    };
    if (
      role === UserRole.ADMIN_TRANSIT ||
      role === UserRole.AGENT_TRANSIT
    ) {
      if (!isTransitOk(source)) {
        return res.status(403).json({
          success: false,
          error: 'Compte hors domaine transit',
        });
      }
      if (destination && !isTransitOk(destination)) {
        return res.status(403).json({
          success: false,
          error: 'Compte destination hors domaine transit',
        });
      }
    }

    // Upload image S3 — uniquement si un fichier a été joint (optionnel
    // pour les transferts entre clients).
    let stored: { key: string; name: string } | null = null;
    if (req.file?.buffer) {
      stored = await storeTransitDocument(`mouvement-pending`, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
      });
    }

    // Fallback robuste : si source.caisseType est absent (cas legacy d'une
    // caisse CLIENT créée avant l'ajout du champ), on suppose TRANSIT. Sans
    // ça, l'admin_transit ne voit pas le pending dans sa file (filtre
    // strict par caisseType=TRANSIT côté liste).
    const resolvedCaisseType =
      (source as { caisseType?: unknown }).caisseType || CaisseType.TRANSIT;

    const created = await MouvementPending.create({
      kind,
      sourceCaisseId: String(source._id),
      sourceCaisseNom: source.nom,
      destinationCaisseId: destination ? String(destination._id) : undefined,
      destinationCaisseNom: destination ? destination.nom : undefined,
      montant: m,
      description: String(description).trim(),
      date: date ? new Date(date) : new Date(),
      caisseType: resolvedCaisseType,
      recuUrl: stored?.key,
      recuFilename: stored?.name,
      statut: MouvementPendingStatus.EN_ATTENTE,
      createdBy: req.user!.userId,
    });

    return res.status(201).json({
      success: true,
      data: created.toObject() as unknown as IMouvementPending,
      message: 'Mouvement créé — en attente de validation',
    });
  } catch (error) {
    console.error('POST /api/caisse/mouvement-pending error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = { api: { bodyParser: false } };

export default function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case 'GET':
      return withAuth(listPending, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_TRANSIT,
        UserRole.COMPTABLE,
      ])(req, res);
    case 'POST':
      return withAuth(createPending, [
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
