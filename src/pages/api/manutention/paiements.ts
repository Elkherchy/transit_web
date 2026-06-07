import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { ManutentionPaiement, FactureManutention, User, Transaction, Caisse } from '@/models';
import {
  ApiResponse,
  IManutentionPaiement,
  ManutentionPaiementStatus,
  FactureManutentionStatus,
  PaginatedResponse,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withCaissier, withAuth } from '@/middleware/auth';
import { recordManutentionPaiementValidatedToCaisse } from '@/lib/caisse';

// GET /api/manutention/paiements - List all paiements manutention
async function getPaiementsManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IManutentionPaiement>>>
) {
  try {
    await connectDB();

    const {
      page = '1',
      limit = '10',
      statut,
      factureManutentionId,
      mine,
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const query: Record<string, unknown> = {};

    if (statut) query.statut = statut;
    if (factureManutentionId) query.factureManutentionId = factureManutentionId;

    // Filtrer par payeur si "mine" est true et que ce n'est pas un profil interne
    const isInternalUser =
      req.user!.role === UserRole.CAISSIER ||
      req.user!.role === UserRole.ADMIN ||
      req.user!.role === UserRole.COMPTABLE;
    if (mine === 'true' && !isInternalUser) {
      query.payeurId = req.user!.userId;
    }

    const [paiements, total] = await Promise.all([
      ManutentionPaiement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ManutentionPaiement.countDocuments(query),
    ]);

    const factureIds = Array.from(
      new Set(
        paiements
          .map((paiement) => String(paiement.factureManutentionId || ''))
          .filter(Boolean)
      )
    );

    const sourcePaiementIds = paiements.map((paiement) => `manutention-${String(paiement._id)}`);

    const [factures, linkedTransactions] = await Promise.all([
      factureIds.length
        ? FactureManutention.find({ _id: { $in: factureIds } }).select('bl createdBy').lean()
        : Promise.resolve([]),
      sourcePaiementIds.length
        ? Transaction.find({ sourcePaiementId: { $in: sourcePaiementIds } })
            .select('sourcePaiementId caisseId')
            .lean()
        : Promise.resolve([]),
    ]);

    const factureMap = new Map(
      factures.map((facture) => [
        String(facture._id),
        { bl: facture.bl, createdBy: String(facture.createdBy || '') },
      ])
    );

    const caisseIds = Array.from(
      new Set(linkedTransactions.map((transaction) => String(transaction.caisseId)))
    );

    const caisses = caisseIds.length
      ? await Caisse.find({ _id: { $in: caisseIds } }).select('nom').lean()
      : [];

    const caisseMap = new Map(
      caisses.map((caisse) => [String(caisse._id), { _id: String(caisse._id), nom: caisse.nom }])
    );

    const transactionMap = new Map(
      linkedTransactions.map((transaction) => [
        String(transaction.sourcePaiementId),
        caisseMap.get(String(transaction.caisseId)),
      ])
    );

    const creatorIds = Array.from(
      new Set(
        factures
          .map((facture) => String(facture.createdBy || ''))
          .filter(Boolean)
      )
    );

    // Récupérer les noms des payeurs et valideurs
    const userIds = Array.from(
      new Set([
        ...paiements.map((p) => String(p.payeurId || '')),
        ...paiements.map((p) => String(p.validePar || '')),
      ].filter(Boolean))
    );

    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('nom email').lean()
      : [];

    const userMap = new Map(
      users.map((u) => [String(u._id), { nom: u.nom, email: u.email }])
    );

    const creatorCaisses = creatorIds.length
      ? await Caisse.find({ caissierUserId: { $in: creatorIds }, actif: true })
          .select('nom caissierUserId')
          .lean()
      : [];

    const creatorCaisseMap = new Map(
      creatorCaisses.map((caisse) => [
        String(caisse.caissierUserId),
        { _id: String(caisse._id), nom: caisse.nom },
      ])
    );

    return res.status(200).json({
      success: true,
      data: {
        data: paiements.map((paiement) => {
          const linkedCaisse =
            transactionMap.get(`manutention-${String(paiement._id)}`) ||
            creatorCaisseMap.get(
              factureMap.get(String(paiement.factureManutentionId))?.createdBy || ''
            );

          return {
            ...paiement,
            factureManutention: factureMap.get(String(paiement.factureManutentionId)),
            caisseLiee: linkedCaisse,
            payeur: userMap.get(String(paiement.payeurId)) || null,
            valideParUser: paiement.validePar ? (userMap.get(String(paiement.validePar)) || null) : null,
          };
        }) as IManutentionPaiement[],
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get paiements manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// POST /api/manutention/paiements - Create new paiement manutention (par payeur)
async function createPaiementManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IManutentionPaiement>>
) {
  try {
    await connectDB();

    const { factureManutentionId, montant, datePaiement, recuUrl, recuFilename } = req.body;

    if (!factureManutentionId || !montant || !datePaiement) {
      return res.status(400).json({
        success: false,
        error: 'Facture manutention, montant et date de paiement sont requis',
      });
    }

    // Vérifier que la facture existe
    const facture = await FactureManutention.findById(factureManutentionId);
    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture manutention introuvable',
      });
    }

    // Vérifier que le payeur est bien désigné
    const isInternalUser =
      req.user!.role === UserRole.CAISSIER ||
      req.user!.role === UserRole.ADMIN ||
      req.user!.role === UserRole.COMPTABLE;
    if (!isInternalUser && facture.payeurId?.toString() !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas le payeur désigné pour cette facture',
      });
    }

    // Vérifier que la facture est en attente de paiement
    if (facture.statut !== FactureManutentionStatus.EN_ATTENTE_PAIEMENT &&
        facture.statut !== FactureManutentionStatus.PAIEMENT_PARTIEL) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture n\'est pas en attente de paiement',
      });
    }

    const paiement = await ManutentionPaiement.create({
      factureManutentionId,
      montant,
      datePaiement: new Date(datePaiement),
      recuUrl: recuUrl || null,
      recuFilename: recuFilename || null,
      statut: ManutentionPaiementStatus.EN_VALIDATION,
      payeurId: isInternalUser ? facture.payeurId : req.user!.userId,
    });

    // Mettre à jour le statut de la facture
    await FactureManutention.findByIdAndUpdate(factureManutentionId, {
      statut: FactureManutentionStatus.PAYE_EN_ATTENTE_VALIDATION,
    });

    return res.status(201).json({
      success: true,
      data: paiement as IManutentionPaiement,
      message: 'Paiement déclaré avec succès, en attente de validation',
    });
  } catch (error) {
    console.error('Create paiement manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getPaiementsManutention, [
        UserRole.ADMIN,
        UserRole.CAISSIER,
        UserRole.COMPTABLE,
        UserRole.USER_PAYEUR,
      ])(req, res);
    case 'POST':
      // Payeur ou caissier peuvent créer un paiement
      return withAuth(createPaiementManutention, [UserRole.ADMIN, UserRole.CAISSIER, UserRole.USER_PAYEUR])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
