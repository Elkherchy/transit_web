import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { FactureManutention } from '@/models';
import {
  ApiResponse,
  IFactureManutention,
  FactureManutentionStatus,
  UserRole,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

// GET /api/manutention/[id] - Get single facture manutention
async function getFactureManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IFactureManutention>>
) {
  try {
    await connectDB();

    const { id } = req.query;

    // Resynchronise statut + bonLivret depuis les désignations du transit lié.
    // Auto-réparation pour les factures créées avant l'introduction du sync
    // automatique de bonLivret.
    try {
      const head = await FactureManutention.findById(id)
        .select('transitId')
        .lean();
      const tid = (head as { transitId?: unknown } | null)?.transitId;
      if (tid) {
        await syncFactureManutentionStatusFromTransit(String(tid));
      }
    } catch (syncErr) {
      console.error('manutention GET sync error:', syncErr);
    }

    const facture = await FactureManutention.findById(id)
      .populate('payeurId', 'nom email')
      .lean();

    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture manutention introuvable',
      });
    }

    // Lecture autorisée pour ADMIN, ADMIN_TRANSIT, AGENT_TRANSIT et CAISSIER
    // (consultation), ainsi que pour le créateur de la facture.
    const role = req.user!.role;
    const isAdmin =
      role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT;
    const isAgentTransit = role === UserRole.AGENT_TRANSIT;
    const isCaissier = role === UserRole.CAISSIER;
    const isCreator = facture.createdBy === req.user!.userId;
    if (!isAdmin && !isAgentTransit && !isCaissier && !isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    return res.status(200).json({
      success: true,
      data: facture as IFactureManutention,
    });
  } catch (error) {
    console.error('Get facture manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// PUT /api/manutention/[id] - Update facture manutention
async function updateFactureManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IFactureManutention>>
) {
  try {
    await connectDB();

    const { id } = req.query;
    const {
      bl,
      lignesEntreprise,
      payeurId,
      client,
      clientId,
      objet,
      removeDocKeys,
    } = req.body as {
      bl?: string;
      lignesEntreprise?: unknown;
      payeurId?: string | null;
      client?: string;
      clientId?: string | null;
      objet?: string;
      removeDocKeys?: string[];
    };

    const facture = await FactureManutention.findById(id);

    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture manutention introuvable',
      });
    }

    // Vérifier les permissions
    const isAdmin =
      req.user!.role === UserRole.ADMIN ||
      req.user!.role === UserRole.ADMIN_TRANSIT;
    const isCreator = facture.createdBy === req.user!.userId;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Seules les factures en brouillon ou en attente de paiement peuvent être modifiées
    if (facture.statut === FactureManutentionStatus.CLOTURE) {
      return res.status(400).json({
        success: false,
        error: 'Cette facture est clôturée et ne peut plus être modifiée',
      });
    }

    // Mise à jour des champs
    if (bl !== undefined) {
      const normalizedBl = bl.trim().toUpperCase();
      if (normalizedBl !== facture.bl) {
        const dup = await FactureManutention.findOne({
          bl: normalizedBl,
          _id: { $ne: facture._id },
        })
          .select('_id')
          .lean();
        if (dup) {
          return res.status(409).json({
            success: false,
            error: `Une autre manutention utilise déjà le BL ${normalizedBl}`,
          });
        }
        facture.bl = normalizedBl;
      }
    }

    if (client !== undefined) {
      facture.client = String(client).trim();
    }
    if (clientId !== undefined) {
      facture.clientId = clientId
        ? (clientId as unknown as typeof facture.clientId)
        : null;
    }
    if (objet !== undefined) {
      facture.objet = String(objet).trim();
    }

    // Suppression de documents : supprime aussi les objets S3 + propage au
    // transit lié pour garder les deux côtés cohérents.
    if (Array.isArray(removeDocKeys) && removeDocKeys.length > 0) {
      const toRemove = new Set(removeDocKeys.map(String));
      const removedDocs: { key: string }[] = [];
      facture.documents = (facture.documents || []).filter(
        (d: unknown) => {
          const k = (d as { key?: string }).key;
          if (k && toRemove.has(k)) {
            removedDocs.push({ key: k });
            return false;
          }
          return true;
        }
      );

      if (removedDocs.length > 0) {
        // 1) Supprime les objets S3 (best-effort — ne bloque pas la sauvegarde).
        try {
          const { removeTransitStoredFiles } = await import(
            '@/lib/transitDocumentStorage'
          );
          await removeTransitStoredFiles(removedDocs.map((d) => d.key));
        } catch (s3Err) {
          console.error('S3 delete documents error:', s3Err);
        }
        // 2) Propage la suppression au transit lié.
        if (facture.transitId) {
          try {
            const { Transit } = await import('@/models');
            await Transit.findByIdAndUpdate(facture.transitId, {
              $pull: { documents: { key: { $in: removedDocs.map((d) => d.key) } } },
            });
          } catch (syncErr) {
            console.error('Propagation suppression doc → transit:', syncErr);
          }
        }
      }
    }

    if (lignesEntreprise !== undefined) {
      if (!Array.isArray(lignesEntreprise) || lignesEntreprise.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Au moins une ligne entreprise est requise',
        });
      }

      // Validation des lignes entreprise
      for (const ligne of lignesEntreprise) {
        if (!ligne.nomEntreprise || !ligne.bl || typeof ligne.montant !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'Chaque ligne doit avoir nomEntreprise, bl et montant',
          });
        }
      }

      facture.lignesEntreprise = lignesEntreprise.map((l) => ({
        nomEntreprise: l.nomEntreprise.trim(),
        bl: l.bl.trim().toUpperCase(),
        montant: Math.max(0, l.montant),
      }));
    }

    // Mise à jour du payeur (désignation)
    if (payeurId !== undefined) {
      // Seules les factures en brouillon ou en attente peuvent avoir leur payeur modifié
      if (facture.statut !== FactureManutentionStatus.BROUILLON &&
          facture.statut !== FactureManutentionStatus.EN_ATTENTE_PAIEMENT) {
        return res.status(400).json({
          success: false,
          error: 'Le payeur ne peut pas être modifié à ce stade',
        });
      }
      facture.payeurId = payeurId || null;
      if (payeurId) {
        facture.statut = FactureManutentionStatus.EN_ATTENTE_PAIEMENT;
      }
    }

    await facture.save();

    return res.status(200).json({
      success: true,
      data: facture as IFactureManutention,
      message: 'Facture manutention mise à jour avec succès',
    });
  } catch (error) {
    console.error('Update facture manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// DELETE /api/manutention/[id] - Delete facture manutention
async function deleteFactureManutention(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<unknown>>
) {
  try {
    await connectDB();

    const { id } = req.query;

    const facture = await FactureManutention.findById(id);

    if (!facture) {
      return res.status(404).json({
        success: false,
        error: 'Facture manutention introuvable',
      });
    }

    // Vérifier les permissions
    const isAdmin =
      req.user!.role === UserRole.ADMIN ||
      req.user!.role === UserRole.ADMIN_TRANSIT;
    const isCreator = facture.createdBy === req.user!.userId;
    if (!isAdmin && !isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Seules les factures en brouillon peuvent être supprimées
    if (facture.statut !== FactureManutentionStatus.BROUILLON && !isAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Seules les factures en brouillon peuvent être supprimées',
      });
    }

    await FactureManutention.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Facture manutention supprimée avec succès',
    });
  } catch (error) {
    console.error('Delete facture manutention error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

const ALLOWED_ROLES = [
  UserRole.ADMIN,
  UserRole.ADMIN_TRANSIT,
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
];

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(getFactureManutention, ALLOWED_ROLES)(req, res);
    case 'PUT':
      return withAuth(updateFactureManutention, ALLOWED_ROLES)(req, res);
    case 'DELETE':
      return withAuth(deleteFactureManutention, ALLOWED_ROLES)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
