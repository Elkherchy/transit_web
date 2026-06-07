import type { NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { JourneeCaisse, Transit, Facture, Caisse, Transaction, FactureManutention } from '@/models';
import {
  ApiResponse,
  IJourneeCaisse,
  JourneeCaisseStatus,
  DesignationStatus,
  TransitStatus,
  FactureStatus,
  TransactionType,
} from '@/types';
import { AuthenticatedRequest, withAdmin } from '@/middleware/auth';
import { syncFactureManutentionStatusFromTransit } from '@/lib/manutention/syncFactureManutentionStatus';
import { ensureClientCaisse } from '@/lib/caisse';

function generateFactureNumero(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `F-${year}${month}-${random}`;
}

/**
 * POST /api/journee/[id]/valider-admin
 * Validation finale admin d'une journée VALIDEE_TRANSIT.
 * Pour chaque transit travaillé :
 *   - marque ses désignations VALIDEE_TRANSIT comme VALIDEE_ADMIN
 *   - passe le transit en VALIDE
 *   - crée automatiquement la facture client
 *     totalOperations = somme désignations validées
 *     interet = transit.interet
 *     totalFinal = totalOperations + interet (calculé par hook Mongoose)
 */
async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<{ journee: IJourneeCaisse; facturesCreees: string[] }>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    await connectDB();
    const id = String(req.query.id);
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const journee = await JourneeCaisse.findById(id);
    if (!journee) {
      return res.status(404).json({ success: false, error: 'Journée introuvable' });
    }
    if (journee.statut !== JourneeCaisseStatus.VALIDEE_TRANSIT) {
      return res.status(400).json({
        success: false,
        error: 'La journée doit être VALIDEE_TRANSIT pour être validée par admin',
      });
    }

    const transits = await Transit.find({
      _id: { $in: journee.transitsTraitesIds || [] },
    });

    const facturesCreees: string[] = [];
    const now = new Date();

    for (const t of transits) {
      // Marquer les désignations VALIDEE_TRANSIT comme VALIDEE_ADMIN.
      let totalOperations = 0;
      for (const d of t.designations) {
        if (d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT) {
          d.statutDesignation = DesignationStatus.VALIDEE_ADMIN;
          d.valideAdminBy = new mongoose.Types.ObjectId(req.user!.userId);
          d.valideAdminAt = now;
          totalOperations += Number(d.montant) || 0;
        } else if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) {
          // Déjà validé (cas idempotence) — toujours dans le total
          totalOperations += Number(d.montant) || 0;
        }
      }

      t.statut = TransitStatus.VALIDE;
      t.valideAdminBy = String(req.user!.userId);
      t.valideAdminAt = now;

      // Création facture client si pas déjà liée.
      if (!t.factureClientId && totalOperations > 0) {
        const interet = Number(t.interet) || 0;
        const totalFinal = totalOperations + interet;

        // Trouver un payeur principal : celui qui a payé le plus de désignations.
        const counts = new Map<string, number>();
        for (const d of t.designations) {
          if (
            d.payeurId &&
            (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN ||
              d.statutDesignation === DesignationStatus.VALIDEE_TRANSIT)
          ) {
            const k = String(d.payeurId);
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
        let payeurPrincipal: string | undefined;
        let max = 0;
        for (const [k, v] of counts) {
          if (v > max) {
            max = v;
            payeurPrincipal = k;
          }
        }

        // Résolution du clientId : on lit la FactureManutention liée pour obtenir
        // le clientId saisi par l'admin lors de la création.
        let clientId: string | undefined;
        if (t.factureManutentionId) {
          const fm = await FactureManutention.findById(t.factureManutentionId)
            .select('clientId')
            .lean();
          const fmCid = (fm as { clientId?: unknown } | null)?.clientId;
          if (fmCid) clientId = String(fmCid);
        }

        const facture = await Facture.create({
          transitId: String(t._id),
          bl: t.bl,
          clientId: clientId
            ? new mongoose.Types.ObjectId(clientId)
            : null,
          payeurId: payeurPrincipal
            ? new mongoose.Types.ObjectId(payeurPrincipal)
            : null,
          numero: generateFactureNumero(),
          totalOperations,
          interet,
          totalFinal,
          statut: FactureStatus.EMIS,
          dateEmission: now,
        });
        t.factureClientId = String(facture._id);
        facturesCreees.push(String(facture._id));

        // DEBIT de la caisse client : la facture émise est une créance pour
        // le client (sortie de son compte / dette envers la société).
        if (clientId && totalFinal > 0) {
          try {
            const clientCaisseId = await ensureClientCaisse(clientId);
            const ref = `facture-${String(facture._id)}`;
            // Idempotence : ne crée pas la transaction si déjà présente.
            const dup = await Transaction.findOne({ sourcePaiementId: ref });
            if (!dup) {
              await Transaction.create({
                caisseId: clientCaisseId,
                type: TransactionType.DEBIT,
                montant: totalFinal,
                description: `Facture ${facture.numero} — BL ${t.bl}`,
                date: now,
                reference: String(facture._id),
                userId: req.user!.userId,
                sourcePaiementId: ref,
              });
              await Caisse.findByIdAndUpdate(clientCaisseId, {
                $inc: { solde: -totalFinal },
              });
            }
          } catch (caisseErr) {
            console.error('Debit caisse client échoué:', caisseErr);
          }
        }
      }

      await t.save();

      // Met à jour la FactureManutention liée → CLOTURE (toutes désignations
      // VALIDEE_ADMIN) ou statut intermédiaire selon les désignations restantes.
      try {
        await syncFactureManutentionStatusFromTransit(String(t._id));
      } catch (syncErr) {
        console.error('syncFactureManutentionStatus error:', syncErr);
      }
    }

    journee.statut = JourneeCaisseStatus.VALIDEE_ADMIN;
    journee.valideAdminBy = req.user!.userId;
    journee.valideAdminAt = now;
    await journee.save();

    return res.status(200).json({
      success: true,
      data: {
        journee: journee.toObject() as unknown as IJourneeCaisse,
        facturesCreees,
      },
      message: `Journée validée. ${facturesCreees.length} facture(s) client générée(s).`,
    });
  } catch (error) {
    console.error('valider-admin journee error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default withAdmin(handler);
