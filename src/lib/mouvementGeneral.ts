/**
 * Calcul "Mouvement Compte Général" pour le domaine Transit.
 */
import mongoose from 'mongoose';
import {
  Caisse,
  Facture,
  Transaction,
  Transit,
} from '@/models';
import {
  CaisseType,
  CompteType,
  TransactionType,
} from '@/types';

export interface MouvementGeneral {
  domaine: CaisseType;
  /** Bornes de la période utilisée pour charges/bénéfices (ISO). */
  periodeDebut: string;
  periodeFin: string;
  solde: number;
  charges: number;
  benefices: number;
  /** Somme des intérêts de tous les BL (Transit.interet). */
  interetBL: number;
  creditClient: number;
  /** Détail des comptes du domaine pour traçabilité. */
  comptes: Array<{
    _id: string;
    nom: string;
    type: CompteType;
    solde: number;
  }>;
}

/**
 * Calcule les 4 KPI d'un domaine sur une période donnée.
 * @param caisseType TRANSIT ou LOGISTIQUE
 * @param dateDebut  ISO date (défaut : début du mois courant)
 * @param dateFin    ISO date (défaut : maintenant)
 */
export async function computeMouvementGeneral(
  caisseType: CaisseType,
  dateDebut?: Date,
  dateFin?: Date
): Promise<MouvementGeneral> {
  const now = new Date();
  const start =
    dateDebut ||
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = dateFin || now;

  // 1. Tous les comptes "société" du domaine (GENERAL + BANQUE, excluant
  //    les caisses utilisateurs/payeurs/chauffeurs/véhicules).
  const comptes = await Caisse.find({
    caisseType,
    type: { $in: [CompteType.GENERAL, CompteType.BANQUE] },
    actif: true,
  })
    .select('_id nom type solde')
    .lean();

  const compteIds = comptes.map(
    (c) => c._id as mongoose.Types.ObjectId
  );

  // 2. Solde total des comptes société (capital).
  // On recalcule à partir des transactions pour ne pas se fier au cache
  // `solde` du document Caisse (qui peut dériver).
  const soldeAgg = compteIds.length
    ? await Transaction.aggregate<{ _id: mongoose.Types.ObjectId; solde: number }>([
        { $match: { caisseId: { $in: compteIds } } },
        {
          $group: {
            _id: '$caisseId',
            solde: {
              $sum: {
                $cond: [
                  { $eq: ['$type', TransactionType.CREDIT] },
                  '$montant',
                  { $multiply: ['$montant', -1] },
                ],
              },
            },
          },
        },
      ])
    : [];
  const soldeMap = new Map(soldeAgg.map((r) => [String(r._id), r.solde || 0]));
  const solde = comptes.reduce(
    (s, c) => s + (soldeMap.get(String(c._id)) || 0),
    0
  );

  // 3. Charges (DEBITs hors miroirs) et bénéfices (CREDITs − DEBITs hors miroirs)
  //    sur la période, pour les comptes société du domaine uniquement.
  const periodAgg = compteIds.length
    ? await Transaction.aggregate<{
        _id: TransactionType;
        total: number;
      }>([
        {
          $match: {
            caisseId: { $in: compteIds },
            date: { $gte: start, $lte: end },
            // Exclut les miroirs : on veut le mouvement RÉEL, pas la copie
            // miroir d'une opération payeur.
            $or: [
              { mirrorSourceId: { $exists: false } },
              { mirrorSourceId: null },
            ],
          },
        },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$montant' },
          },
        },
      ])
    : [];

  const credits =
    periodAgg.find((r) => r._id === TransactionType.CREDIT)?.total || 0;
  const debits =
    periodAgg.find((r) => r._id === TransactionType.DEBIT)?.total || 0;
  const charges = Math.round(debits * 100) / 100;
  const benefices = Math.round((credits - debits) * 100) / 100;

  // 4. Intérêts BL : somme de Transit.interet sur tous les BL (sans filtre date).
  const interetAgg = await Transit.aggregate<{ total: number }>([
    { $match: { interet: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$interet' } } },
  ]);
  const interetBL = Math.round((interetAgg[0]?.total ?? 0) * 100) / 100;

  // 5. Crédit client : factures transit non soldées.
  let creditClient = 0;
  if (caisseType === CaisseType.TRANSIT) {
    const fAgg = await Facture.aggregate<{
      totalFacture: number;
      totalPaye: number;
    }>([
      { $match: { clientId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: null,
          totalFacture: { $sum: { $ifNull: ['$totalFinal', 0] } },
          totalPaye: { $sum: { $ifNull: ['$montantPaye', 0] } },
        },
      },
    ]);
    const totals = fAgg[0] || { totalFacture: 0, totalPaye: 0 };
    creditClient = Math.max(
      0,
      Math.round((totals.totalFacture - totals.totalPaye) * 100) / 100
    );
  }

  return {
    domaine: caisseType,
    periodeDebut: start.toISOString(),
    periodeFin: end.toISOString(),
    solde: Math.round(solde * 100) / 100,
    charges,
    benefices,
    interetBL,
    creditClient,
    comptes: comptes.map((c) => ({
      _id: String(c._id),
      nom: String(c.nom),
      type: c.type as CompteType,
      solde: Math.round((soldeMap.get(String(c._id)) || 0) * 100) / 100,
    })),
  };
}
