import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import connectDB from '@/lib/db';
import { Transit, Caisse, Transaction } from '@/models';
import {
  ApiResponse,
  DesignationStatus,
  UserRole,
  TransactionType,
  isDesignationAdminOnly,
  isDesignationFixedFee,
  getDesignationMaxAmount,
  isDesignationRecuOptional,
} from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';
import { storeRecuDocument } from '@/lib/transitDocumentStorage';
import { ensurePayeurUserCaisse } from '@/lib/caisse';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non supporté'));
  },
}).single('recu');

/** Lit et parse manuellement le body JSON (bodyParser global est OFF). */
async function readJsonBody(req: NextApiRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: unknown) {
  return new Promise<void>((resolve, reject) => {
    (fn as (r: NextApiRequest, s: NextApiResponse, cb: (r?: unknown) => void) => void)(
      req,
      res,
      (r?: unknown) => {
        if (r instanceof Error) reject(r);
        else resolve();
      }
    );
  });
}

/**
 * POST /api/transit/[id]/designation/[idx]/payer
 * Le payeur (ayant réservé la désignation) paie : upload du reçu + DEBIT
 * de la caisse payeur. Statut désignation → PAYEE (en attente contrôle agent).
 *
 * multipart/form-data : field `recu` (file), `montant?` (sinon montant désignation),
 * `datePaiement?`.
 */
async function handler(
  req: AuthenticatedRequest & { file?: Express.Multer.File },
  res: NextApiResponse<ApiResponse<{ transitId: string; designationId: string }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();

    // Deux modes d'invocation supportés :
    //  - multipart/form-data + champ `recu` (legacy, 1 seul fichier ≤ 5 Mo)
    //  - application/json avec `recus: [{key, name, size}]` (multi-upload via
    //    URLs S3 présignées — pas de limite Vercel)
    const contentType = String(req.headers['content-type'] || '');
    const isJson = contentType.includes('application/json');
    let presignedRecus: Array<{ key: string; name?: string; size?: number }> = [];
    let bodyMontant: unknown;
    let bodyDatePaiement: unknown;
    if (isJson) {
      // bodyParser global est OFF (pour multer) — on parse manuellement.
      const body = ((await readJsonBody(req)) || {}) as {
        recus?: Array<{ key?: string; name?: string; size?: number }>;
        montant?: unknown;
        datePaiement?: unknown;
      };
      presignedRecus = (body.recus || [])
        .filter((r): r is { key: string; name?: string; size?: number } =>
          !!r && typeof r.key === 'string' && r.key.startsWith('recus/')
        );
      bodyMontant = body.montant;
      bodyDatePaiement = body.datePaiement;
    } else {
      await runMiddleware(req, res, upload);
      bodyMontant = req.body?.montant;
      bodyDatePaiement = req.body?.datePaiement;
    }

    const transitId = String(req.query.id);
    const idxRaw = String(req.query.idx);
    if (!mongoose.isValidObjectId(transitId)) {
      return res.status(400).json({ success: false, error: 'Transit ID invalide' });
    }

    const transit = await Transit.findById(transitId);
    if (!transit) {
      return res.status(404).json({ success: false, error: 'Transit introuvable' });
    }

    let designation = mongoose.isValidObjectId(idxRaw)
      ? transit.designations.id(idxRaw)
      : null;
    if (!designation) {
      const numIdx = parseInt(idxRaw, 10);
      if (Number.isInteger(numIdx) && numIdx >= 0 && numIdx < transit.designations.length) {
        designation = transit.designations[numIdx];
      }
    }
    if (!designation) {
      return res.status(404).json({ success: false, error: 'Désignation introuvable' });
    }

    // Plafonnement éventuel du montant (ex : Bonne de Sortie Douanes = 200 MRU).
    const isFixedFee = isDesignationFixedFee(designation.nom);
    const fixedMax = getDesignationMaxAmount(designation.nom);
    // Reçu optionnel pour TS, Bonne de Sortie Douanes, Camion, Sogetrap.
    const recuOptional = isDesignationRecuOptional(designation.nom);

    if (!recuOptional) {
      if (!isJson && !req.file) {
        return res
          .status(400)
          .json({ success: false, error: 'Reçu obligatoire' });
      }
      if (isJson && presignedRecus.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: 'Au moins un reçu requis' });
      }
    }

    const uid = req.user!.userId;
    // Les désignations admin-only ne peuvent jamais être payées via cet endpoint
    // par un USER_PAYEUR.
    if (
      req.user!.role === UserRole.USER_PAYEUR &&
      isDesignationAdminOnly(designation.nom)
    ) {
      return res.status(403).json({
        success: false,
        error: 'Cette désignation est réservée à l\'administration',
      });
    }

    // Le payeur peut payer une désignation qu'il a réservée (RESERVEE) OU
    // une désignation préalablement REJETEE par le caissier dont il est
    // toujours titulaire (cas du « repaye » après rejet).
    const isOwner = String(designation.payeurId || '') === uid;
    const payableStatuses: DesignationStatus[] = [
      DesignationStatus.RESERVEE,
      DesignationStatus.REJETEE,
    ];
    if (
      !isOwner ||
      !payableStatuses.includes(
        designation.statutDesignation as DesignationStatus
      )
    ) {
      return res.status(403).json({
        success: false,
        error: 'Vous devez d’abord réserver cette désignation',
      });
    }

    const montantSaisi = bodyMontant ? parseFloat(String(bodyMontant).replace(',', '.')) : NaN;
    let montant = Number.isFinite(montantSaisi) && montantSaisi > 0
      ? montantSaisi
      : Number(designation.montant) || 0;
    // Désignations à frais fixes : le payeur peut entrer n'importe quel
    // montant ≤ plafond. On refuse uniquement si supérieur.
    if (isFixedFee && fixedMax !== null && montant > fixedMax) {
      return res.status(400).json({
        success: false,
        error: `Le montant doit être ≤ ${fixedMax} MRU pour « ${designation.nom} »`,
      });
    }
    if (montant <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide' });
    }

    // S'assure que la caisse payeur existe (créée si besoin), mais on ne
    // VÉRIFIE PAS le solde ni on DEBITE à ce stade. La sortie effective de
    // la caisse payeur est différée jusqu'à la validation par le caissier
    // (cf. POST /api/operations-validation), qui re-vérifie le solde et
    // crée la transaction DEBIT à ce moment-là.
    await ensurePayeurUserCaisse(uid);

    // Stocker le reçu (multipart legacy) OU récupérer les clés présignées.
    type RecuRecord = {
      key: string;
      name: string;
      size: number;
      uploadedAt: Date;
    };
    let recusRecords: RecuRecord[] = [];
    if (isJson) {
      recusRecords = presignedRecus.map((r) => ({
        key: r.key,
        name: r.name || '',
        size: Number(r.size) || 0,
        uploadedAt: new Date(),
      }));
    } else if (req.file) {
      try {
        const stored = await storeRecuDocument({
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        });
        recusRecords = [
          {
            key: stored.recuUrl,
            name: req.file.originalname,
            size: req.file.size,
            uploadedAt: new Date(),
          },
        ];
      } catch (storeErr) {
        const msg = storeErr instanceof Error ? storeErr.message : 'Échec stockage reçu';
        console.error('storeRecuDocument:', storeErr);
        return res.status(503).json({ success: false, error: msg });
      }
    }
    // Pour les désignations à reçu optionnel (TS, Bonne de Sortie Douanes,
    // Camion, Sogetrap), un tableau vide est autorisé. Pour les autres,
    // on refuse comme avant.
    if (!recuOptional && recusRecords.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Aucun reçu valide à enregistrer' });
    }

    // Pas de DEBIT à ce stade — il sera créé à la validation par le
    // caissier (vérifie le solde + génère la transaction). En attendant,
    // la désignation passe juste en statut PAYEE.

    // Met à jour la désignation.
    // Premier reçu reflété dans les champs legacy `recuUrl`/`recuFilename`
    // (uniquement s'il y en a — pour les désignations à reçu optionnel non
    // accompagnées d'un justificatif, on garde les champs à null).
    if (recusRecords.length > 0) {
      designation.recuUrl = recusRecords[0].key;
      designation.recuFilename = recusRecords[0].name;
    } else {
      designation.recuUrl = null;
      designation.recuFilename = null;
    }
    designation.recus = recusRecords as unknown as typeof designation.recus;
    designation.statutDesignation = DesignationStatus.PAYEE;
    designation.paidAt = new Date();
    if (montant !== Number(designation.montant)) {
      designation.montant = montant;
    }

    let datePaiement = new Date();
    if (bodyDatePaiement) {
      const d = new Date(String(bodyDatePaiement));
      if (!Number.isNaN(d.getTime())) datePaiement = d;
    }
    designation.paidAt = datePaiement;

    await transit.save();

    // Recalcule le statut de la FactureManutention liée (visible dans la
    // liste caissier + admin et propage l'avancement du dossier).
    try {
      await syncFactureManutentionStatusFromTransit(String(transit._id));
    } catch (syncErr) {
      console.error('syncFactureManutentionStatus error:', syncErr);
    }

    return res.status(200).json({
      success: true,
      data: {
        transitId: String(transit._id),
        designationId: String(designation._id),
      },
      message: 'Paiement enregistré — en attente de contrôle agent transit',
    });
  } catch (error) {
    console.error('Payer désignation error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export const config = { api: { bodyParser: false } };

export default withAuth(handler, [UserRole.USER_PAYEUR, UserRole.ADMIN]);
