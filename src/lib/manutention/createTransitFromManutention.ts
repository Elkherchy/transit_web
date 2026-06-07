import mongoose from 'mongoose';
import { Transit, FactureManutention, User } from '@/models';
import {
  TransitStatus,
  DesignationStatus,
  UserRole,
  DESIGNATIONS_PUBLIC_DEFAULT,
} from '@/types';

/**
 * Crée un dossier Transit à partir d'une facture manutention. Appelé immédiatement
 * après la création de la facture par l'admin (workflow par-désignation).
 *
 * - Le transit reçoit les 14 désignations par défaut (`DESIGNATIONS_DEFAULT`).
 * - **Toutes les désignations démarrent à 0 MRU** — y compris « Bon de livret ».
 *   Le montant est saisi par le payeur lors du paiement.
 * - Chaque désignation est LIBRE (réservable par n'importe quel payeur).
 */
export interface CreateTransitFromManutentionInput {
  factureManutentionId: string;
  client: string;
  clientId?: string | null;
  objet: string;
  bl: string;
  actorUserId: string;
  session?: mongoose.ClientSession;
  /**
   * Si true, le transit créé est au statut BROUILLON — non visible côté
   * payeur. Utilisé quand un AGENT_TRANSIT crée la manutention : l'admin
   * transit devra valider pour passer en EN_COURS.
   */
  draft?: boolean;
}

export interface CreateTransitFromManutentionResult {
  transitId: string;
}

async function getAgentTransitAssignee(
  session?: mongoose.ClientSession
): Promise<string> {
  const agent = await User.findOne({
    role: UserRole.AGENT_TRANSIT,
    actif: true,
  })
    .select('_id')
    .session(session ?? null)
    .lean();
  if (agent) return String(agent._id);
  // Fallback : pas d'agent transit actif → on laisse l'admin comme créateur.
  return '';
}

export async function createTransitFromManutention(
  input: CreateTransitFromManutentionInput
): Promise<CreateTransitFromManutentionResult> {
  // Toutes les désignations démarrent à 0 — le payeur saisit le montant lors
  // du paiement, y compris pour « Bon de livret » (plus de prérenseignement).
  // Seulement les désignations publiques sont ajoutées automatiquement.
  // L'admin/admin transit peut ajouter manuellement les désignations
  // optionnelles (Ouvriers visite, Frais Transit, Gendarmerie, Escorte,
  // Ouvrier chargement, Fédération) après création.
  const designations = DESIGNATIONS_PUBLIC_DEFAULT.map((nom) => ({
    nom,
    montant: 0,
    statutDesignation: DesignationStatus.LIBRE,
    payeurId: null,
    reservedAt: null,
    paidAt: null,
    recuUrl: null,
    recuFilename: null,
    valideTransitBy: null,
    valideTransitAt: null,
    valideAdminBy: null,
    valideAdminAt: null,
    commentaire: null,
  }));

  const assigneeId =
    (await getAgentTransitAssignee(input.session)) || input.actorUserId;

  const transitData = {
    client: input.client?.trim() || '—',
    clientId: input.clientId || null,
    bl: input.bl.trim().toUpperCase(),
    objet: input.objet?.trim() || '—',
    date: new Date(),
    designations,
    statut: input.draft ? TransitStatus.BROUILLON : TransitStatus.EN_COURS,
    createdBy: assigneeId,
    factureManutentionId: input.factureManutentionId,
  };

  // Si une session est fournie, on l'utilise (replica set) ; sinon création
  // simple (MongoDB standalone).
  let transitId: string;
  if (input.session) {
    const created = await Transit.create([transitData], {
      session: input.session,
    });
    transitId = String(created[0]._id);
    await FactureManutention.findByIdAndUpdate(
      input.factureManutentionId,
      { transitId },
      { session: input.session }
    );
  } else {
    const created = await Transit.create(transitData);
    transitId = String(created._id);
    await FactureManutention.findByIdAndUpdate(input.factureManutentionId, {
      transitId,
    });
  }

  return { transitId };
}
