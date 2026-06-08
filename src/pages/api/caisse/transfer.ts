import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Client, Transaction } from '@/models';
import {
  ApiResponse,
  CaisseType,
  TransactionType,
  UserRole,
} from '@/types';
import { ClientStatus } from '@/models/Client';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse, getSoldeMapForCaisseIds } from '@/lib/caisse';

interface TransferResult {
  sourceId: string;
  destinationId: string;
  montant: number;
  sourceSolde: number;
  destinationSolde: number;
  sourceTransactionId: string;
  destinationTransactionId: string;
}

/**
 * POST /api/caisse/transfer
 *
 * Transfère un montant d'un compte source vers un compte destination dans
 * le domaine Transit. Effets :
 *   - DEBIT sur le compte source
 *   - CREDIT sur le compte destination
 *
 * Les deux transactions partagent un même identifiant logique
 * (`transfer-{ts}-{rand}`) côté `mirrorSourceId` pour pouvoir tracer la paire
 * (pas d'utilisation pour KPI — la mécanique « dépôt admin » exclut
 * automatiquement les transactions avec mirrorSourceId).
 *
 * Body : { sourceId, destinationId, montant, description?, date? }
 * Auth : ADMIN, ADMIN_TRANSIT.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<TransferResult>>
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    const {
      sourceId: rawSourceId,
      sourceClientId,
      destinationId: rawDestinationId,
      destinationClientId,
      montant,
      description,
      date,
    } = (req.body || {}) as {
      sourceId?: string;
      sourceClientId?: string;
      destinationId?: string;
      destinationClientId?: string;
      montant?: number;
      description?: string;
      date?: string;
    };

    // Résout la source : caisseId direct OU clientId → caisse du client.
    let sourceId = rawSourceId;
    if (!sourceId && sourceClientId) {
      if (!mongoose.isValidObjectId(String(sourceClientId))) {
        return res
          .status(400)
          .json({ success: false, error: 'sourceClientId invalide' });
      }
      const srcClient = await Client.findById(sourceClientId)
        .select('_id nom statut actif caisseId')
        .lean();
      if (!srcClient || !srcClient.actif) {
        return res.status(404).json({
          success: false,
          error: 'Client source introuvable ou inactif',
        });
      }
      if (srcClient.statut !== ClientStatus.VALIDE) {
        return res.status(400).json({
          success: false,
          error: "Le client source n'est pas validé",
        });
      }
      sourceId = srcClient.caisseId
        ? String(srcClient.caisseId)
        : String(
            await ensureClientCaisse(String(srcClient._id), srcClient.nom)
          );
    }

    // Résout la destination : soit un caisseId direct (banque), soit un
    // clientId qui est transformé en caisse CLIENT (créée si nécessaire).
    let destinationId = rawDestinationId;
    if (!destinationId && destinationClientId) {
      if (!mongoose.isValidObjectId(String(destinationClientId))) {
        return res
          .status(400)
          .json({ success: false, error: 'destinationClientId invalide' });
      }
      const client = await Client.findById(destinationClientId)
        .select('_id nom statut actif caisseId')
        .lean();
      if (!client || !client.actif) {
        return res.status(404).json({
          success: false,
          error: 'Client introuvable ou inactif',
        });
      }
      if (client.statut !== ClientStatus.VALIDE) {
        return res.status(400).json({
          success: false,
          error: 'Ce client n\'est pas validé',
        });
      }
      const cId = client.caisseId
        ? String(client.caisseId)
        : String(
            await ensureClientCaisse(String(client._id), client.nom)
          );
      destinationId = cId;
    }

    if (
      !sourceId ||
      !destinationId ||
      !mongoose.isValidObjectId(String(sourceId)) ||
      !mongoose.isValidObjectId(String(destinationId))
    ) {
      return res.status(400).json({
        success: false,
        error:
          'source (id ou clientId) et destination (id ou clientId) requis',
      });
    }
    if (String(sourceId) === String(destinationId)) {
      return res.status(400).json({
        success: false,
        error: 'Source et destination doivent être différentes',
      });
    }
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Montant invalide' });
    }

    const [source, destination] = await Promise.all([
      Caisse.findById(sourceId),
      Caisse.findById(destinationId),
    ]);

    if (!source || !source.actif) {
      return res.status(404).json({
        success: false,
        error: 'Compte source introuvable ou inactif',
      });
    }
    if (!destination || !destination.actif) {
      return res.status(404).json({
        success: false,
        error: 'Compte destination introuvable ou inactif',
      });
    }

    // Admin scopé : interdit de croiser les domaines.
    // Les caisses CLIENT sans `caisseType` (legacy, créées avant l'ajout du
    // champ) sont implicitement TRANSIT — on les laisse passer.
    const role = req.user!.role;
    const matchesDomain = (
      c: { caisseType?: unknown; kind?: unknown },
      target: CaisseType
    ): boolean => {
      if (c.caisseType === target) return true;
      if (target === CaisseType.TRANSIT && !c.caisseType && c.kind === 'CLIENT')
        return true;
      return false;
    };
    if (
      role === UserRole.ADMIN_TRANSIT &&
      (!matchesDomain(source, CaisseType.TRANSIT) ||
        !matchesDomain(destination, CaisseType.TRANSIT))
    ) {
      return res.status(403).json({
        success: false,
        error: 'Transfert hors domaine transit non autorisé',
      });
    }

    // Vérifie le solde de la source — sauf pour les transferts entre clients
    // (source ou destination de type CLIENT) qui peuvent générer un solde
    // négatif (créance / dette enregistrée sans contrainte de provision).
    const involvesClient = Boolean(sourceClientId || destinationClientId);
    if (!involvesClient) {
      // Use computed solde from transactions (authoritative) rather than
      // the stored field which may lag if created outside this API.
      const soldeMap = await getSoldeMapForCaisseIds([
        source._id as mongoose.Types.ObjectId,
      ]);
      const currentSourceSolde =
        soldeMap.get(String(source._id)) ?? Number(source.solde) ?? 0;
      if (currentSourceSolde < m) {
        return res.status(400).json({
          success: false,
          error: `Solde insuffisant sur le compte source (${currentSourceSolde.toFixed(2)} MRU)`,
        });
      }
    }

    const now = date ? new Date(date) : new Date();
    if (Number.isNaN(now.getTime())) {
      return res.status(400).json({ success: false, error: 'Date invalide' });
    }

    const desc = description?.trim() ||
      `Transfert ${source.nom} → ${destination.nom}`;
    const transferRef = `transfer-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}`;

    // Création des 2 transactions (séquentielle, sans transaction multi-doc —
    // MongoDB standalone). Rollback best-effort en cas d'échec.
    const debit = await Transaction.create({
      caisseId: source._id,
      type: TransactionType.DEBIT,
      montant: m,
      description: desc,
      date: now,
      reference: transferRef,
      userId: req.user!.userId,
      sourcePaiementId: transferRef,
    });
    let credit;
    try {
      credit = await Transaction.create({
        caisseId: destination._id,
        type: TransactionType.CREDIT,
        montant: m,
        description: desc,
        date: now,
        reference: transferRef,
        userId: req.user!.userId,
        sourcePaiementId: `${transferRef}-credit`,
        mirrorSourceId: debit._id,
      });
    } catch (e) {
      // Rollback du DEBIT.
      await Transaction.findByIdAndDelete(debit._id).catch(() => null);
      throw e;
    }

    const [updatedSrc, updatedDst] = await Promise.all([
      Caisse.findByIdAndUpdate(
        source._id,
        { $inc: { solde: -m } },
        { new: true }
      ).select('solde'),
      Caisse.findByIdAndUpdate(
        destination._id,
        { $inc: { solde: m } },
        { new: true }
      ).select('solde'),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        sourceId: String(source._id),
        destinationId: String(destination._id),
        montant: m,
        sourceSolde: Number(updatedSrc?.solde) || 0,
        destinationSolde: Number(updatedDst?.solde) || 0,
        sourceTransactionId: String(debit._id),
        destinationTransactionId: String(credit._id),
      },
      message: 'Transfert effectué',
    });
  } catch (error) {
    console.error('POST /api/caisse/transfer error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
]);
