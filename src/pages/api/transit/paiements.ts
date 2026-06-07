import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Facture, Paiement } from '@/models';
import {
  ApiResponse,
  IPaiement,
  PaiementStatus,
  FactureStatus,
  PaginatedResponse,
  UserRole,
} from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';

// GET /api/transit/paiements - List all paiements
async function getPaiements(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<PaginatedResponse<IPaiement>>>) {
  try {
    await connectDB();

    const { 
      page = '1', 
      limit = '10', 
      statut,
      factureId 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = {};
    
    // User payeur can only see their own paiements
    if (req.user!.role === UserRole.USER_PAYEUR) {
      query.payeurId = req.user!.userId;
    }

    if (statut) query.statut = statut;
    if (factureId) query.factureId = factureId;

    const [paiements, total] = await Promise.all([
      Paiement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Paiement.countDocuments(query),
    ]);

    const factureIds = Array.from(
      new Set(paiements.map((p) => String(p.factureId || '')).filter(Boolean))
    );
    const factures = factureIds.length
      ? await Facture.find({ _id: { $in: factureIds } })
          .select('_id numero')
          .lean()
      : [];
    const factureNumeroById = new Map(
      factures.map((f) => [String(f._id), String(f.numero || '')])
    );

    const paiementsWithNumero = paiements.map((p) => ({
      ...p,
      factureNumero:
        factureNumeroById.get(String(p.factureId || '')) || undefined,
    }));

    return res.status(200).json({
      success: true,
      data: {
        data: paiementsWithNumero as IPaiement[],
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get paiements error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

/**
 * POST JSON réservé au flux en deux temps (EN_ATTENTE puis upload reçu).
 * Pour un envoi en une fois (montant + reçu), utiliser POST /api/transit/paiements/soumettre-payeur.
 */
async function createPaiement(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IPaiement>>) {
  try {
    await connectDB();

    const { factureId, montant, datePaiement } = req.body;

    if (!factureId || montant === undefined || montant === null) {
      return res.status(400).json({
        success: false,
        error: 'Facture ID et montant sont requis',
      });
    }

    const facture = await Facture.findById(factureId);
    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture non trouvée',
      });
    }

    if (String(facture.payeurId || '') !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'Vous n’êtes pas le payeur désigné pour cette facture',
      });
    }

    if (facture.statut !== FactureStatus.EMIS) {
      return res.status(400).json({
        success: false,
        error: 'La facture doit être émise pour déclarer un paiement',
      });
    }

    const pending = await Paiement.countDocuments({
      factureId: String(facture._id),
      statut: { $in: [PaiementStatus.EN_ATTENTE, PaiementStatus.EN_VALIDATION] },
    });
    if (pending > 0) {
      return res.status(400).json({
        success: false,
        error: 'Un paiement est déjà en cours pour cette facture',
      });
    }

    const m = typeof montant === 'number' ? montant : parseFloat(String(montant).replace(',', '.'));
    if (Number.isNaN(m) || m <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    const paiement = await Paiement.create({
      factureId: String(facture._id),
      montant: m,
      datePaiement: datePaiement ? new Date(datePaiement) : new Date(),
      statut: PaiementStatus.EN_ATTENTE,
      payeurId: req.user!.userId,
    });

    return res.status(201).json({
      success: true,
      data: paiement as IPaiement,
      message: 'Paiement créé — ajoutez le reçu pour envoyer en validation',
    });
  } catch (error) {
    console.error('Create paiement error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getPaiements)(req, res);
    case 'POST':
      return withAuth(createPaiement, [UserRole.USER_PAYEUR])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
