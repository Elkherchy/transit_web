import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { FactureManutention } from '@/models';
import {
  ApiResponse,
  IFactureManutention,
  FactureManutentionStatus,
  PaginatedResponse,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { createTransitFromManutention } from '@/lib/manutention/createTransitFromManutention';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

// GET /api/manutention - List all factures manutention
async function getFacturesManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IFactureManutention>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '10',
      statut,
      bl,
      search,
      mine,
      validated,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (statut) {
      query.statut = statut;
    } else if (validated === 'true') {
      query.statut = FactureManutentionStatus.CLOTURE;
    } else if (validated === 'false') {
      query.statut = { $ne: FactureManutentionStatus.CLOTURE };
    }
    if (bl) query.bl = { $regex: bl, $options: 'i' };

    if (search) {
      query.$or = [
        { bl: { $regex: search, $options: 'i' } },
        { 'lignesEntreprise.nomEntreprise': { $regex: search, $options: 'i' } },
      ];
    }

    // Filtrer par créateur si "mine" est true et que ce n'est pas un admin
    const isAdmin = req.user!.role === UserRole.ADMIN;
    if (mine === 'true' && !isAdmin) {
      query.createdBy = req.user!.userId;
    }

    const [factures, total] = await Promise.all([
      FactureManutention.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('payeurId', 'nom email')
        .lean(),
      FactureManutention.countDocuments(query),
    ]);

    // Resynchronise statut + bonLivret de la page courante depuis les
    // désignations du transit lié — auto-réparation pour les anciennes
    // factures dont le bonLivret n'a pas été remis à jour après paiement.
    const transitIds = (factures as { transitId?: unknown }[])
      .map((f) => f.transitId)
      .filter(Boolean)
      .map((t) => String(t));
    if (transitIds.length > 0) {
      await Promise.all(
        transitIds.map((tid) =>
          syncFactureManutentionStatusFromTransit(tid).catch((e) => {
            console.error('list sync error for transit', tid, e);
          })
        )
      );
      // Recharge la page après resync pour refléter les valeurs à jour.
      const fresh = await FactureManutention.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('payeurId', 'nom email')
        .lean();
      return res.status(200).json({
        success: true,
        data: {
          data: fresh as IFactureManutention[],
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        data: factures as IFactureManutention[],
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get factures manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// POST /api/manutention — création par ADMIN uniquement (nouveau workflow).
// Transit auto-créé immédiatement avec 14 désignations par défaut.
//
// Note : exécution séquentielle (pas de transaction) — MongoDB standalone ne
// supporte pas les transactions multi-document. Si la création du transit
// échoue, on supprime la facture créée pour éviter les orphelins.
async function createFactureManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IFactureManutention & { transitId?: string }>>
) {
  try {
    await connectDB();

    const { bl, client, clientId, objet } = req.body;

    if (!bl || typeof bl !== 'string' || !bl.trim()) {
      return res.status(400).json({ success: false, error: 'BL requis' });
    }
    if (!client || typeof client !== 'string' || !client.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Le nom du client est requis',
      });
    }
    if (!objet || typeof objet !== 'string' || !objet.trim()) {
      return res.status(400).json({
        success: false,
        error: "L'objet est requis",
      });
    }

    // Unicité du BL : interdit de créer deux manutentions avec le même BL
    // (tous statuts confondus, y compris BROUILLON et EN_ATTENTE_VALIDATION).
    const normalizedBl = bl.trim().toUpperCase();
    const existing = await FactureManutention.findOne({ bl: normalizedBl })
      .select('_id statut bl')
      .lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Une manutention existe déjà avec le BL ${normalizedBl} (statut : ${
          (existing as { statut?: string }).statut || '—'
        })`,
      });
    }

    // `bonLivret` n'est plus saisi par l'admin — chaque désignation (y compris
    // « Bon de livret ») démarre à 0 et le payeur saisit le montant au paiement.
    //
    // Si la facture est créée par AGENT_TRANSIT, elle démarre au statut
    // EN_ATTENTE_VALIDATION et n'est pas visible côté payeur tant que l'admin
    // transit ne l'a pas validée (POST /api/manutention/[id]/valider).
    const isDraft = req.user!.role === UserRole.AGENT_TRANSIT;
    const factureDoc = (await FactureManutention.create({
      bl: normalizedBl,
      client: client.trim(),
      clientId: clientId || null,
      objet: objet.trim(),
      lignesEntreprise: [],
      bonLivret: 0,
      statut: isDraft
        ? FactureManutentionStatus.EN_ATTENTE_VALIDATION
        : FactureManutentionStatus.EN_ATTENTE_PAIEMENT,
      createdBy: req.user!.userId,
    })) as unknown as IFactureManutention;

    // Le dossier transit n'est créé QUE pour les manutentions directement
    // validées (par l'admin). Pour AGENT_TRANSIT, on attend la validation
    // par l'admin transit avant de créer le transit (cf.
    // POST /api/manutention/[id]/valider).
    let transitId: string | null = null;
    if (!isDraft) {
      try {
        const result = await createTransitFromManutention({
          factureManutentionId: String(factureDoc._id),
          client: client.trim(),
          clientId: clientId || null,
          objet: objet.trim(),
          bl: bl.trim(),
          actorUserId: req.user!.userId,
          draft: false,
        });
        transitId = result.transitId;
      } catch (transitErr) {
        // Rollback best-effort : supprime la facture pour éviter l'orphelin.
        console.error(
          'createTransitFromManutention error — rollback facture',
          transitErr
        );
        try {
          await FactureManutention.findByIdAndDelete(factureDoc._id);
        } catch (cleanupErr) {
          console.error('Rollback facture manutention failed', cleanupErr);
        }
        return res.status(500).json({
          success: false,
          error:
            transitErr instanceof Error
              ? transitErr.message
              : 'Création du transit échouée',
        });
      }
    }

    // `factureDoc` est un Mongoose Document : spread direct ne propage pas
    // `_id` (non énumérable). On reconstruit un objet plain explicite pour
    // garantir que le client reçoit `_id` en string.
    const maybeDoc = factureDoc as unknown as {
      toObject?: () => Record<string, unknown>;
      _id?: unknown;
      bl?: string;
      client?: string;
      clientId?: unknown;
      objet?: string;
      statut?: string;
      createdBy?: string;
      createdAt?: Date;
    };
    const docId = String(
      maybeDoc._id ||
        (maybeDoc.toObject?.() as { _id?: unknown })?._id ||
        ''
    );

    if (!docId) {
      // Garde-fou : si on n'a pas pu extraire l'id, on log + 500 explicite.
      console.error('Manutention créée mais _id introuvable', factureDoc);
      return res.status(500).json({
        success: false,
        error: 'Manutention créée mais ID introuvable côté serveur',
      });
    }

    const responseData = {
      _id: docId,
      bl: maybeDoc.bl ?? bl.trim().toUpperCase(),
      client: maybeDoc.client ?? client.trim(),
      clientId: maybeDoc.clientId ? String(maybeDoc.clientId) : null,
      objet: maybeDoc.objet ?? objet.trim(),
      statut:
        maybeDoc.statut ??
        (isDraft
          ? FactureManutentionStatus.EN_ATTENTE_VALIDATION
          : FactureManutentionStatus.EN_ATTENTE_PAIEMENT),
      createdBy: maybeDoc.createdBy ?? req.user!.userId,
      createdAt: maybeDoc.createdAt ?? new Date(),
      transitId: transitId || undefined,
    };

    return res.status(201).json({
      success: true,
      data: responseData as unknown as IFactureManutention & {
        transitId?: string;
      },
      message: isDraft
        ? 'Manutention créée — en attente de validation admin'
        : 'Facture manutention créée — dossier transit généré',
    });
  } catch (error) {
    console.error('Create facture manutention error:', error);
    // Erreur d'unicité MongoDB (race condition entre le findOne et create) :
    // on transforme en 409 lisible côté client.
    const err = error as { code?: number; keyValue?: Record<string, unknown> };
    if (err?.code === 11000 && err.keyValue?.bl) {
      return res.status(409).json({
        success: false,
        error: `Une manutention existe déjà avec le BL ${String(err.keyValue.bl)}`,
      });
    }
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      // Lecture : ADMIN / ADMIN_TRANSIT / AGENT_TRANSIT / CAISSIER (consultation)
      return withAuth(getFacturesManutention, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
        UserRole.CAISSIER,
      ])(req, res);
    case 'POST':
      // Création : ADMIN / ADMIN_TRANSIT (statut EN_ATTENTE_PAIEMENT direct)
      // ou AGENT_TRANSIT (statut BROUILLON, doit être validé ensuite).
      return withAuth(createFactureManutention, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
