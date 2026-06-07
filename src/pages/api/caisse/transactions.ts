import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, OperationValidation, Transaction, User } from '@/models';
import { OperationType } from '@/models/OperationValidation';
import {
  ApiResponse,
  CaisseKind,
  CaisseType,
  ITransaction,
  PaginatedResponse,
  TransactionType,
  UserRole,
} from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse, mirrorDescriptionForGeneral } from '@/lib/caisse';
function serializeTx(
  doc: Record<string, unknown>,
  extra: { caisseNom?: string; caisseKind?: string } = {}
): ITransaction & { caisseNom?: string; caisseKind?: string } {
  return {
    _id: String(doc._id),
    caisseId: String(doc.caisseId),
    type: doc.type as ITransaction['type'],
    montant: doc.montant as number,
    description: doc.description as string,
    date: doc.date as Date,
    reference: doc.reference as string | undefined,
    userId: doc.userId as string,
    mirrorSourceId: doc.mirrorSourceId ? String(doc.mirrorSourceId) : undefined,
    sourcePaiementId: doc.sourcePaiementId
      ? String(doc.sourcePaiementId)
      : undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    ...(extra.caisseNom ? { caisseNom: extra.caisseNom } : {}),
    ...(extra.caisseKind ? { caisseKind: extra.caisseKind } : {}),
  };
}

function assertCanAccessCaisse(
  userId: string,
  role: UserRole,
  caisseDoc: {
    kind: CaisseKind;
    caisseType?: CaisseType;
    payeurId?: string;
    caissierUserId?: string;
    chauffeurId?: string;
    isDefaultGeneral?: boolean;
  }
): boolean {
  if (role === UserRole.ADMIN || role === UserRole.COMPTABLE) return true;
  // Admin scopés : accès aux transactions des caisses de leur domaine.
  if (role === UserRole.ADMIN_TRANSIT) {
    return caisseDoc.caisseType === CaisseType.TRANSIT;
  }
  if (role === UserRole.AGENT_TRANSIT) {
    // AGENT_TRANSIT : lecture des transactions des caisses transit (générale,
    // banques, payeurs) — utile pour consulter l'historique avant de soumettre
    // un mouvement à validation.
    return caisseDoc.caisseType === CaisseType.TRANSIT;
  }
  if (role === UserRole.ADMIN_LOGISTIQUE) {
    return caisseDoc.caisseType === CaisseType.LOGISTIQUE;
  }
  if (role === UserRole.CAISSIER) {
    // Le caissier voit sa propre caisse, la caisse générale, et les caisses
    // payeur (historique des alimentations qu'il a effectuées).
    return (
      caisseDoc.caissierUserId === userId ||
      (caisseDoc.kind === CaisseKind.GENERAL && Boolean(caisseDoc.isDefaultGeneral)) ||
      caisseDoc.kind === CaisseKind.USER
    );
  }
  if (
    role === UserRole.USER_PAYEUR ||
    role === UserRole.AGENT_RECEPTION_LOGISTIQUE
  ) {
    return caisseDoc.kind === CaisseKind.USER && caisseDoc.payeurId === userId;
  }
  if (role === UserRole.CHAUFFEUR) {
    return (
      caisseDoc.kind === CaisseKind.CHAUFFEUR &&
      String(caisseDoc.chauffeurId || '') === userId
    );
  }
  return false;
}

async function getTransactions(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<ITransaction>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '10',
      caisseId,
      type,
      dateDebut,
      dateFin,
      search,
      sourcePaiementId,
    } = req.query;

    if (!caisseId || typeof caisseId !== 'string' || !mongoose.isValidObjectId(caisseId)) {
      return res.status(400).json({ success: false, error: 'caisseId requis et valide' });
    }

    const caisseDoc = await Caisse.findById(caisseId).lean();
    if (!caisseDoc || !caisseDoc.actif) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    const u = req.user!;
    if (!assertCanAccessCaisse(u.userId, u.role, caisseDoc)) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Si la caisse demandée est la caisse GÉNÉRALE du domaine, on inclut
    // aussi les transactions des caisses PAYEURS (kind=USER) du même domaine —
    // l'admin/agent voit ainsi en un coup d'œil toutes les opérations des
    // payeurs (paiements de désignations, alimentations reçues, etc.) dans
    // la même liste que les mouvements directs sur la générale.
    const isGeneral =
      caisseDoc.kind === CaisseKind.GENERAL &&
      Boolean(caisseDoc.isDefaultGeneral);
    const caisseInfoMap = new Map<
      string,
      { nom: string; kind: string }
    >();
    caisseInfoMap.set(String(caisseDoc._id), {
      nom: caisseDoc.nom,
      kind: String(caisseDoc.kind),
    });

    let caisseIds: mongoose.Types.ObjectId[] = [
      new mongoose.Types.ObjectId(caisseId),
    ];
    if (isGeneral && caisseDoc.caisseType) {
      // On inclut les caisses USER dont :
      //   - caisseType correspond explicitement, OU
      //   - caisseType n'est pas défini (legacy : avant que le champ soit
      //     systématiquement enregistré, les caisses payeurs étaient
      //     implicitement TRANSIT).
      const userCaisseFilter: Record<string, unknown> = {
        kind: CaisseKind.USER,
        actif: true,
      };
      if (caisseDoc.caisseType === CaisseType.TRANSIT) {
        userCaisseFilter.$or = [
          { caisseType: CaisseType.TRANSIT },
          { caisseType: { $exists: false } },
          { caisseType: null },
        ];
      } else {
        userCaisseFilter.caisseType = caisseDoc.caisseType;
      }
      const payeurCaisses = await Caisse.find(userCaisseFilter)
        .select('_id nom kind')
        .lean();
      for (const c of payeurCaisses) {
        caisseInfoMap.set(String(c._id), {
          nom: c.nom,
          kind: String(c.kind),
        });
        caisseIds.push(c._id as mongoose.Types.ObjectId);
      }
    }

    // Pour la caisse GÉNÉRALE, on filtre en plus les opérations payeurs :
    // seules celles validées par le caissier (existence d'une OperationValidation
    // PAYEUR_PAIEMENT, quel que soit son statut) apparaissent. Les paiements
    // de désignations non encore validés par le caissier restent invisibles
    // dans la liste de la générale.
    let query: Record<string, unknown>;
    if (isGeneral && caisseIds.length > 1) {
      const payeurCaisseIds = caisseIds.slice(1); // [0] = générale
      const generalCaisseId = caisseIds[0];

      const validatedOps = await OperationValidation.find({
        opType: OperationType.PAYEUR_PAIEMENT,
      })
        .select('opId')
        .lean();
      const validatedIds = Array.from(
        new Set(
          validatedOps
            .map((v) => String((v as { opId?: unknown }).opId || ''))
            .filter(Boolean)
        )
      );

      if (validatedIds.length === 0) {
        // Aucun paiement payeur validé → on ne renvoie que la générale.
        query = { caisseId: generalCaisseId };
      } else {
        // Regex anchored sur la fin du `reference` (format
        // `transit-{transitId}-des-{designationId}`) pour matcher uniquement
        // les paiements de désignations validées par le caissier.
        const escaped = validatedIds.map((id) =>
          id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        );
        const refRegex = new RegExp(`-des-(?:${escaped.join('|')})$`);
        query = {
          $or: [
            { caisseId: generalCaisseId },
            {
              caisseId: { $in: payeurCaisseIds },
              reference: refRegex,
            },
          ],
        };
      }
    } else {
      query =
        caisseIds.length === 1
          ? { caisseId: caisseIds[0] }
          : { caisseId: { $in: caisseIds } };
    }
    if (type) query.type = type;

    if (dateDebut || dateFin) {
      query.date = {};
      if (dateDebut) (query.date as Record<string, Date>).$gte = new Date(dateDebut as string);
      if (dateFin) (query.date as Record<string, Date>).$lte = new Date(dateFin as string);
    }

    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
      ];
    }

    if (sourcePaiementId && typeof sourcePaiementId === 'string') {
      query.sourcePaiementId = sourcePaiementId;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort({ date: -1 }).skip(skip).limit(limitNum).lean(),
      Transaction.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        data: transactions.map((t) => {
          const cid = String(
            (t as unknown as { caisseId?: unknown }).caisseId || ''
          );
          const info = caisseInfoMap.get(cid);
          return serializeTx(
            t as unknown as Record<string, unknown>,
            info ? { caisseNom: info.nom, caisseKind: info.kind } : {}
          );
        }),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createTransaction(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ITransaction>>
) {
  try {
    await connectDB();

    const { caisseId, type, montant, description, date, reference } = req.body;

    if (!caisseId || !type || !montant || !description) {
      return res.status(400).json({
        success: false,
        error: 'caisseId, type, montant et description sont requis',
      });
    }

    if (!mongoose.isValidObjectId(caisseId)) {
      return res.status(400).json({ success: false, error: 'caisseId invalide' });
    }

    if (!Object.values(TransactionType).includes(type)) {
      return res.status(400).json({ success: false, error: 'Type de transaction invalide' });
    }

    if (montant <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Le montant doit être supérieur à zéro',
      });
    }

    const caisseDoc = await Caisse.findById(caisseId);
    if (!caisseDoc || !caisseDoc.actif) {
      return res.status(404).json({ success: false, error: 'Caisse introuvable' });
    }

    const u = req.user!;
    if (!assertCanAccessCaisse(u.userId, u.role, caisseDoc)) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    const primary = await Transaction.create({
      caisseId: caisseDoc._id,
      type,
      montant,
      description: String(description).trim(),
      date: date ? new Date(date) : new Date(),
      reference: reference ? String(reference).trim() : undefined,
      userId: u.userId,
    });

    if (caisseDoc.kind === CaisseKind.USER) {
      await ensureDefaultGeneralCaisse();
      const gen = await Caisse.findOne({ isDefaultGeneral: true, actif: true });
      if (gen && String(gen._id) !== String(caisseDoc._id)) {
        const payeurUser = caisseDoc.payeurId
          ? await User.findById(caisseDoc.payeurId).select('nom').lean()
          : null;
        const nom = payeurUser?.nom || 'Payeur';
        await Transaction.create({
          caisseId: gen._id,
          type,
          montant,
          description: mirrorDescriptionForGeneral(nom, String(description).trim()),
          date: primary.date,
          reference: reference ? String(reference).trim() : undefined,
          userId: u.userId,
          mirrorSourceId: primary._id,
          sourcePaiementId: primary.sourcePaiementId,
        });
      }
    }

    const fresh = await Transaction.findById(primary._id).lean();
    return res.status(201).json({
      success: true,
      data: serializeTx(fresh as unknown as Record<string, unknown>),
      message: 'Transaction créée',
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getTransactions)(req, res);
    case 'POST':
      return withAuth(createTransaction)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
