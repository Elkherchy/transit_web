import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Caisse, Client, Transaction } from '@/models';
import { TransactionType, UserRole } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { ensureClientCaisse } from '@/lib/caisse';
import { generateClientOperationsPdfBuffer } from '@/lib/pdf/clientOperationsPdfBuffer';
import type {
  ClientOperationsData,
  ClientOperationLine,
} from '@/components/documents/ClientOperationsPDF';

/**
 * GET /api/admin/clients/[id]/pdf
 *
 * Génère le relevé d'opérations du client : table Date / Motif / Débit /
 * Crédit / Solde + totaux. Réutilise l'infrastructure react-pdf (polices
 * Cairo, logo). Le solde affiché est le solde cumulé chronologique.
 *
 * Auth : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT, COMPTABLE.
 */
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    await connectDB();

    const client = await Client.findById(id).lean();
    if (!client) {
      return res
        .status(404)
        .json({ success: false, error: 'Client introuvable' });
    }

    const declaredCaisseId = client.caisseId
      ? String(client.caisseId)
      : String(await ensureClientCaisse(id, client.nom));

    // Récupère toutes les caisses liées au client (legacy + actuelle).
    const allCaisses = await Caisse.find({
      $or: [
        { _id: new mongoose.Types.ObjectId(declaredCaisseId) },
        { kind: 'CLIENT', clientId: String(id) },
      ],
    })
      .select('_id')
      .lean();
    const caisseIds = allCaisses.map(
      (c) => c._id as mongoose.Types.ObjectId
    );

    // Filtre date optionnel.
    const { dateDebut, dateFin } = req.query as {
      dateDebut?: string;
      dateFin?: string;
    };
    const dateFilter: Record<string, Date> = {};
    if (dateDebut && typeof dateDebut === 'string') {
      const d = new Date(dateDebut);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(0, 0, 0, 0);
        dateFilter.$gte = d;
      }
    }
    if (dateFin && typeof dateFin === 'string') {
      const d = new Date(dateFin);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = d;
      }
    }

    const query: Record<string, unknown> = {
      caisseId:
        caisseIds.length === 1 ? caisseIds[0] : { $in: caisseIds },
    };
    if (Object.keys(dateFilter).length > 0) query.date = dateFilter;

    const txs = await Transaction.find(query)
      .sort({ date: 1, createdAt: 1 }) // ordre chronologique pour le solde cumulé
      .lean();

    let solde = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const lines: ClientOperationLine[] = txs.map((t) => {
      const montant = Number(t.montant) || 0;
      const isDebit = t.type === TransactionType.DEBIT;
      if (isDebit) {
        solde -= montant;
        totalDebit += montant;
      } else {
        solde += montant;
        totalCredit += montant;
      }
      return {
        date: new Date(t.date).toLocaleDateString('fr-FR'),
        motif: String(t.description || '—'),
        debit: isDebit ? montant : 0,
        credit: isDebit ? 0 : montant,
        solde,
      };
    });

    let periode: string | undefined;
    if (dateFilter.$gte || dateFilter.$lte) {
      const a = dateFilter.$gte
        ? dateFilter.$gte.toLocaleDateString('fr-FR')
        : '—';
      const b = dateFilter.$lte
        ? dateFilter.$lte.toLocaleDateString('fr-FR')
        : '—';
      periode = `Du ${a} au ${b}`;
    }

    const data: ClientOperationsData = {
      clientNom: String(client.nom || '—'),
      generatedAt: new Date().toLocaleString('fr-FR'),
      periode,
      lines,
      totalDebit,
      totalCredit,
      totalSolde: solde,
    };

    const buffer = await generateClientOperationsPdfBuffer(data);
    const safeName = String(client.nom || id).replace(/[^\w.-]+/g, '_');
    const filename = `operations-${safeName}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('PDF client operations error:', e);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur génération PDF' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.COMPTABLE,
]);
