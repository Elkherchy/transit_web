import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit, Facture, Paiement, Client } from '@/models';
import {
  ApiResponse,
  ITransit,
  TransitStatus,
  PaginatedResponse,
  UserRole,
  FactureStatus,
  PaiementStatus,
} from '@/types';
import { AuthenticatedRequest, withAgentTransit, withTransitAccess } from '@/middleware/auth';
import mongoose from 'mongoose';

type TransitListRow = ITransit & {
  payeurFacture?: {
    _id: string;
    statut: FactureStatus;
    soumettrePaiementDisponible: boolean;
  };
};

// GET /api/transit - List all transit dossiers
async function getTransits(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<TransitListRow>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '10',
      statut,
      client,
      bl,
      search,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (statut) query.statut = statut;
    if (client) query.client = { $regex: client, $options: 'i' };
    if (bl) query.bl = { $regex: bl, $options: 'i' };

    if (search) {
      query.$or = [
        { client: { $regex: search, $options: 'i' } },
        { bl: { $regex: search, $options: 'i' } },
        { objet: { $regex: search, $options: 'i' } },
      ];
    }

    const isPayeur = req.user!.role === UserRole.USER_PAYEUR;
    let payeurFactures: { _id: mongoose.Types.ObjectId; transitId: string; statut: string }[] =
      [];

    if (isPayeur) {
      payeurFactures = await Facture.find({ payeurId: req.user!.userId })
        .select('_id transitId statut')
        .lean();
      if (payeurFactures.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            data: [],
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
          },
        });
      }
      const allowedIds = payeurFactures
        .map((f) => f.transitId)
        .filter((tid) => tid && mongoose.isValidObjectId(tid))
        .map((tid) => new mongoose.Types.ObjectId(tid));
      query._id = { $in: allowedIds };
    }

    const [transits, total] = await Promise.all([
      Transit.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transit.countDocuments(query),
    ]);

    let data: TransitListRow[] = transits as TransitListRow[];

    if (isPayeur && payeurFactures.length > 0) {
      const factureByTransitId = new Map<
        string,
        { _id: string; statut: FactureStatus }
      >();
      for (const f of payeurFactures) {
        factureByTransitId.set(String(f.transitId), {
          _id: String(f._id),
          statut: f.statut as FactureStatus,
        });
      }
      const factureIdsStr = payeurFactures.map((f) => String(f._id));
      const pending = await Paiement.find({
        factureId: { $in: factureIdsStr },
        statut: {
          $in: [PaiementStatus.EN_ATTENTE, PaiementStatus.EN_VALIDATION],
        },
      })
        .select('factureId')
        .lean();
      const pendingFactureIds = new Set(pending.map((p) => String(p.factureId)));

      data = (transits as ITransit[]).map((t) => {
        const pf = factureByTransitId.get(String(t._id));
        if (!pf) return t as TransitListRow;
        const soumettrePaiementDisponible =
          pf.statut === FactureStatus.EMIS && !pendingFactureIds.has(pf._id);
        return {
          ...t,
          payeurFacture: {
            _id: pf._id,
            statut: pf.statut,
            soumettrePaiementDisponible,
          },
        };
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get transits error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// POST /api/transit - Create new transit dossier
async function createTransit(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransit>>) {
  try {
    await connectDB();

    const { client, clientId, bl, objet, date, designations } = req.body;

    let clientNom = typeof client === 'string' ? client.trim() : '';
    let clientOid: mongoose.Types.ObjectId | null = null;

    if (clientId && mongoose.isValidObjectId(String(clientId))) {
      const cl = await Client.findById(clientId).lean();
      if (!cl?.actif) {
        return res.status(400).json({ success: false, error: 'Client introuvable' });
      }
      clientNom = cl.nom;
      clientOid = new mongoose.Types.ObjectId(String(clientId));
    }

    if (!clientNom || !bl || !objet) {
      return res.status(400).json({
        success: false,
        error: 'Client, BL et objet sont requis',
      });
    }

    // Create transit
    const transit = await Transit.create({
      client: clientNom,
      clientId: clientOid,
      bl,
      objet,
      date: date || new Date(),
      designations: designations || [],
      statut: TransitStatus.EN_COURS,
      createdBy: req.user!.userId,
    });

    return res.status(201).json({
      success: true,
      data: transit as ITransit,
      message: 'Dossier transit créé avec succès',
    });
  } catch (error) {
    console.error('Create transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withTransitAccess(getTransits)(req, res);
    case 'POST':
      return withAgentTransit(createTransit)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
