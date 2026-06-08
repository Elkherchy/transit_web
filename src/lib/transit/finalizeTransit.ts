import mongoose, { Document } from 'mongoose';
import { Caisse, Facture, FactureManutention, Transaction, Transit } from '@/models';
import {
  DesignationStatus,
  FactureManutentionStatus,
  FactureStatus,
  ITransit,
  TransactionType,
  TransitStatus,
} from '@/types';
import { ensureClientCaisse } from '@/lib/caisse';

function generateFactureNumero(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `F-${year}${month}-${random}`;
}

/**
 * Marque une désignation comme VALIDEE_ADMIN. Idempotent.
 * Renvoie true si une mise à jour effective a été appliquée.
 */
export async function markDesignationValideeAdmin(
  transitId: string,
  designationId: string,
  userId: string
): Promise<boolean> {
  if (
    !mongoose.isValidObjectId(transitId) ||
    !mongoose.isValidObjectId(designationId)
  ) {
    return false;
  }
  const t = await Transit.findById(transitId);
  if (!t) return false;
  const d = t.designations.id(designationId);
  if (!d) return false;
  if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) return false;
  d.statutDesignation = DesignationStatus.VALIDEE_ADMIN;
  d.valideAdminBy = new mongoose.Types.ObjectId(userId);
  d.valideAdminAt = new Date();
  await t.save();
  return true;
}

/**
 * Crée automatiquement la facture client pour un transit dont toutes les
 * désignations sont VALIDEE_ADMIN. Idempotent : sans effet si la facture
 * existe déjà.
 *
 * Effets :
 *  - Crée le document Facture (statut EMIS, numéro auto)
 *  - DEBITE la caisse du client (créance)
 *  - Lie transit.factureClientId
 */
async function autoCreateFactureClient(
  t: Document & ITransit,
  userId: string
): Promise<void> {
  if (t.factureClientId) return; // déjà créée

  // Calcul du total depuis les désignations VALIDEE_ADMIN
  let totalOperations = 0;
  const payeurCounts = new Map<string, number>();
  for (const d of t.designations || []) {
    if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) {
      totalOperations += Number(d.montant) || 0;
      if (d.payeurId) {
        const k = String(d.payeurId);
        payeurCounts.set(k, (payeurCounts.get(k) || 0) + 1);
      }
    }
  }
  if (totalOperations <= 0) return;

  // Payeur principal (le plus fréquent)
  let payeurPrincipal: string | undefined;
  let max = 0;
  for (const [k, v] of payeurCounts) {
    if (v > max) { max = v; payeurPrincipal = k; }
  }

  // clientId depuis la FactureManutention liée
  let clientId: string | undefined;
  if (t.factureManutentionId) {
    const fm = await FactureManutention.findById(t.factureManutentionId)
      .select('clientId')
      .lean();
    if (fm?.clientId) clientId = String(fm.clientId);
  }

  const interet = Number(t.interet) || 0;
  const totalFinal = totalOperations + interet;

  const factureClient = await Facture.create({
    transitId: String(t._id),
    bl: t.bl,
    clientId: clientId ? new mongoose.Types.ObjectId(clientId) : null,
    payeurId: payeurPrincipal ? new mongoose.Types.ObjectId(payeurPrincipal) : null,
    numero: generateFactureNumero(),
    totalOperations,
    interet,
    totalFinal,
    statut: FactureStatus.EMIS,
    dateEmission: new Date(),
  });

  t.factureClientId = String(factureClient._id);
  await t.save();

  // DEBIT caisse client (créance)
  if (clientId && totalFinal > 0) {
    try {
      const clientCaisseId = await ensureClientCaisse(clientId);
      await Transaction.create({
        caisseId: clientCaisseId,
        type: TransactionType.DEBIT,
        montant: totalFinal,
        description: `Facture ${String(factureClient.numero)} — Transit ${t.bl || String(t._id)}`,
        date: new Date(),
        reference: String(factureClient._id),
        userId,
        sourcePaiementId: String(factureClient._id),
      });
      await Caisse.findByIdAndUpdate(clientCaisseId, { $inc: { solde: -totalFinal } });
    } catch (e) {
      console.error('DEBIT caisse client (autoCreateFactureClient):', e);
    }
  }
}

/**
 * Si TOUTES les désignations actives d'un transit sont VALIDEE_ADMIN
 * (REJETEE ignorées) :
 *   - bascule transit.statut → VALIDE
 *   - clôture la FactureManutention liée (statut → CLOTURE)
 *   - crée automatiquement la facture client (idempotent)
 *
 * Idempotent.
 */
export async function finalizeTransitIfAllValidated(
  transitId: string,
  userId: string
): Promise<{ allValidated: boolean }> {
  if (!mongoose.isValidObjectId(transitId)) return { allValidated: false };
  const t = await Transit.findById(transitId);
  if (!t) return { allValidated: false };

  const designations = t.designations || [];
  if (designations.length === 0) return { allValidated: false };

  let hasUnfinalised = false;
  let validCount = 0;
  for (const d of designations) {
    if (d.statutDesignation === DesignationStatus.VALIDEE_ADMIN) {
      validCount += 1;
    } else if (d.statutDesignation === DesignationStatus.REJETEE) {
      // ignore
    } else {
      hasUnfinalised = true;
      break;
    }
  }
  if (hasUnfinalised || validCount === 0) return { allValidated: false };

  if (t.statut !== TransitStatus.VALIDE) {
    t.statut = TransitStatus.VALIDE;
    t.valideAdminBy = String(userId);
    t.valideAdminAt = new Date();
    await t.save();
  }

  if (t.factureManutentionId) {
    try {
      await FactureManutention.findByIdAndUpdate(t.factureManutentionId, {
        statut: FactureManutentionStatus.CLOTURE,
      });
    } catch (e) {
      console.error('Clôture FactureManutention (finalizeTransit):', e);
    }
  }

  // Auto-création de la facture client
  try {
    await autoCreateFactureClient(t, userId);
  } catch (e) {
    console.error('autoCreateFactureClient (finalizeTransit):', e);
  }

  return { allValidated: true };
}
