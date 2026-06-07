import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import {
  Caisse,
  Facture,
  FactureManutention,
  Transaction,
  Transit,
} from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  FactureStatus,
  TransactionType,
  UserRole,
} from '@/types';
import { ensureClientCaisse } from '@/lib/caisse';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

function generateFactureNumero(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `F-${year}${month}-${random}`;
}

/**
 * POST /api/manutention/[id]/create-facture-client
 *
 * À déclencher par ADMIN_TRANSIT depuis la page détail manutention quand
 * toutes les désignations du transit lié sont validées (VALIDEE_ADMIN).
 *
 * Effets :
 *  - Crée la Facture client (numéro auto, totalOperations = somme des
 *    désignations validées, totalFinal = totalOperations + intérêt).
 *  - DEBITE la caisse du client (créance).
 *  - Lie facture.transitId et transit.factureClientId.
 *
 * Idempotent : si une facture existe déjà pour ce transit, on renvoie son ID
 * sans la recréer.
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<
    ApiResponse<{ factureId: string; numero: string; totalFinal: number }>
  >
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ success: false, error: 'Méthode non autorisée' });
  }
  try {
    await connectDB();
    const id = String(req.query.id || '');
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const facture = await FactureManutention.findById(id);
    if (!facture) {
      return res
        .status(404)
        .json({ success: false, error: 'Manutention introuvable' });
    }
    if (!facture.transitId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun dossier transit lié',
      });
    }

    const transit = await Transit.findById(facture.transitId);
    if (!transit) {
      return res
        .status(404)
        .json({ success: false, error: 'Transit lié introuvable' });
    }

    // Idempotence : si une facture client existe déjà.
    if (transit.factureClientId) {
      const existing = await Facture.findById(transit.factureClientId)
        .select('_id numero totalFinal')
        .lean();
      if (existing) {
        return res.status(200).json({
          success: true,
          data: {
            factureId: String(existing._id),
            numero: String((existing as { numero?: unknown }).numero || ''),
            totalFinal:
              Number((existing as { totalFinal?: unknown }).totalFinal) || 0,
          },
          message: 'Facture client déjà émise',
        });
      }
    }

    // Vérifie que toutes les désignations sont VALIDEE_ADMIN (ou REJETEE).
    let totalOperations = 0;
    let validCount = 0;
    const counts = new Map<string, number>();
    for (const d of transit.designations || []) {
      if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) {
        totalOperations += Number(d.montant) || 0;
        validCount += 1;
        if (d.payeurId) {
          const k = String(d.payeurId);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      } else if (d.statutDesignation === DesignationStatus.REJETEE) {
        // ignore
      } else {
        return res.status(400).json({
          success: false,
          error:
            'Toutes les désignations ne sont pas encore validées par l\'admin',
        });
      }
    }
    if (validCount === 0 || totalOperations <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucune désignation validée — impossible de générer la facture',
      });
    }

    // Payeur principal.
    let payeurPrincipal: string | undefined;
    let max = 0;
    for (const [k, v] of counts) {
      if (v > max) {
        max = v;
        payeurPrincipal = k;
      }
    }

    const interet = Number(transit.interet) || 0;
    const totalFinal = totalOperations + interet;
    const clientId = facture.clientId ? String(facture.clientId) : undefined;

    const factureClient = await Facture.create({
      transitId: String(transit._id),
      bl: transit.bl,
      clientId: clientId ? new mongoose.Types.ObjectId(clientId) : null,
      payeurId: payeurPrincipal
        ? new mongoose.Types.ObjectId(payeurPrincipal)
        : null,
      numero: generateFactureNumero(),
      totalOperations,
      interet,
      totalFinal,
      statut: FactureStatus.EMIS,
      dateEmission: new Date(),
    });
    transit.factureClientId = String(factureClient._id);
    await transit.save();

    // DEBIT caisse client (créance).
    if (clientId && totalFinal > 0) {
      try {
        const clientCaisseId = await ensureClientCaisse(clientId);
        await Transaction.create({
          caisseId: clientCaisseId,
          type: TransactionType.DEBIT,
          montant: totalFinal,
          description: `Facture ${factureClient.numero} — Transit ${
            transit.bl || String(transit._id)
          }`,
          date: new Date(),
          reference: String(factureClient._id),
          userId: req.user!.userId,
          sourcePaiementId: String(factureClient._id),
        });
        await Caisse.findByIdAndUpdate(clientCaisseId, {
          $inc: { solde: -totalFinal },
        });
      } catch (e) {
        console.error('DEBIT caisse client (create-facture-client):', e);
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        factureId: String(factureClient._id),
        numero: String(factureClient.numero),
        totalFinal,
      },
      message: `Facture client ${factureClient.numero} créée`,
    });
  } catch (error) {
    console.error('POST /api/manutention/[id]/create-facture-client:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);
