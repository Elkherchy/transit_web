/**
 * Types communs pour l'application Emama Group — Transit
 */

// ============================================
// RÔLES ET PERMISSIONS
// ============================================

export enum UserRole {
  /** Super-admin */
  ADMIN = 'ADMIN',
  /** Admin scopé transit : gère AGENT_TRANSIT, CAISSIER, USER_PAYEUR. */
  ADMIN_TRANSIT = 'ADMIN_TRANSIT',
  AGENT_TRANSIT = 'AGENT_TRANSIT',
  USER_PAYEUR = 'USER_PAYEUR',
  COMPTABLE = 'COMPTABLE',
  CAISSIER = 'CAISSIER',
}

/**
 * Sous-ensemble de rôles que chaque admin peut créer / gérer.
 * Le super-ADMIN peut créer n'importe quel rôle ; les admins scopés sont
 * restreints à leur domaine. Utilisé côté API et UI pour filtrer la liste
 * des rôles assignables.
 */
export const ADMIN_TRANSIT_CREATABLE_ROLES: readonly UserRole[] = [
  UserRole.AGENT_TRANSIT,
  UserRole.CAISSIER,
  UserRole.USER_PAYEUR,
] as const;

export enum CaisseType {
  TRANSIT = 'TRANSIT',
}

/**
 * Registre des caisses :
 * - GENERAL : caisse générale de la société
 * - USER    : caisse propre à un payeur (kind=USER, payeurId)
 * - CLIENT  : caisse client (kind=CLIENT, clientId)
 */
export enum CaisseKind {
  GENERAL = 'GENERAL',
  USER = 'USER',
  CLIENT = 'CLIENT',
}

/** Type de compte : Caisse physique ou Banque */
export enum CompteType {
  GENERAL = 'GENERAL',
  CAISSE = 'CAISSE',
  BANQUE = 'BANQUE',
}

// ============================================
// UTILISATEUR
// ============================================

export interface IUser {
  _id: string;
  nom: string;
  email: string;
  password: string;
  role: UserRole;
  caisse?: CaisseType;
  caisseCompteId?: string;
  telephone?: string;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserCreate {
  nom: string;
  email: string;
  password: string;
  role: UserRole;
  caisse?: CaisseType;
  caisseCompteId?: string;
  telephone?: string;
}

export interface IUserResponse {
  _id: string;
  nom: string;
  email: string;
  role: UserRole;
  caisse?: CaisseType;
  caisseCompteId?: string;
  telephone?: string;
  actif: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// TRANSIT - Client (référentiel)
// ============================================

export interface ITransitClient {
  _id: string;
  nom: string;
  actif: boolean;
}

// ============================================
// TRANSIT - Dossier
// ============================================

export enum TransitStatus {
  EN_COURS = 'EN_COURS',
  BROUILLON = 'BROUILLON',
  FACTURE_EMISE = 'FACTURE_EMISE',
  EN_VALIDATION = 'EN_VALIDATION',
  /** Validé par agent transit (toutes désignations contrôlées). Attend validation admin. */
  VALIDE_TRANSIT = 'VALIDE_TRANSIT',
  VALIDE = 'VALIDE',
  CLOTURE = 'CLOTURE',
}

/**
 * Statut d'une désignation au sein d'un dossier transit (workflow par-désignation).
 * - LIBRE              : aucun payeur n'a pris cette désignation
 * - RESERVEE           : un payeur a verrouillé la désignation (les autres ne peuvent plus la prendre)
 * - PAYEE              : payeur a uploadé un reçu — en attente de contrôle agent transit
 * - VALIDEE_TRANSIT    : agent transit a validé le reçu/paiement
 * - VALIDEE_ADMIN      : admin a validé la journée — désignation cloturée
 * - REJETEE            : agent transit a rejeté le paiement (le verrou se libère)
 */
export enum DesignationStatus {
  LIBRE = 'LIBRE',
  RESERVEE = 'RESERVEE',
  PAYEE = 'PAYEE',
  VALIDEE_TRANSIT = 'VALIDEE_TRANSIT',
  VALIDEE_ADMIN = 'VALIDEE_ADMIN',
  REJETEE = 'REJETEE',
}

export interface IDesignation {
  _id?: string;
  nom: string;
  montant: number;
  /** Statut de la désignation dans le workflow par-désignation */
  statutDesignation?: DesignationStatus;
  /** Payeur qui a réservé/payé cette désignation */
  payeurId?: string;
  reservedAt?: Date;
  paidAt?: Date;
  /** Reçu scanné par le payeur lors du paiement (1er upload, legacy) */
  recuUrl?: string;
  recuFilename?: string;
  /** Tous les reçus uploadés au paiement (multi-upload). */
  recus?: Array<{
    _id?: string;
    key: string;
    name?: string;
    size?: number;
    uploadedAt?: Date;
  }>;
  /** Validation par l'agent transit après contrôle */
  valideTransitBy?: string;
  valideTransitAt?: Date;
  /** Validation finale par admin (lors de la clôture journée) */
  valideAdminBy?: string;
  valideAdminAt?: Date;
  /** Commentaire (raison de rejet, etc.) */
  commentaire?: string;
}

export interface IDocument {
  _id?: string;
  key: string;
  name: string;
  size: number;
  uploadedAt: Date;
}

export interface ITransit {
  _id: string;
  /** Nom affiché (dénormalisé depuis le client référencé ou saisi à la main) */
  client: string;
  /** Référence vers Client si choisi / créé depuis le combobox */
  clientId?: string;
  bl: string;
  objet: string;
  date: Date;
  designations: IDesignation[];
  documents?: IDocument[];
  /** Intérêts (MRU) — synchronisé avec la facture liée lorsqu’elle existe */
  interet?: number;
  statut: TransitStatus;
  createdBy: string;
  /** Facture manutention source (admin crée la facture → transit auto-créé) */
  factureManutentionId?: string;
  /** Journée caisse à laquelle ce transit est rattaché (workflow par jour) */
  journeeId?: string;
  /** Validation globale du dossier par agent transit (toutes désignations VALIDEE_TRANSIT) */
  valideTransitBy?: string;
  valideTransitAt?: Date;
  /** Validation finale par admin → déclenche création facture client */
  valideAdminBy?: string;
  valideAdminAt?: Date;
  /** Facture client générée automatiquement après validation admin */
  factureClientId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransitCreate {
  client: string;
  clientId?: string;
  bl: string;
  objet: string;
  date: Date;
  designations?: IDesignation[];
}

// ============================================
// TRANSIT - Facture
// ============================================

export enum FactureStatus {
  BROUILLON = 'BROUILLON',
  EMIS = 'EMIS',
  /** Payeur a déclaré un paiement + reçu — en attente de validation comptable / admin */
  EN_VALIDATION = 'EN_VALIDATION',
  /** Paiement partiel effectué, reste à payer */
  EN_PAYE = 'EN_PAYE',
  /** Facture complètement payée */
  PAYE = 'PAYE',
}

/** Métadonnées facture payeur sur une ligne de liste transit (GET /api/transit, USER_PAYEUR) */
export interface ITransitPayeurFactureRow {
  _id: string;
  statut: FactureStatus;
  soumettrePaiementDisponible: boolean;
}

/** Aperçu du payeur désigné sur une facture (populate) */
export interface IFacturePayeur {
  _id: string;
  nom: string;
  email: string;
}

export interface IFacture {
  _id: string;
  transitId: string;
  bl?: string;
  transitClient?: string;
  transitObjet?: string;
  numero: string;
  totalOperations: number;
  interet: number;
  totalFinal: number;
  statut: FactureStatus;
  dateEmission?: Date;
  /** Client (référence Client) — utilisé pour la facturation côté client */
  clientId?: string;
  /** Utilisateur USER_PAYEUR responsable du règlement */
  payeurId?: string;
  payeur?: IFacturePayeur;
  /**
   * false dès qu'un paiement non rejeté existe (déclaration ou validation en cours).
   * Le payeur désigné ne doit plus être changé depuis la facture.
   */
  payeurModifiable?: boolean;
  /** Montant déjà payé (pour les paiements partiels) */
  montantPaye?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// TRANSIT - Paiement
// ============================================

export enum PaiementStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  EN_VALIDATION = 'EN_VALIDATION',
  VALIDE = 'VALIDE',
  REJETE = 'REJETE',
}

export interface IPaiement {
  _id: string;
  factureId: string;
  factureNumero?: string;
  montant: number;
  datePaiement: Date;
  recuUrl?: string;
  recuFilename?: string;
  statut: PaiementStatus;
  payeurId: string;
  validePar?: string;
  dateValidation?: Date;
  commentaire?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// MANUTENTION - Facture
// ============================================

export enum FactureManutentionStatus {
  BROUILLON = 'BROUILLON',
  /** Créée par AGENT_TRANSIT — attend validation par ADMIN_TRANSIT.
   *  Non visible côté payeur tant que pas validée. */
  EN_ATTENTE_VALIDATION = 'EN_ATTENTE_VALIDATION',
  EN_ATTENTE_PAIEMENT = 'EN_ATTENTE_PAIEMENT',
  PAIEMENT_PARTIEL = 'PAIEMENT_PARTIEL',
  PAYE_EN_ATTENTE_VALIDATION = 'PAYE_EN_ATTENTE_VALIDATION',
  CLOTURE = 'CLOTURE',
}

export interface ILigneEntreprise {
  nomEntreprise: string;
  bl: string;
  montant: number;
}

export interface IFactureManutention {
  _id: string;
  bl: string;
  /** Client (saisi par admin lors de la création — propagé au transit auto-créé) */
  client?: string;
  clientId?: string;
  /** Objet du dossier — propagé au transit */
  objet?: string;
  lignesEntreprise: ILigneEntreprise[];
  bonLivret: number;
  documents?: IDocument[];
  statut: FactureManutentionStatus;
  payeurId?: string;
  createdBy: string;
  transitId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFactureManutentionCreate {
  bl: string;
  client?: string;
  clientId?: string;
  objet?: string;
  lignesEntreprise: ILigneEntreprise[];
}

// ============================================
// MANUTENTION - Paiement
// ============================================

export enum ManutentionPaiementStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  EN_VALIDATION = 'EN_VALIDATION',
  VALIDE = 'VALIDE',
  REJETE = 'REJETE',
}

export interface IManutentionPaiement {
  _id: string;
  factureManutentionId: string;
  montant: number;
  datePaiement: Date;
  recuUrl?: string;
  recuFilename?: string;
  statut: ManutentionPaiementStatus;
  payeurId: string;
  validePar?: string;
  dateValidation?: Date;
  commentaire?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// CAISSE
// ============================================

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/** Compte caisse ou banque (document Mongo) */
export interface ICaisse {
  _id: string;
  nom: string;
  /** Type de compte : GENERAL, CAISSE ou BANQUE */
  type: CompteType;
  kind: CaisseKind;
  /** Si kind USER — id du USER_PAYEUR propriétaire */
  payeurId?: string;
  /** Si kind CLIENT — id du Client propriétaire */
  clientId?: string;
  /** Si kind USER — id du CAISSIER propriétaire */
  caissierUserId?: string;
  actif: boolean;
  /** Caisse générale qui reçoit le reflet des opérations des caisses payeur */
  isDefaultGeneral: boolean;
  /** Banque par défaut du domaine. */
  isDefaultBanque?: boolean;
  /** Domaine fonctionnel. */
  caisseType?: CaisseType;
  /** Solde du compte */
  solde: number;
  /** Numéro de compte (pour les banques) */
  numeroCompte?: string;
  /** IBAN (pour les banques) */
  iban?: string;
  /** SWIFT (pour les banques) */
  swift?: string;
  /** Description du compte */
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICaisseListItem extends ICaisse {
  payeur?: { _id: string; nom: string; email: string };
  /** Statut de validation : 'EN_ATTENTE' pour un compte créé par AGENT_TRANSIT,
   *  'VALIDE' sinon. Défaut côté lecture : VALIDE. */
  statut?: 'EN_ATTENTE' | 'VALIDE';
  createdBy?: string;
}

export interface ITransaction {
  _id: string;
  caisseId: string;
  type: TransactionType;
  montant: number;
  description: string;
  date: Date;
  reference?: string;
  userId: string;
  vehiculeId?: string;
  vehiculeMatricule?: string;
  /** Si défini, cette ligne est le reflet dans la caisse générale d’une opération payeur */
  mirrorSourceId?: string;
  /** Référence paiement pour ne pas dupliquer les écritures caisse à la validation */
  sourcePaiementId?: string;
  /** Nom de la caisse d'origine — renseigné quand la liste consultée agrège
   *  plusieurs caisses (ex : générale + caisses payeurs). */
  caisseNom?: string;
  /** Kind de la caisse d'origine (GENERAL, USER, CLIENT…) — utile pour
   *  distinguer les opérations payeur dans la liste de la caisse générale. */
  caisseKind?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// DESIGNATIONS CONFIGURABLES
// ============================================

export interface IDesignationConfig {
  _id: string;
  nom: string;
  actif: boolean;
  ordre: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Désignations confidentielles, visibles uniquement par ADMIN / ADMIN_TRANSIT.
 * Elles ne sont PAS ajoutées par défaut lors de la création d'un dossier transit
 * — l'admin peut les ajouter manuellement (frais optionnels). Les USER_PAYEUR
 * ne les voient pas et ne peuvent pas les payer.
 */
export const DESIGNATIONS_ADMIN_ONLY = [
  'Ouvriers visite',
  'Frais Transit',
  'Gendarmerie',
  'Escorte',
  'Ouvrier chargement',
  'Fédération',
  'Amende',
];

/** Désignations publiques ajoutées automatiquement à tout nouveau dossier. */
export const DESIGNATIONS_PUBLIC_DEFAULT = [
  'Bon de livret',
  'Liquid. douane',
  'TS',
  'Facture Port',
  'Camion',
  'Bonne de Sortie Douanes',
  'Sogetrap',
];

/** Désignations à frais fixes (montant plafonné côté serveur).
 *  Pour l'instant, seule « Bonne de Sortie Douanes » a un plafond. */
export const DESIGNATION_FIXED_FEES: Record<string, number> = {
  'Bonne de Sortie Douanes': 200,
};

/** Désignations pour lesquelles le payeur n'a PAS besoin de joindre un reçu
 *  (paiements « cash » sans justificatif). */
export const DESIGNATIONS_NO_RECU_REQUIRED: ReadonlyArray<string> = [
  'TS',
  'Bonne de Sortie Douanes',
  'Camion',
  'Sogetrap',
];

export function getDesignationMaxAmount(nom: string): number | null {
  const k = (nom || '').trim();
  if (k in DESIGNATION_FIXED_FEES) return DESIGNATION_FIXED_FEES[k];
  return null;
}

export function isDesignationFixedFee(nom: string): boolean {
  return (nom || '').trim() in DESIGNATION_FIXED_FEES;
}

/** True si le payeur peut payer cette désignation sans joindre de reçu. */
export function isDesignationRecuOptional(nom: string): boolean {
  return DESIGNATIONS_NO_RECU_REQUIRED.includes((nom || '').trim());
}

/**
 * Liste complète historique (publiques + optionnelles). Maintenue pour
 * compatibilité descendante avec d'autres parties du code qui pourraient
 * référencer toutes les désignations connues.
 */
export const DESIGNATIONS_DEFAULT = [
  ...DESIGNATIONS_PUBLIC_DEFAULT,
  ...DESIGNATIONS_ADMIN_ONLY,
];

/** Helper : true si la désignation est admin-only (cachée aux payeurs). */
export function isDesignationAdminOnly(nom: string | undefined | null): boolean {
  if (!nom) return false;
  const norm = String(nom).trim();
  return DESIGNATIONS_ADMIN_ONLY.includes(norm);
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// JWT PAYLOAD
// ============================================

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  caisse?: CaisseType;
  caisseCompteId?: string;
}

// ============================================
// PAIE — Salariés & Bulletins de salaire
// ============================================

export enum BulletinStatut {
  BROUILLON = 'BROUILLON',
  VALIDE = 'VALIDE',
  PAYE = 'PAYE',
}

export interface ISalarieLigne {
  libelle: string;
  montant: number;
}

export interface ISalarie {
  _id: string;
  userId?: string;
  nom: string;
  prenom: string;
  poste: string;
  salaireBrut: number;
  banqueCompteId?: string;
  rib?: string;
  banque?: string;
  dateEmbauche?: Date;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISalarieCreate {
  userId?: string;
  nom: string;
  prenom: string;
  poste: string;
  salaireBrut: number;
  banqueCompteId?: string;
  rib?: string;
  banque?: string;
  dateEmbauche?: string;
}

export interface ISalarieResponse extends ISalarie {
  userNom?: string;
  userEmail?: string;
  banqueCompteNom?: string;
}

export interface IBulletinSalaire {
  _id: string;
  salarieId: string;
  periode: string; // "YYYY-MM"
  salaireBrut: number;
  primes: ISalarieLigne[];
  retenues: ISalarieLigne[];
  totalPrimes: number;
  totalRetenues: number;
  salaireNet: number;
  statut: BulletinStatut;
  caisseId?: string;
  transactionId?: string;
  payePar?: string;
  datePaiement?: Date;
  note?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBulletinSalaireCreate {
  salarieId: string;
  periode: string;
  salaireBrut?: number;
  primes?: ISalarieLigne[];
  retenues?: ISalarieLigne[];
  note?: string;
}

export interface IBulletinSalaireResponse extends IBulletinSalaire {
  salarieNom?: string;
  salariePrenom?: string;
  salariePoste?: string;
  payeParNom?: string;
  caisseNom?: string;
}

// ============================================
// JOURNEE CAISSE — Rapport journalier (workflow transit par jour)
// ============================================

/**
 * Cycle de vie d'une journée caisse :
 * - OUVERTE          : caissier travaille, alimentations & paiements payeurs en cours
 * - CLOTUREE         : caissier a clôturé sa journée — passe la main à l'agent transit
 * - VALIDEE_TRANSIT  : agent transit a validé tous les paiements/reçus de la journée
 * - VALIDEE_ADMIN    : admin a validé → factures clients créées automatiquement
 */
export enum JourneeCaisseStatus {
  OUVERTE = 'OUVERTE',
  CLOTUREE = 'CLOTUREE',
  VALIDEE_TRANSIT = 'VALIDEE_TRANSIT',
  VALIDEE_ADMIN = 'VALIDEE_ADMIN',
}

/** Alimentation admin → caisse générale (dépôt de fonds). */
export interface IAlimentationGenerale {
  transactionId: string;
  montant: number;
  date: Date;
  source?: string;
  reference?: string;
}

/** Alimentation caisse générale → caisse payeur. */
export interface IAlimentationPayeur {
  transactionId: string;
  payeurId: string;
  caisseId: string;
  montant: number;
  date: Date;
}

export enum JourneeClientPaiementStatus {
  EN_VALIDATION = 'EN_VALIDATION',
  VALIDE_TRANSIT = 'VALIDE_TRANSIT',
  REJETE_TRANSIT = 'REJETE_TRANSIT',
}

export interface IClientPaiementJournee {
  paiementId: string;
  factureId: string;
  transitId?: string;
  clientId?: string;
  clientNom?: string;
  factureNumero?: string;
  banqueId: string;
  banqueNom?: string;
  montant: number;
  date: Date;
  reference?: string;
  statut: JourneeClientPaiementStatus;
  valideTransitBy?: string;
  valideTransitAt?: Date;
}

export interface IClientFactureJournee {
  factureId: string;
  transitId?: string;
  clientId?: string;
  clientNom?: string;
  factureNumero: string;
  banqueId: string;
  banqueNom?: string;
  montant: number;
  date: Date;
}

export interface IJourneeCaisse {
  _id: string;
  /** Date de la journée (00:00 du jour, sert de clé d'unicité par caissier) */
  date: Date;
  caissierId: string;
  statut: JourneeCaisseStatus;
  /** Solde caisse générale au début de la journée (snapshot à l'ouverture) */
  soldeGeneralDebut: number;
  /** Solde caisse générale à la clôture (snapshot lors du `cloturer`) */
  soldeGeneralFin?: number;
  /** Dépôts admin → caisse générale enregistrés ce jour */
  alimentationsAdmin: IAlimentationGenerale[];
  /** Alimentations caisses payeurs effectuées par le caissier ce jour */
  alimentationsPayeurs: IAlimentationPayeur[];
  /** Paiements clients saisis en caisse (validation agent transit requise) */
  clientPaiements?: IClientPaiementJournee[];
  /** Factures clients créées manuellement en caisse durant la journée */
  clientFactures?: IClientFactureJournee[];
  /** IDs des dossiers transit travaillés ce jour (au moins une désignation payée) */
  transitsTraitesIds: string[];
  /** KPI persistés (snapshot figé au moment de la clôture) — pour conserver
   *  l'historique exact même si les transactions sont modifiées ultérieurement. */
  depotsAdminTotal?: number;
  depotsAdminCount?: number;
  alimentationsTotalReal?: number;
  alimentationsCountReal?: number;
  closedAt?: Date;
  valideTransitBy?: string;
  valideTransitAt?: Date;
  valideAdminBy?: string;
  valideAdminAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
