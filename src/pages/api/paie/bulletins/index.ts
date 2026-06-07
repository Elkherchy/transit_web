import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { BulletinSalaire, Salarie, User } from '@/models';
import {
  ApiResponse,
  BulletinStatut,
  IBulletinSalaireResponse,
  ISalarieLigne,
  PaginatedResponse,
} from '@/types';
import { AuthenticatedRequest, withComptable } from '@/middleware/auth';

function computeTotals(brut: number, primes: ISalarieLigne[], retenues: ISalarieLigne[]) {
  const totalPrimes = primes.reduce((s, l) => s + Number(l.montant || 0), 0);
  const totalRetenues = retenues.reduce((s, l) => s + Number(l.montant || 0), 0);
  const salaireNet = Number((brut + totalPrimes - totalRetenues).toFixed(2));
  return { totalPrimes, totalRetenues, salaireNet };
}

async function listBulletins(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<PaginatedResponse<IBulletinSalaireResponse>>>
) {
  try {
    await connectDB();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (req.query.salarieId) query.salarieId = String(req.query.salarieId);
    if (req.query.periode) query.periode = String(req.query.periode);
    if (req.query.statut && Object.values(BulletinStatut).includes(req.query.statut as BulletinStatut)) {
      query.statut = req.query.statut;
    }

    const [docs, total] = await Promise.all([
      BulletinSalaire.find(query).sort({ periode: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      BulletinSalaire.countDocuments(query),
    ]);

    const salarieIds = [...new Set(docs.map((d) => d.salarieId).filter(Boolean))];
    const salaries = salarieIds.length
      ? await Salarie.find({ _id: { $in: salarieIds } }).select('nom prenom poste').lean()
      : [];
    const salarieMap = new Map(salaries.map((s) => [String(s._id), s]));

    const payeParIds = [...new Set(docs.map((d) => d.payePar).filter(Boolean) as string[])];
    const payeurs = payeParIds.length
      ? await User.find({ _id: { $in: payeParIds } }).select('nom').lean()
      : [];
    const payeurMap = new Map(payeurs.map((u) => [String(u._id), String(u.nom)]));

    const data: IBulletinSalaireResponse[] = docs.map((d) => {
      const sal = salarieMap.get(d.salarieId);
      return {
        _id: String(d._id),
        salarieId: d.salarieId,
        periode: d.periode,
        salaireBrut: Number(d.salaireBrut || 0),
        primes: (d.primes as ISalarieLigne[]) || [],
        retenues: (d.retenues as ISalarieLigne[]) || [],
        totalPrimes: Number(d.totalPrimes || 0),
        totalRetenues: Number(d.totalRetenues || 0),
        salaireNet: Number(d.salaireNet || 0),
        statut: d.statut as BulletinStatut,
        caisseId: d.caisseId,
        transactionId: d.transactionId,
        payePar: d.payePar,
        datePaiement: d.datePaiement,
        note: d.note,
        createdBy: d.createdBy,
        salarieNom: sal ? String(sal.nom) : undefined,
        salariePrenom: sal ? String(sal.prenom) : undefined,
        salariePoste: sal ? String(sal.poste) : undefined,
        payeParNom: d.payePar ? payeurMap.get(d.payePar) : undefined,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error('List bulletins error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

async function createBulletin(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<IBulletinSalaireResponse>>
) {
  try {
    await connectDB();
    const { salarieId, periode, salaireBrut, primes, retenues, note } = req.body as {
      salarieId?: string;
      periode?: string;
      salaireBrut?: number;
      primes?: ISalarieLigne[];
      retenues?: ISalarieLigne[];
      note?: string;
    };

    if (!salarieId) return res.status(400).json({ success: false, error: 'Salarie requis' });
    if (!periode || !/^\d{4}-\d{2}$/.test(periode))
      return res.status(400).json({ success: false, error: 'Periode invalide (format YYYY-MM)' });

    const sal = await Salarie.findById(salarieId).lean();
    if (!sal || !sal.actif) return res.status(400).json({ success: false, error: 'Salarie introuvable ou inactif' });

    const exists = await BulletinSalaire.findOne({ salarieId, periode }).lean();
    if (exists) return res.status(400).json({ success: false, error: 'Bulletin deja existant pour cette periode' });

    const brut = salaireBrut !== undefined ? Number(salaireBrut) : Number(sal.salaireBrut || 0);
    const normalizedPrimes: ISalarieLigne[] = Array.isArray(primes)
      ? primes.map((l) => ({ libelle: String(l.libelle || ''), montant: Number(l.montant || 0) }))
      : [];
    const normalizedRetenues: ISalarieLigne[] = Array.isArray(retenues)
      ? retenues.map((l) => ({ libelle: String(l.libelle || ''), montant: Number(l.montant || 0) }))
      : [];

    const { totalPrimes, totalRetenues, salaireNet } = computeTotals(brut, normalizedPrimes, normalizedRetenues);

    const doc = await BulletinSalaire.create({
      salarieId,
      periode,
      salaireBrut: brut,
      primes: normalizedPrimes,
      retenues: normalizedRetenues,
      totalPrimes,
      totalRetenues,
      salaireNet,
      statut: BulletinStatut.BROUILLON,
      note: String(note || '').trim() || undefined,
      createdBy: req.user!.userId,
    });

    return res.status(201).json({
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
        salarieNom: String(sal.nom),
        salariePrenom: String(sal.prenom),
        salariePoste: String(sal.poste),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
      message: 'Bulletin cree',
    });
  } catch (err) {
    console.error('Create bulletin error:', err);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET': return withComptable(listBulletins)(req, res);
    case 'POST': return withComptable(createBulletin)(req, res);
    default: return res.status(405).json({ success: false, error: 'Methode non autorisee' });
  }
}
