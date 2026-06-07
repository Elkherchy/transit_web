import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Transit, Facture, Client } from '@/models';
import { removeTransitStoredFiles } from '@/lib/transitDocumentStorage';
import {
  ApiResponse,
  ITransit,
  TransitStatus,
  UserRole,
  isDesignationAdminOnly,
} from '@/types';
import { withAuth, AuthenticatedRequest, withAgentTransit, withTransitAccess } from '@/middleware/auth';
import mongoose from 'mongoose';

// GET /api/transit/[id] - Get single transit
async function getTransit(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransit & { facture?: any }>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const transit = await Transit.findById(id).lean();

    if (!transit) {
      return res.status(404).json({ success: false, error: 'Dossier non trouvé' });
    }

    const transitIdStr = String(id);

    if (req.user!.role === UserRole.USER_PAYEUR) {
      const payeurFacture = await Facture.findOne({
        transitId: transitIdStr,
        payeurId: req.user!.userId,
      }).lean();
      if (!payeurFacture) {
        return res.status(403).json({ success: false, error: 'Accès non autorisé' });
      }
      // Filtre les désignations admin-only — invisibles côté payeur.
      const designationsForPayeur = (transit.designations || []).filter(
        (d: { nom?: string }) => !isDesignationAdminOnly(d.nom)
      );
      return res.status(200).json({
        success: true,
        data: {
          ...transit,
          designations: designationsForPayeur,
          facture: payeurFacture,
        } as ITransit & { facture?: unknown },
      });
    }

    const facture = await Facture.findOne({ transitId: transitIdStr }).lean();

    return res.status(200).json({
      success: true,
      data: { ...transit, facture } as ITransit & { facture?: unknown },
    });
  } catch (error) {
    console.error('Get transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// PUT /api/transit/[id] - Update transit
async function updateTransit(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ITransit>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const transit = await Transit.findById(id);

    if (!transit) {
      return res.status(404).json({ success: false, error: 'Dossier non trouvé' });
    }

    const locked: TransitStatus[] = [TransitStatus.VALIDE, TransitStatus.CLOTURE];
    if (locked.includes(transit.statut as TransitStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Ce dossier est clôturé ou validé et ne peut plus être modifié',
      });
    }

    const { client, clientId, bl, objet, date, designations, statut, interet } = req.body;

    if (clientId !== undefined) {
      if (clientId && mongoose.isValidObjectId(String(clientId))) {
        const cl = await Client.findById(clientId).lean();
        if (!cl?.actif) {
          return res.status(400).json({ success: false, error: 'Client introuvable' });
        }
        transit.clientId = new mongoose.Types.ObjectId(String(clientId));
        transit.client = cl.nom;
      } else {
        transit.clientId = null;
        if (client !== undefined) {
          transit.client = String(client).trim();
        }
      }
    } else if (client !== undefined) {
      transit.client = String(client).trim();
    }
    if (bl !== undefined) transit.bl = bl;
    if (objet !== undefined) transit.objet = objet;
    if (date) transit.date = date;
    if (designations) transit.designations = designations;
    if (
      statut &&
      Object.values(TransitStatus).includes(statut as TransitStatus)
    ) {
      transit.statut = statut as TransitStatus;
    }

    if (interet !== undefined) {
      transit.interet = Math.max(0, Number(interet) || 0);
    }

    await transit.save();

    const facture = await Facture.findOne({ transitId: id });
    if (facture && (designations || interet !== undefined)) {
      if (designations) {
        let totalOperations = 0;
        for (const d of transit.designations || []) {
          totalOperations += (d as { montant?: number }).montant || 0;
        }
        facture.totalOperations = totalOperations;
      }
      if (interet !== undefined) {
        facture.interet = Math.max(0, Number(interet) || 0);
      }
      facture.totalFinal = facture.totalOperations + facture.interet;
      await facture.save();
    }

    const factureLean = await Facture.findOne({ transitId: id }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...(transit.toObject?.() ?? transit),
        facture: factureLean ?? undefined,
      } as ITransit & { facture?: unknown },
      message: 'Dossier mis à jour avec succès',
    });
  } catch (error) {
    console.error('Update transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// DELETE /api/transit/[id] - Delete transit
async function deleteTransit(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<null>>) {
  try {
    const { id } = req.query;
    await connectDB();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const transit = await Transit.findById(id);

    if (!transit) {
      return res.status(404).json({ success: false, error: 'Dossier non trouvé' });
    }

    // Only allow deletion if status is EN_COURS
    if (transit.statut !== TransitStatus.EN_COURS) {
      return res.status(400).json({ 
        success: false, 
        error: 'La suppression n\'est possible que pour les dossiers en cours' 
      });
    }

    // Check if facture exists
    const facture = await Facture.findOne({ transitId: id });
    if (facture) {
      return res.status(400).json({ 
        success: false, 
        error: 'Impossible de supprimer un dossier avec une facture associée' 
      });
    }

    const docKeys = (transit.documents || [])
      .map((d: { key?: string }) => d.key)
      .filter((k: string | undefined): k is string => Boolean(k));
    await removeTransitStoredFiles(docKeys);

    await Transit.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Dossier supprimé avec succès',
    });
  } catch (error) {
    console.error('Delete transit error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withTransitAccess(getTransit)(req, res);
    case 'PUT':
      return withAgentTransit(updateTransit)(req, res);
    case 'DELETE':
      return withAgentTransit(deleteTransit)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
