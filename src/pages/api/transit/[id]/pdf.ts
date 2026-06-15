import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { Transit, Facture } from '@/models';
import { withTransitAccess, AuthenticatedRequest } from '@/middleware/auth';
import { UserRole } from '@/types';
import {
  buildFicheTransitPdfPayload,
  type TransitDetailsForPrint,
} from '@/components/transit/PrintableTransitDoc';
import { generateTransitPdfBuffer } from '@/lib/pdf/transitPdfBuffer';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    await connectDB();
    const transit = await Transit.findById(id).lean();
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Dossier non trouvé' });
    }

    const transitIdStr = String(id);
    let facture: unknown = null;

    if (req.user!.role === UserRole.USER_PAYEUR) {
      const payeurFacture = await Facture.findOne({
        transitId: transitIdStr,
        payeurId: req.user!.userId,
      }).lean();
      if (!payeurFacture) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }
      facture = payeurFacture;
    } else {
      facture = await Facture.findOne({ transitId: transitIdStr }).lean();
    }

    const payload = buildFicheTransitPdfPayload({
      ...transit,
      facture,
    } as TransitDetailsForPrint);

    if (req.user!.role === UserRole.AGENT_TRANSIT) {
      payload.interet = 0;
      payload.total = payload.totalOperations;
    }

    const buffer = await generateTransitPdfBuffer(payload);
    const baseName = String(transit.bl || payload.factureNumber || id).replace(/[^\w.-]+/g, '_');
    const filename = `transit-${baseName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('PDF transit error:', e);
    return res.status(500).json({ success: false, error: 'Erreur génération PDF' });
  }
}

export default withTransitAccess(handler);
