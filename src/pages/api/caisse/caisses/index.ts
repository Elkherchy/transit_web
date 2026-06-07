import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, User } from '@/models';
import {
  ApiResponse,
  CaisseKind,
  CaisseType,
  CompteType,
  ICaisseListItem,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse, getSoldeMapForCaisseIds } from '@/lib/caisse';

function resolveCompteType(doc: Record<string, unknown>): CompteType {
  const rawType = doc.type;
  if (rawType && Object.values(CompteType).includes(rawType as CompteType)) {
    return rawType as CompteType;
  }
  if (Boolean(doc.isDefaultGeneral)) return CompteType.GENERAL;
  if ((doc.kind as CaisseKind) === CaisseKind.USER) return CompteType.CAISSE;
  return CompteType.CAISSE;
}

function serializeCaisse(
  doc: Record<string, unknown>,
  solde: number,
  payeur?: { _id: string; nom: string; email: string }
): ICaisseListItem {
  return {
    _id: String(doc._id),
    nom: doc.nom as string,
    type: resolveCompteType(doc),
    kind: doc.kind as CaisseKind,
    payeurId: doc.payeurId ? String(doc.payeurId) : undefined,
    actif: Boolean(doc.actif),
    isDefaultGeneral: Boolean(doc.isDefaultGeneral),
    isDefaultBanque: Boolean(doc.isDefaultBanque),
    caisseType: (doc.caisseType as CaisseType | undefined) || undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    solde,
    payeur,
    statut: (doc.statut as 'EN_ATTENTE' | 'VALIDE' | undefined) || 'VALIDE',
    createdBy: doc.createdBy ? String(doc.createdBy) : undefined,
  };
}

async function listCaisses(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisseListItem[]>>) {
  try {
    await connectDB();
    await ensureDefaultGeneralCaisse();

    const u = req.user!;
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const requestedType = String(req.query.type || '').toUpperCase();

    if (requestedType === CompteType.BANQUE) {
      if (
        u.role !== UserRole.ADMIN &&
        u.role !== UserRole.COMPTABLE &&
        u.role !== UserRole.CAISSIER
      ) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }

      const banques = await Caisse.find({ type: CompteType.BANQUE, actif: true })
        .sort({ nom: 1 })
        .lean();
      const ids = banques.map((c) => c._id as mongoose.Types.ObjectId);
      const soldeMap = await getSoldeMapForCaisseIds(ids);
      const data: ICaisseListItem[] = banques.map((c) => {
        const id = String(c._id);
        return serializeCaisse(
          c as unknown as Record<string, unknown>,
          soldeMap.get(id) ?? 0
        );
      });

      return res.status(200).json({ success: true, data });
    }

    if (mine) {
      // Renvoie la caisse personnelle de l'utilisateur :
      //   - USER_PAYEUR              → caisse kind=USER liée à son payeurId
      //   - AGENT_RECEPTION_LOGISTIQUE → caisse kind=USER liée à son userId
      //   - CHAUFFEUR                → caisse kind=CHAUFFEUR liée à son userId
      //   - autres rôles             → tableau vide
      let own = null;
      if (
        u.role === UserRole.USER_PAYEUR ||
        u.role === UserRole.AGENT_RECEPTION_LOGISTIQUE
      ) {
        own = await Caisse.findOne({
          kind: CaisseKind.USER,
          payeurId: u.userId,
          actif: true,
        }).lean();
      } else if (u.role === UserRole.CHAUFFEUR) {
        own = await Caisse.findOne({
          kind: CaisseKind.CHAUFFEUR,
          chauffeurId: u.userId,
          actif: true,
        }).lean();
      } else {
        return res.status(200).json({ success: true, data: [] });
      }
      if (!own) {
        return res.status(200).json({ success: true, data: [] });
      }
      const oid = own._id as mongoose.Types.ObjectId;
      const soldeMap = await getSoldeMapForCaisseIds([oid]);
      return res.status(200).json({
        success: true,
        data: [
          serializeCaisse(
            own as unknown as Record<string, unknown>,
            soldeMap.get(String(oid)) ?? 0
          ),
        ],
      });
    }

    if (u.role === UserRole.CAISSIER) {
      // `?forDepense=1` : le caissier sélectionne une caisse à débiter pour
      // une dépense — on lui sert toutes les caisses TRANSIT VALIDÉES, sauf
      // celles des payeurs (kind=USER).
      if (
        req.query.forDepense === '1' ||
        req.query.forDepense === 'true'
      ) {
        const allTransit = await Caisse.find({
          actif: true,
          caisseType: CaisseType.TRANSIT,
          kind: { $ne: CaisseKind.USER },
          $or: [{ statut: 'VALIDE' }, { statut: { $exists: false } }],
        })
          .sort({ kind: 1, nom: 1 })
          .lean();
        const ids = allTransit.map(
          (c) => c._id as mongoose.Types.ObjectId
        );
        const soldeMap = await getSoldeMapForCaisseIds(ids);
        const data: ICaisseListItem[] = allTransit.map((c) => {
          // Le solde affiché est celui calculé depuis les transactions, ou
          // à défaut le champ `solde` persisté sur la caisse (utile pour les
          // comptes fraîchement créés sans transaction).
          const computed = soldeMap.get(String(c._id));
          const solde =
            typeof computed === 'number'
              ? computed
              : Number((c as { solde?: unknown }).solde) || 0;
          return serializeCaisse(
            c as unknown as Record<string, unknown>,
            solde
          );
        });
        return res.status(200).json({ success: true, data });
      }

      // Le caissier peut lister toutes les caisses payeur (kind=USER) pour
      // voir leurs soldes — utilisé par la page « Ma caisse » pour les cards.
      if (String(req.query.kind || '').toUpperCase() === CaisseKind.USER) {
        const userCaisses = await Caisse.find({
          kind: CaisseKind.USER,
          actif: true,
        })
          .sort({ nom: 1 })
          .lean();
        const userIds = userCaisses.map((c) => c._id as mongoose.Types.ObjectId);
        const soldeMap = await getSoldeMapForCaisseIds(userIds);
        const payeurIds = [
          ...new Set(
            userCaisses
              .map((c) => (c.payeurId ? String(c.payeurId) : ''))
              .filter(Boolean)
          ),
        ];
        const payeurs = await User.find({ _id: { $in: payeurIds } })
          .select('nom email')
          .lean();
        const payeurMap = new Map(payeurs.map((p) => [String(p._id), p]));
        const data: ICaisseListItem[] = userCaisses.map((c) => {
          const id = String(c._id);
          const p = c.payeurId ? payeurMap.get(String(c.payeurId)) : undefined;
          return serializeCaisse(
            c as unknown as Record<string, unknown>,
            soldeMap.get(id) ?? 0,
            p
              ? { _id: String(p._id), nom: p.nom, email: p.email }
              : undefined
          );
        });
        return res.status(200).json({ success: true, data });
      }

      const assigned = await Caisse.findOne({ caissierUserId: u.userId, actif: true }).lean();
      if (assigned) {
        const oid = assigned._id as mongoose.Types.ObjectId;
        const soldeMap = await getSoldeMapForCaisseIds([oid]);
        return res.status(200).json({
          success: true,
          data: [
            serializeCaisse(
              assigned as unknown as Record<string, unknown>,
              soldeMap.get(String(oid)) ?? 0
            ),
          ],
        });
      }

      const general = await Caisse.findOne({ isDefaultGeneral: true, actif: true }).lean();
      if (!general) {
        return res.status(200).json({ success: true, data: [] });
      }
      const oid = general._id as mongoose.Types.ObjectId;
      const soldeMap = await getSoldeMapForCaisseIds([oid]);
      return res.status(200).json({
        success: true,
        data: [
          serializeCaisse(
            general as unknown as Record<string, unknown>,
            soldeMap.get(String(oid)) ?? 0
          ),
        ],
      });
    }

    if (
      u.role !== UserRole.ADMIN &&
      u.role !== UserRole.ADMIN_TRANSIT &&
      u.role !== UserRole.ADMIN_LOGISTIQUE &&
      u.role !== UserRole.AGENT_TRANSIT &&
      u.role !== UserRole.COMPTABLE
    ) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    // Par défaut on exclut les caisses des payeurs (kind=USER) ; mettre
    // `?includeUser=true` pour les inclure (utilisé par la page Utilisateurs
    // pour afficher la caisse liée à chaque payeur).
    const includeUser = req.query.includeUser === 'true';
    const baseFilter: Record<string, unknown> = includeUser
      ? {}
      : { kind: { $ne: CaisseKind.USER } };

    // Scope par domaine (Transit/Logistique) :
    // - admin scopés → caisseType automatique selon leur rôle
    // - super-ADMIN ou COMPTABLE → respect du paramètre `caisseType` si fourni
    if (u.role === UserRole.ADMIN_TRANSIT) {
      baseFilter.caisseType = CaisseType.TRANSIT;
    } else if (u.role === UserRole.ADMIN_LOGISTIQUE) {
      baseFilter.caisseType = CaisseType.LOGISTIQUE;
    } else if (
      typeof req.query.caisseType === 'string' &&
      Object.values(CaisseType).includes(req.query.caisseType as CaisseType)
    ) {
      baseFilter.caisseType = req.query.caisseType;
    }

    // Visibilité des comptes EN_ATTENTE :
    //   - ADMIN / ADMIN_TRANSIT / ADMIN_LOGISTIQUE : voient tout
    //   - AGENT_TRANSIT : voit ses propres comptes en attente
    //   - autres rôles (COMPTABLE) : masquage des EN_ATTENTE
    if (
      u.role !== UserRole.ADMIN &&
      u.role !== UserRole.ADMIN_TRANSIT &&
      u.role !== UserRole.ADMIN_LOGISTIQUE
    ) {
      if (u.role === UserRole.AGENT_TRANSIT) {
        baseFilter.$or = [
          { statut: { $ne: 'EN_ATTENTE' } },
          { statut: 'EN_ATTENTE', createdBy: u.userId },
        ];
      } else {
        baseFilter.statut = { $ne: 'EN_ATTENTE' };
      }
    }

    const caisses = await Caisse.find(baseFilter)
      .sort({ kind: 1, nom: 1 })
      .lean();
    const ids = caisses.map((c) => c._id as mongoose.Types.ObjectId);
    const soldeMap = await getSoldeMapForCaisseIds(ids);

    const payeurIds = [
      ...new Set(caisses.filter((c) => c.kind === CaisseKind.USER && c.payeurId).map((c) => c.payeurId as string)),
    ];
    const payeurs = await User.find({ _id: { $in: payeurIds } })
      .select('nom email')
      .lean();
    const payeurMap = new Map(payeurs.map((p) => [String(p._id), p]));

    const data: ICaisseListItem[] = caisses.map((c) => {
      const id = String(c._id);
      const p = c.payeurId ? payeurMap.get(String(c.payeurId)) : undefined;
      return serializeCaisse(
        c as unknown as Record<string, unknown>,
        soldeMap.get(id) ?? 0,
        p
          ? { _id: String(p._id), nom: p.nom, email: p.email }
          : undefined
      );
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('List caisses error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createCaisse(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisseListItem>>) {
  try {
    await connectDB();

    const { nom, kind, type, isDefaultGeneral, caisseType: bodyCaisseType } =
      req.body;

    if (!nom || !kind) {
      return res.status(400).json({ success: false, error: 'Nom et type requis' });
    }

    if (!Object.values(CaisseKind).includes(kind)) {
      return res.status(400).json({ success: false, error: 'Type de caisse invalide' });
    }

    const compteType =
      type && Object.values(CompteType).includes(type)
        ? (type as CompteType)
        : CompteType.CAISSE;

    if (kind === CaisseKind.USER) {
      return res.status(400).json({
        success: false,
        error: 'Les caisses payeur ne sont plus autorisées',
      });
    }

    // Détermination du caisseType :
    // - admin scopé → forcé sur son domaine (impossible de créer hors-scope)
    // - super-ADMIN/COMPTABLE → respecte le body, défaut TRANSIT
    let resolvedCaisseType: CaisseType | undefined;
    if (req.user?.role === UserRole.ADMIN_TRANSIT) {
      resolvedCaisseType = CaisseType.TRANSIT;
    } else if (req.user?.role === UserRole.ADMIN_LOGISTIQUE) {
      resolvedCaisseType = CaisseType.LOGISTIQUE;
    } else if (
      bodyCaisseType &&
      Object.values(CaisseType).includes(bodyCaisseType as CaisseType)
    ) {
      resolvedCaisseType = bodyCaisseType as CaisseType;
    }

    // Garde-fou : un admin scopé ne peut pas créer une caisse GENERAL
    // (il y en a déjà une par domaine, créée par la migration).
    if (
      kind === CaisseKind.GENERAL &&
      compteType === CompteType.GENERAL &&
      (req.user?.role === UserRole.ADMIN_TRANSIT ||
        req.user?.role === UserRole.ADMIN_LOGISTIQUE)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Création d\'une caisse GENERAL réservée au super-administrateur',
      });
    }

    let setDefault = Boolean(isDefaultGeneral) || compteType === CompteType.GENERAL;
    if (kind === CaisseKind.GENERAL && resolvedCaisseType) {
      const countGen = await Caisse.countDocuments({
        kind: CaisseKind.GENERAL,
        type: CompteType.GENERAL,
        caisseType: resolvedCaisseType,
        actif: true,
      });
      if (countGen === 0) setDefault = true;
    }

    if (setDefault && kind === CaisseKind.GENERAL && resolvedCaisseType) {
      await Caisse.updateMany(
        { caisseType: resolvedCaisseType },
        { $set: { isDefaultGeneral: false } }
      );
    }

    // AGENT_TRANSIT : crée le compte en EN_ATTENTE (non utilisable tant que
    // l'ADMIN_TRANSIT n'a pas validé). Les admins créent en VALIDE direct.
    const isAgent = req.user?.role === UserRole.AGENT_TRANSIT;
    const doc = await Caisse.create({
      nom: String(nom).trim(),
      type: compteType,
      kind,
      caisseType: resolvedCaisseType,
      payeurId: undefined,
      actif: true,
      isDefaultGeneral:
        setDefault && kind === CaisseKind.GENERAL && compteType === CompteType.GENERAL,
      statut: isAgent ? 'EN_ATTENTE' : 'VALIDE',
      createdBy: req.user?.userId,
      valideBy: isAgent ? null : req.user?.userId,
      valideAt: isAgent ? null : new Date(),
    });

    const soldeMap = await getSoldeMapForCaisseIds([doc._id as mongoose.Types.ObjectId]);
    const item = serializeCaisse(
      doc.toObject() as unknown as Record<string, unknown>,
      soldeMap.get(String(doc._id)) ?? 0
    );

    return res.status(201).json({
      success: true,
      data: item,
      message: isAgent
        ? 'Compte créé — en attente de validation par l\'admin transit'
        : 'Caisse créée',
    });
  } catch (error) {
    console.error('Create caisse error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(listCaisses)(req, res);
    case 'POST':
      return withAuth(createCaisse, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.ADMIN_LOGISTIQUE,
        UserRole.AGENT_TRANSIT,
        UserRole.COMPTABLE,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
