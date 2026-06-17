import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit, Facture, Paiement, Client } from '@/models';
import {
  ApiResponse,
  IFacture,
  FactureStatus,
  TransitStatus,
  PaginatedResponse,
  PaiementStatus,
} from '@/types';
import { withAuth, AuthenticatedRequest, withAgentTransit, withComptable, withTransitAccess } from '@/middleware/auth';
import { UserRole } from '@/types';
import { serializeFacture } from '@/lib/serializeFacture';
import mongoose from 'mongoose';

// Generate facture number
function generateFactureNumero(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `F-${year}${month}-${random}`;
}

// GET /api/transit/factures - List all factures
async function getFactures(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<PaginatedResponse<IFacture>>>) {
  try {
    await connectDB();

    const { 
      page = '1', 
      limit = '10', 
      statut,
      clientId,
      search 
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (req.user!.role === UserRole.USER_PAYEUR) {
      query.payeurId = new mongoose.Types.ObjectId(req.user!.userId);
    }

    if (clientId && typeof clientId === 'string' && mongoose.isValidObjectId(clientId)) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    }

    if (statut) query.statut = statut;

    const [facturesRaw, total] = await Promise.all([
      Facture.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('payeurId', 'nom email')
        .lean(),
      Facture.countDocuments(query),
    ]);

    const idStrings = facturesRaw.map((f) => String(f._id));
    const factureIdsAvecPaiementActif = await Paiement.distinct('factureId', {
      factureId: { $in: idStrings },
      statut: { $nin: [PaiementStatus.REJETE] },
    });
    const verrouPayeur = new Set(
      factureIdsAvecPaiementActif.map((fid) => String(fid))
    );

    const transitIds = Array.from(
      new Set(
        facturesRaw
          .map((f) => String(f.transitId || ''))
          .filter((v) => v && mongoose.isValidObjectId(v))
      )
    );
    const transits = transitIds.length
      ? await Transit.find({ _id: { $in: transitIds } })
          .select('bl client objet')
          .lean()
      : [];
    const transitMap = new Map(
      transits.map((t) => [
        String(t._id),
        { bl: t.bl, client: t.client, objet: t.objet },
      ])
    );

    // Pour les factures créées directement par le caissier (sans transit réel),
    // on récupère le nom du client via Facture.clientId → Client.nom.
    const clientIds = Array.from(
      new Set(
        facturesRaw
          .map((f) => String((f as { clientId?: unknown }).clientId || ''))
          .filter((v) => v && mongoose.isValidObjectId(v))
      )
    );
    const clients = clientIds.length
      ? await Client.find({ _id: { $in: clientIds } })
          .select('nom')
          .lean()
      : [];
    const clientMap = new Map(
      clients.map((c) => [String(c._id), String(c.nom || '')])
    );

    const factures = facturesRaw.map((f) => {
      const base = serializeFacture(f as Record<string, unknown>);
      const transitLinked = transitMap.get(String(f.transitId || ''));
      const fClientId = String((f as { clientId?: unknown }).clientId || '');
      const clientNom = fClientId ? clientMap.get(fClientId) : undefined;
      return {
        ...base,
        bl: base.bl || transitLinked?.bl,
        transitClient: transitLinked?.client || clientNom,
        transitObjet: transitLinked?.objet,
        payeurModifiable: !verrouPayeur.has(String(f._id)),
      } as IFacture;
    });

    return res.status(200).json({
      success: true,
      data: {
        data: factures as IFacture[],
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get factures error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// POST /api/transit/factures - Create new facture
async function createFacture(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IFacture>>) {
  try {
    await connectDB();

    const { transitId, interet = 0 } = req.body;

    // Validation
    if (!transitId || !mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID de transit invalide' 
      });
    }

    // Check transit exists
    const transit = await Transit.findById(transitId);
    if (!transit) {
      return res.status(404).json({ 
        success: false, 
        error: 'Dossier transit non trouvé' 
      });
    }

    // Check if facture already exists
    const existingFacture = await Facture.findOne({ transitId });
    if (existingFacture) {
      return res.status(400).json({ 
        success: false, 
        error: 'Une facture existe déjà pour ce dossier' 
      });
    }

    // Calculate total from designations
    const designations = transit.designations || [];
    let totalOperations = 0;
    for (const d of designations) {
      totalOperations += (d as { montant?: number }).montant || 0;
    }

    const interetNum = Math.max(0, Number(interet) || 0);

    // Create facture
    const facture = await Facture.create({
      transitId,
      bl: transit.bl,
      numero: generateFactureNumero(),
      totalOperations,
      interet: interetNum,
      totalFinal: totalOperations + interetNum,
      statut: FactureStatus.BROUILLON,
    });

    // Dossier avec facture générée : visible dans la liste des factures
    transit.statut = TransitStatus.FACTURE_EMISE;
    transit.interet = interetNum;
    await transit.save({ validateModifiedOnly: true });

    return res.status(201).json({
      success: true,
      data: facture as IFacture,
      message: 'Facture créée avec succès',
    });
  } catch (error) {
    console.error('Create facture error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withTransitAccess(getFactures)(req, res);
    case 'POST':
      return withAuth(createFacture, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
