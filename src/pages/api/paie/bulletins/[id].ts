import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { BulletinSalaire, Caisse, Salarie, Transaction, User } from '@/models';
import {
  ApiResponse,
  BulletinStatut,
  CaisseKind,
  IBulletinSalaireResponse,
  ISalarieLigne,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withComptable } from '@/middleware/auth';
import { ensureDefaultGeneralCaisse } from '@/lib/caisse';

function computeTotals(brut: number, primes: ISalarieLigne[], retenues: ISalarieLigne[]) {
  const totalPrimes = primes.reduce((s, l) => s + Number(l.montant || 0), 0);
  const totalRetenues = retenues.reduce((s, l) => s + Number(l.montant || 0), 0);
  const salaireNet = Number((brut + totalPrimes - totalRetenues).toFixed(2));
  return { totalPrimes, totalRetenues, salaireNet };
}

async function getBulletin(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IBulletinSalaireResponse>>) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await BulletinSalaire.findById(id).lean();
  if (!doc) return res.status(404).json({ success: false, error: 'Bulletin introuvable' });

  const [sal, payeur] = await Promise.all([
    Salarie.findById(doc.salarieId).select('nom prenom poste').lean(),
    doc.payePar ? User.findById(doc.payePar).select('nom').lean() : Promise.resolve(null),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      _id: String(doc._id),
      salarieId: doc.salarieId,
      periode: doc.periode,
      salaireBrut: Number(doc.salaireBrut || 0),
      primes: (doc.primes as ISalarieLigne[]) || [],
      retenues: (doc.retenues as ISalarieLigne[]) || [],
      totalPrimes: Number(doc.totalPrimes || 0),
      totalRetenues: Number(doc.totalRetenues || 0),
      salaireNet: Number(doc.salaireNet || 0),
      statut: doc.statut as BulletinStatut,
      caisseId: doc.caisseId,
      transactionId: doc.transactionId,
      payePar: doc.payePar,
      datePaiement: doc.datePaiement,
      note: doc.note,
      createdBy: doc.createdBy,
      salarieNom: sal ? String(sal.nom) : undefined,
      salariePrenom: sal ? String(sal.prenom) : undefined,
      salariePoste: sal ? String(sal.poste) : undefined,
      payeParNom: payeur ? String(payeur.nom) : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
  });
}

async function updateBulletin(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IBulletinSalaireResponse>>) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await BulletinSalaire.findById(id);
  if (!doc) return res.status(404).json({ success: false, error: 'Bulletin introuvable' });

  if (doc.statut === BulletinStatut.PAYE)
    return res.status(400).json({ success: false, error: 'Bulletin deja paye, modification impossible' });

  const { salaireBrut, primes, retenues, note, statut } = req.body as {
    salaireBrut?: number; primes?: ISalarieLigne[]; retenues?: ISalarieLigne[]; note?: string; statut?: BulletinStatut;
  };

  if (salaireBrut !== undefined) {
    const v = Number(salaireBrut);
    if (!Number.isFinite(v) || v < 0)
      return res.status(400).json({ success: false, error: 'Salaire brut invalide' });
    doc.salaireBrut = v;
  }
  if (primes !== undefined) {
    doc.primes = Array.isArray(primes)
      ? primes.map((l) => ({ libelle: String(l.libelle || ''), montant: Number(l.montant || 0) }))
      : [];
  }
  if (retenues !== undefined) {
    doc.retenues = Array.isArray(retenues)
      ? retenues.map((l) => ({ libelle: String(l.libelle || ''), montant: Number(l.montant || 0) }))
      : [];
  }
  if (note !== undefined) doc.note = String(note || '').trim() || undefined;
  if (statut !== undefined && statut === BulletinStatut.VALIDE && doc.statut === BulletinStatut.BROUILLON) {
    doc.statut = BulletinStatut.VALIDE;
  }

  const { totalPrimes, totalRetenues, salaireNet } = computeTotals(
    Number(doc.salaireBrut),
    doc.primes as ISalarieLigne[],
    doc.retenues as ISalarieLigne[]
  );
  doc.totalPrimes = totalPrimes;
  doc.totalRetenues = totalRetenues;
  doc.salaireNet = salaireNet;

  await doc.save();
  return res.status(200).json({
    success: true,
    data: {
      _id: String(doc._id),
      salarieId: doc.salarieId,
      periode: doc.periode,
      salaireBrut: Number(doc.salaireBrut),
      primes: doc.primes as ISalarieLigne[],
      retenues: doc.retenues as ISalarieLigne[],
      totalPrimes: Number(doc.totalPrimes),
      totalRetenues: Number(doc.totalRetenues),
      salaireNet: Number(doc.salaireNet),
      statut: doc.statut as BulletinStatut,
      caisseId: doc.caisseId,
      transactionId: doc.transactionId,
      payePar: doc.payePar,
      datePaiement: doc.datePaiement,
      note: doc.note,
      createdBy: doc.createdBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    message: 'Bulletin mis a jour',
  });
}

async function payerBulletin(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<IBulletinSalaireResponse>>) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await BulletinSalaire.findById(id);
  if (!doc) return res.status(404).json({ success: false, error: 'Bulletin introuvable' });
  if (doc.statut === BulletinStatut.PAYE)
    return res.status(400).json({ success: false, error: 'Bulletin deja paye' });
  if (doc.statut !== BulletinStatut.VALIDE)
    return res.status(400).json({ success: false, error: 'Le bulletin doit etre valide avant paiement' });

  const { caisseId } = req.body as { caisseId?: string };
  const sal = await Salarie.findById(doc.salarieId)
    .select('nom prenom banqueCompteId')
    .lean();
  if (!sal) return res.status(400).json({ success: false, error: 'Salarie introuvable' });

  const requestedCaisseId = String(caisseId || '').trim();
  const linkedCompteId = String(sal.banqueCompteId || '').trim();

  let targetCaisseId = '';
  if (linkedCompteId && mongoose.isValidObjectId(linkedCompteId)) {
    targetCaisseId = linkedCompteId;
  } else if (requestedCaisseId && mongoose.isValidObjectId(requestedCaisseId)) {
    targetCaisseId = requestedCaisseId;
  }

  if (!targetCaisseId) {
    const general = await ensureDefaultGeneralCaisse();
    targetCaisseId = String(general._id);
  }

  const caisse = await Caisse.findById(targetCaisseId).lean();
  if (!caisse || !caisse.actif || caisse.kind === CaisseKind.USER) {
    return res.status(400).json({ success: false, error: 'Compte de paiement introuvable ou invalide' });
  }

  const nomSal = sal ? `${sal.prenom} ${sal.nom}` : `Salarie ${doc.salarieId}`;

  const sourcePaiementId = `bulletin-${String(doc._id)}`;
  const existing = await Transaction.findOne({ sourcePaiementId }).lean();
  if (existing) {
    doc.statut = BulletinStatut.PAYE;
    doc.caisseId = String(caisse._id);
    doc.transactionId = String(existing._id);
    doc.payePar = req.user!.userId;
    doc.datePaiement = new Date();
    await doc.save();
  } else {
    const tx = await Transaction.create({
      caisseId: String(caisse._id),
      type: TransactionType.DEBIT,
      montant: Number(doc.salaireNet || 0),
      description: `Salaire ${doc.periode} - ${nomSal}`,
      date: new Date(),
      reference: String(doc._id),
      userId: req.user!.userId,
      sourcePaiementId,
    });

    const general = await ensureDefaultGeneralCaisse();
    if (String(general._id) !== String(caisse._id)) {
      await Transaction.create({
        caisseId: general._id,
        type: TransactionType.DEBIT,
        montant: Number(doc.salaireNet || 0),
        description: `Paie (${String(caisse.nom || 'Compte')}) - Salaire ${doc.periode} - ${nomSal}`,
        date: new Date(),
        reference: String(doc._id),
        userId: req.user!.userId,
        mirrorSourceId: tx._id,
        sourcePaiementId,
      });
    }

    doc.statut = BulletinStatut.PAYE;
    doc.caisseId = String(caisse._id);
    doc.transactionId = String(tx._id);
    doc.payePar = req.user!.userId;
    doc.datePaiement = new Date();
    await doc.save();
  }

  return res.status(200).json({
    success: true,
    data: {
      _id: String(doc._id),
      salarieId: doc.salarieId,
      periode: doc.periode,
      salaireBrut: Number(doc.salaireBrut),
      primes: doc.primes as ISalarieLigne[],
      retenues: doc.retenues as ISalarieLigne[],
      totalPrimes: Number(doc.totalPrimes),
      totalRetenues: Number(doc.totalRetenues),
      salaireNet: Number(doc.salaireNet),
      statut: doc.statut as BulletinStatut,
      caisseId: doc.caisseId,
      transactionId: doc.transactionId,
      payePar: doc.payePar,
      datePaiement: doc.datePaiement,
      note: doc.note,
      createdBy: doc.createdBy,
      caisseNom: String(caisse.nom || ''),
      salarieNom: sal ? String(sal.nom) : undefined,
      salariePrenom: sal ? String(sal.prenom) : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    message: 'Salaire paye',
  });
}

async function deleteBulletin(req: AuthenticatedRequest, res: NextApiResponse) {
  await connectDB();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !mongoose.isValidObjectId(id))
    return res.status(400).json({ success: false, error: 'ID invalide' });

  const doc = await BulletinSalaire.findById(id).lean();
  if (!doc) return res.status(404).json({ success: false, error: 'Bulletin introuvable' });
  if (doc.statut === BulletinStatut.PAYE)
    return res.status(400).json({ success: false, error: 'Bulletin paye, suppression impossible' });

  await BulletinSalaire.findByIdAndDelete(id);
  return res.status(200).json({ success: true, message: 'Bulletin supprime' });
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method === 'GET') return withComptable(getBulletin)(req, res);
  if (req.method === 'PUT') return withComptable(updateBulletin)(req, res);
  if (req.method === 'POST' && req.query.action === 'payer') return withComptable(payerBulletin)(req, res);
  if (req.method === 'DELETE') return withComptable(deleteBulletin)(req, res);
  return res.status(405).json({ success: false, error: 'Methode non autorisee' });
}
