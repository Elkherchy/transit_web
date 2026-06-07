import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { FactureManutention, Transit, Facture } from '@/models';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { UserRole } from '@/types';
import {
  buildFicheTransitPdfPayload,
  type TransitDetailsForPrint,
} from '@/components/transit/PrintableTransitDoc';
import { generateTransitPdfBuffer } from '@/lib/pdf/transitPdfBuffer';

/**
 * GET /api/manutention/[id]/pdf
 *
 * Génère le PDF d'une facture manutention en réutilisant le gabarit "Fiche
 * Transit" (mêmes désignations, mêmes colonnes : Désignation / Montant / Date).
 * Le PDF est construit à partir du dossier transit lié à la facture
 * manutention (factureManutention.transitId).
 *
 * Auth : ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT, CAISSIER.
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

    const facture = await FactureManutention.findById(id).lean();
    if (!facture) {
      return res
        .status(404)
        .json({ success: false, error: 'Facture manutention introuvable' });
    }

    if (!facture.transitId) {
      return res
        .status(400)
        .json({ success: false, error: 'Aucun dossier transit lié à cette facture' });
    }

    const transit = await Transit.findById(facture.transitId).lean();
    if (!transit) {
      return res
        .status(404)
        .json({ success: false, error: 'Dossier transit lié introuvable' });
    }

    const factureClient = await Facture.findOne({
      transitId: String(facture.transitId),
    }).lean();

    const payload = buildFicheTransitPdfPayload({
      ...transit,
      facture: factureClient,
    } as TransitDetailsForPrint);

    const buffer = await generateTransitPdfBuffer(payload);
    const baseName = String(facture.bl || payload.factureNumber || id).replace(
      /[^\w.-]+/g,
      '_'
    );
    const filename = `manutention-${baseName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('PDF manutention error:', e);
    return res
      .status(500)
      .json({ success: false, error: 'Erreur génération PDF' });
  }
}

export default withAuth(handler, [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
]);
