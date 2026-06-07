import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { CarburantHistorique, Transaction, Vehicule } from '@/models';
import {
  ApiResponse,
  CaisseType,
  CarburantHistoriqueSource,
  CarburantHistoriqueType,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withLogistique } from '@/middleware/auth';
import { ensureBanqueCaisse } from '@/lib/caisse';

async function deductCarburant(
  req: AuthenticatedRequest,
  res: NextApiResponse<
    ApiResponse<{
      matricule: string;
      before: number;
      deducted: number;
      after: number;
      distanceKm?: number;
      consommationL100?: number;
      batchKey?: string;
    }>
  >
) {
  try {
    await connectDB();

    const { matricule, amount, distanceKm, consommationL100, batchKey } = req.body as {
      matricule?: string;
      amount?: number;
      distanceKm?: number;
      consommationL100?: number;
      batchKey?: string;
      fuelDate?: string;
      compteurPrecedentKm?: number;
      compteurActuelKm?: number;
      nombreTrajets?: number;
      carburantPrecedent?: number;
      carburantActuel?: number;
      source?: CarburantHistoriqueSource;
      note?: string;
      voyageId?: string;
    };
    const normalizedMatricule = String(matricule || '').trim().toUpperCase();
    const deduction = Number(amount || 0);
    const distance = distanceKm === undefined ? undefined : Number(distanceKm);
    const consommation = consommationL100 === undefined ? undefined : Number(consommationL100);
    const normalizedBatchKey = String(batchKey || '').trim() || undefined;
    const source =
      req.body?.source === CarburantHistoriqueSource.MANUEL
        ? CarburantHistoriqueSource.MANUEL
        : CarburantHistoriqueSource.LISTE_VOYAGE;
    const fuelDate = req.body?.fuelDate ? new Date(String(req.body.fuelDate)) : undefined;
    const compteurPrecedentKmRaw =
      req.body?.compteurPrecedentKm === undefined ? undefined : Number(req.body.compteurPrecedentKm);
    const compteurActuelKmRaw =
      req.body?.compteurActuelKm === undefined ? undefined : Number(req.body.compteurActuelKm);
    const nombreTrajetsRaw =
      req.body?.nombreTrajets === undefined ? undefined : Number(req.body.nombreTrajets);
    const carburantPrecedentRaw =
      req.body?.carburantPrecedent === undefined ? undefined : Number(req.body.carburantPrecedent);
    const carburantActuelRaw =
      req.body?.carburantActuel === undefined ? undefined : Number(req.body.carburantActuel);
    const note = String(req.body?.note || '').trim() || undefined;
    const voyageId = String(req.body?.voyageId || '').trim() || undefined;

    const hasTrackingPayload =
      compteurPrecedentKmRaw !== undefined ||
      compteurActuelKmRaw !== undefined ||
      nombreTrajetsRaw !== undefined ||
      carburantPrecedentRaw !== undefined ||
      carburantActuelRaw !== undefined;

    if (!normalizedMatricule) {
      return res.status(400).json({ success: false, error: 'Matricule requis' });
    }
    if (!hasTrackingPayload && (!Number.isFinite(deduction) || deduction <= 0)) {
      return res.status(400).json({ success: false, error: 'Montant deduction invalide' });
    }

    const vehicule = await Vehicule.findOne({ matricule: normalizedMatricule });
    if (!vehicule) {
      return res.status(404).json({ success: false, error: 'Vehicule introuvable' });
    }

    const before = hasTrackingPayload
      ? Math.max(0, Number.isFinite(carburantPrecedentRaw) ? Number(carburantPrecedentRaw) : Number(vehicule.carburant || 0))
      : Number(vehicule.carburant || 0);
    const after = hasTrackingPayload
      ? Math.max(0, Number.isFinite(carburantActuelRaw) ? Number(carburantActuelRaw) : Number(vehicule.carburant || 0))
      : Math.max(0, before - deduction);

    const effectiveQuantite = hasTrackingPayload ? Math.abs(after - before) : deduction;
    const effectiveType = after >= before ? CarburantHistoriqueType.AJOUT : CarburantHistoriqueType.DEDUCTION;
    const compteurPrecedentKm =
      Number.isFinite(compteurPrecedentKmRaw) && Number(compteurPrecedentKmRaw) >= 0
        ? Number(compteurPrecedentKmRaw)
        : undefined;
    const compteurActuelKm =
      Number.isFinite(compteurActuelKmRaw) && Number(compteurActuelKmRaw) >= 0
        ? Number(compteurActuelKmRaw)
        : undefined;
    const nombreTrajets =
      Number.isFinite(nombreTrajetsRaw) && Number(nombreTrajetsRaw) >= 0
        ? Number(nombreTrajetsRaw)
        : undefined;

    if (
      hasTrackingPayload &&
      compteurPrecedentKm !== undefined &&
      compteurActuelKm !== undefined &&
      compteurActuelKm < compteurPrecedentKm
    ) {
      return res.status(400).json({ success: false, error: 'Compteur actuel doit etre >= compteur precedent' });
    }

    if (hasTrackingPayload && (compteurPrecedentKm === undefined || compteurActuelKm === undefined || nombreTrajets === undefined)) {
      return res.status(400).json({ success: false, error: 'Compteurs et nombre trajets requis pour le suivi' });
    }

    const distanceFromCompteurs =
      compteurPrecedentKm !== undefined && compteurActuelKm !== undefined
        ? Math.max(0, compteurActuelKm - compteurPrecedentKm)
        : undefined;
    const effectiveDistanceKm = Number.isFinite(distance)
      ? Number(distance)
      : distanceFromCompteurs;
    const effectiveConsommationL100 = Number.isFinite(consommation)
      ? Number(consommation)
      : effectiveDistanceKm && effectiveDistanceKm > 0
        ? (Math.abs(after - before) / effectiveDistanceKm) * 100
        : undefined;
    const rendementCarburantParTrajet =
      nombreTrajets && nombreTrajets > 0 ? after / nombreTrajets : undefined;
    const rendementCompteurParTrajet =
      nombreTrajets && nombreTrajets > 0 && effectiveDistanceKm !== undefined
        ? effectiveDistanceKm / nombreTrajets
        : undefined;

    vehicule.carburant = after;
    await vehicule.save();

    const history = await CarburantHistorique.create({
      vehiculeId: String(vehicule._id),
      matricule: normalizedMatricule,
      type: effectiveType,
      source,
      fuelDate: fuelDate && !Number.isNaN(fuelDate.getTime()) ? fuelDate : undefined,
      quantite: effectiveQuantite,
      before,
      after,
      compteurPrecedentKm,
      compteurActuelKm,
      nombreTrajets,
      rendementCarburantParTrajet,
      rendementCompteurParTrajet,
      distanceKm: effectiveDistanceKm,
      consommationL100: effectiveConsommationL100,
      batchKey: normalizedBatchKey,
      voyageId,
      note,
      createdBy: req.user?.userId,
    });

    if (effectiveType === CarburantHistoriqueType.AJOUT && effectiveQuantite > 0) {
      // Domaine logistique : déduction carburant → Banque_Logistique.
      const banque = await ensureBanqueCaisse(CaisseType.LOGISTIQUE);
      await Transaction.create({
        caisseId: banque._id,
        type: TransactionType.DEBIT,
        montant: effectiveQuantite,
        description: `Ajout carburant vehicule ${normalizedMatricule}`,
        date: fuelDate && !Number.isNaN(fuelDate.getTime()) ? fuelDate : new Date(),
        reference: normalizedMatricule,
        userId: req.user!.userId,
        vehiculeId: String(vehicule._id),
        vehiculeMatricule: normalizedMatricule,
        sourcePaiementId: `vehicule-fuel-${String(history._id)}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        matricule: normalizedMatricule,
        before,
        deducted: effectiveQuantite,
        after,
        distanceKm: effectiveDistanceKm,
        consommationL100: effectiveConsommationL100,
        batchKey: normalizedBatchKey,
      },
      message: 'Carburant deduit',
    });
  } catch (error) {
    console.error('Deduct carburant error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      return withLogistique(deductCarburant)(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
