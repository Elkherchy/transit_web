import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Client, Facture, Transaction, Caisse, Transit } from '@/models';
import {
  ApiResponse,
  IFacture,
  ITransaction,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse } from '@/lib/caisse';

interface ClientDetail {
  client: {
    _id: string;
    nom: string;
    telephone?: string;
    email?: string;
    caisseId?: string;
    actif: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  };
  caisse?: { _id: string; nom: string; solde: number };
  factures: IFacture[];
  transactions: ITransaction[];
}

async function getClient(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ClientDetail>>
) {
  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    const c = await Client.findById(id).lean();
    if (!c) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }

    // Récupère la caisse client. Sécurité supplémentaire : si Client.caisseId
    // est défini mais pointe vers une caisse différente que celle réellement
    // associée au client (par exemple créée à la volée par mouvement-pending
    // avant que Client.caisseId soit set), on agrège les transactions des
    // DEUX (typique : Client.caisseId stocké lors de la validation + Caisse
    // créée par mouvement-pending qui partage le même clientId).
    const declaredCaisseId = c.caisseId
      ? String(c.caisseId)
      : String(await ensureClientCaisse(id, c.nom));
    if (!c.caisseId) {
      await Client.updateOne({ _id: id }, { $set: { caisseId: declaredCaisseId } });
    }

    // Trouve toutes les caisses liées au client (par clientId field) — robuste
    // contre les doublons éventuels.
    const allClientCaisses = await Caisse.find({
      $or: [
        { _id: new mongoose.Types.ObjectId(declaredCaisseId) },
        { kind: 'CLIENT', clientId: String(id) },
      ],
    })
      .select('_id nom solde')
      .lean();

    const caisseObjectIds = allClientCaisses.map(
      (c) => c._id as mongoose.Types.ObjectId
    );

    // La caisse principale affichée (solde) reste celle déclarée pour rester
    // cohérent avec le reste de l'app.
    const caisse =
      allClientCaisses.find((c) => String(c._id) === declaredCaisseId) ||
      allClientCaisses[0] ||
      null;

    const [facturesRaw, transactions] = await Promise.all([
      Facture.find({ clientId: id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Transaction.find({
        caisseId:
          caisseObjectIds.length === 1
            ? caisseObjectIds[0]
            : { $in: caisseObjectIds },
      })
        .sort({ date: -1 })
        .limit(100)
        .lean(),
    ]);

    // Populate transitObjet from Transit for each facture
    const transitIds = facturesRaw
      .map((f) => f.transitId)
      .filter(Boolean);
    const transits = transitIds.length
      ? await Transit.find({ _id: { $in: transitIds } })
          .select('_id objet')
          .lean()
      : [];
    const transitObjMap = new Map(
      transits.map((t) => [String(t._id), (t as { objet?: string }).objet || ''])
    );
    const factures = facturesRaw.map((f) => ({
      ...f,
      transitObjet: transitObjMap.get(String(f.transitId)) || undefined,
    }));

    return res.status(200).json({
      success: true,
      data: {
        client: {
          _id: String(c._id),
          nom: c.nom,
          telephone: c.telephone ? String(c.telephone) : undefined,
          email: c.email ? String(c.email) : undefined,
          caisseId: declaredCaisseId,
          actif: c.actif !== false,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
        caisse: caisse
          ? {
              _id: String(caisse._id),
              nom: caisse.nom,
              solde: Number(caisse.solde) || 0,
            }
          : undefined,
        factures: factures as unknown as IFacture[],
        transactions: transactions as unknown as ITransaction[],
      },
    });
  } catch (error) {
    console.error('GET /api/admin/clients/[id] error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateClient(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ _id: string }>>
) {
  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }
    const { nom, telephone, email, actif } = req.body || {};
    const update: Record<string, unknown> = {};
    if (nom !== undefined) update.nom = String(nom).trim();
    if (telephone !== undefined)
      update.telephone = telephone ? String(telephone).trim() : null;
    if (email !== undefined)
      update.email = email ? String(email).trim().toLowerCase() : null;
    if (actif !== undefined) update.actif = Boolean(actif);

    if (update.nom === '') {
      return res.status(400).json({
        success: false,
        error: 'Le nom du client ne peut pas être vide',
      });
    }

    const updated = await Client.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Client introuvable' });
    }
    return res.status(200).json({
      success: true,
      data: { _id: String(updated._id) },
      message: 'Client mis à jour',
    });
  } catch (error) {
    console.error('PUT /api/admin/clients/[id] error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getClient, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    case 'PUT':
      return withAuth(updateClient, [
        UserRole.ADMIN,
        UserRole.ADMIN_TRANSIT,
        UserRole.AGENT_TRANSIT,
      ])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
