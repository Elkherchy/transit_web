import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { CarburantHistorique, Transaction, User, Vehicule } from '@/models';
import {
  ApiResponse,
  CaisseType,
  CarburantHistoriqueSource,
  CarburantHistoriqueType,
  IVehiculeResponse,
  TransactionType,
  UserRole,
  VehiculeCategorie,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import { ensureBanqueCaisse } from '@/lib/caisse';

async function getVehicule(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IVehiculeResponse>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const vehicule = await Vehicule.findById(id).lean();
    if (!vehicule) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    const currentChauffeurId = String(vehicule.chauffeurId || '').trim();
    const chauffeur = currentChauffeurId
      ? await User.findById(currentChauffeurId).select('nom').lean()
      : null;

    return res.status(200).json({
      success: true,
      data: {
        _id: String(vehicule._id),
        matricule: String(vehicule.matricule),
        categorie: (vehicule.categorie as VehiculeCategorie) || VehiculeCategorie.INTERNE,
        chauffeurId: vehicule.chauffeurId ? String(vehicule.chauffeurId) : undefined,
        chauffeurNom: chauffeur?.nom || undefined,
        clientNom: vehicule.clientNom ? String(vehicule.clientNom) : undefined,
        carburant: Number(vehicule.carburant || 0),
        actif: Boolean(vehicule.actif),
        createdAt: vehicule.createdAt,
        updatedAt: vehicule.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get vehicule error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function updateVehicule(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IVehiculeResponse>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const vehicule = await Vehicule.findById(id);
    if (!vehicule) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    const { matricule, chauffeurId, actif, carburant, carburantNote, categorie, clientNom } = req.body as {
      matricule?: string;
      chauffeurId?: string;
      actif?: boolean;
      carburant?: number;
      carburantNote?: string;
      categorie?: VehiculeCategorie;
      clientNom?: string;
    };

    let carburantHistoryPayload:
      | {
          type: CarburantHistoriqueType;
          quantite: number;
          before: number;
          after: number;
          note?: string;
        }
      | null = null;

    if (matricule !== undefined) {
      const nextMatricule = String(matricule).trim().toUpperCase();
      if (!nextMatricule) {
        return res.status(400).json({ success: false, error: 'Matricule invalide' });
      }
      const duplicate = await Vehicule.findOne({
        matricule: nextMatricule,
        _id: { $ne: id },
      }).lean();
      if (duplicate) {
        return res.status(400).json({ success: false, error: 'Ce matricule existe deja' });
      }
      vehicule.matricule = nextMatricule;
    }

    if (chauffeurId !== undefined) {
      const normalizedChauffeurId = String(chauffeurId).trim();
      if (normalizedChauffeurId) {
        const chauffeur = await User.findOne({
          _id: normalizedChauffeurId,
          role: UserRole.CHAUFFEUR,
          actif: true,
        })
          .select('nom')
          .lean();

        if (!chauffeur) {
          return res.status(400).json({ success: false, error: 'Chauffeur invalide ou inactif' });
        }
        vehicule.chauffeurId = normalizedChauffeurId;
      } else {
        vehicule.chauffeurId = undefined;
      }
    }

    if (clientNom !== undefined) {
      vehicule.clientNom = String(clientNom || '').trim() || undefined;
    }

    if (categorie !== undefined) {
      if (!Object.values(VehiculeCategorie).includes(categorie)) {
        return res.status(400).json({ success: false, error: 'Categorie invalide' });
      }
      vehicule.categorie = categorie;
    }

    if ((vehicule.categorie as VehiculeCategorie) === VehiculeCategorie.INTERNE) {
      if (!String(vehicule.chauffeurId || '').trim()) {
        return res.status(400).json({ success: false, error: 'Chauffeur requis pour vehicule interne' });
      }
      vehicule.clientNom = undefined;
    } else if ((vehicule.categorie as VehiculeCategorie) === VehiculeCategorie.CLIENT) {
      if (!String(vehicule.clientNom || '').trim()) {
        return res.status(400).json({ success: false, error: 'Nom client requis pour vehicule client' });
      }
      vehicule.chauffeurId = undefined;
    }

    if (actif !== undefined) {
      vehicule.actif = Boolean(actif);
    }

    if (carburant !== undefined) {
      const level = Number(carburant);
      if (!Number.isFinite(level) || level < 0) {
        return res.status(400).json({ success: false, error: 'Carburant invalide' });
      }
      const before = Number(vehicule.carburant || 0);
      vehicule.carburant = level;
      if (Math.abs(before - level) > 0.000001) {
        carburantHistoryPayload = {
          type: level >= before ? CarburantHistoriqueType.AJOUT : CarburantHistoriqueType.DEDUCTION,
          quantite: Math.abs(level - before),
          before,
          after: level,
          note: String(carburantNote || '').trim() || undefined,
        };
      }
    }

    await vehicule.save();

    if (carburantHistoryPayload) {
      const history = await CarburantHistorique.create({
        vehiculeId: String(vehicule._id),
        matricule: String(vehicule.matricule || '').trim().toUpperCase(),
        type: carburantHistoryPayload.type,
        source: CarburantHistoriqueSource.AJUSTEMENT,
        quantite: carburantHistoryPayload.quantite,
        before: carburantHistoryPayload.before,
        after: carburantHistoryPayload.after,
        note: carburantHistoryPayload.note,
        createdBy: req.user?.userId,
      });

      if (carburantHistoryPayload.type === CarburantHistoriqueType.AJOUT) {
        // Domaine logistique : ajout carburant → Banque_Logistique.
        const banque = await ensureBanqueCaisse(CaisseType.LOGISTIQUE);
        const matricule = String(vehicule.matricule || '').trim().toUpperCase();
        await Transaction.create({
          caisseId: banque._id,
          type: TransactionType.DEBIT,
          montant: carburantHistoryPayload.quantite,
          description: `Ajout carburant vehicule ${matricule}`,
          date: new Date(),
          reference: matricule,
          userId: req.user!.userId,
          vehiculeId: String(vehicule._id),
          vehiculeMatricule: matricule,
          sourcePaiementId: `vehicule-fuel-${String(history._id)}`,
        });
      }
    }

    const currentChauffeurId = String(vehicule.chauffeurId || '').trim();
    const chauffeur = currentChauffeurId
      ? await User.findById(currentChauffeurId).select('nom').lean()
      : null;

    return res.status(200).json({
      success: true,
      data: {
        _id: String(vehicule._id),
        matricule: String(vehicule.matricule),
        categorie: (vehicule.categorie as VehiculeCategorie) || VehiculeCategorie.INTERNE,
        chauffeurId: vehicule.chauffeurId ? String(vehicule.chauffeurId) : undefined,
        chauffeurNom: chauffeur?.nom || undefined,
        clientNom: vehicule.clientNom ? String(vehicule.clientNom) : undefined,
        carburant: Number(vehicule.carburant || 0),
        actif: Boolean(vehicule.actif),
        createdAt: vehicule.createdAt,
        updatedAt: vehicule.updatedAt,
      },
      message: 'Vehicule mis a jour',
    });
  } catch (error) {
    console.error('Update vehicule error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function deleteVehicule(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<null>>
) {
  try {
    await connectDB();
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const deleted = await Vehicule.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    return res.status(200).json({ success: true, message: 'Vehicule supprime' });
  } catch (error) {
    console.error('Delete vehicule error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withLogistique(getVehicule)(req, res);
    case 'PUT':
      return withLogistique(updateVehicule)(req, res);
    case 'DELETE':
      return withLogistique(deleteVehicule)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
