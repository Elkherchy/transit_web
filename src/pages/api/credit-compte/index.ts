import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { CreditCompte, Client } from '@/models';
import { ensureClientCaisse } from '@/lib/caisse';
import { ApiResponse, ICreditCompte, UserRole } from '@/types';
import { withAuth, AuthenticatedRequest } from '@/middleware/auth';

function generateNumero(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const r = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `CC-${y}${m}-${r}`;
}

async function buildUniqueNumero(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const n = generateNumero();
    const exists = await CreditCompte.exists({ numero: n });
    if (!exists) return n;
  }
  return `CC-${Date.now()}`;
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ApiResponse<ICreditCompte | ICreditCompte[]>>
) {
  await connectDB();

  const role = req.user!.role;
  const isAllowed =
    role === UserRole.ADMIN ||
    role === UserRole.ADMIN_TRANSIT ||
    role === UserRole.AGENT_TRANSIT ||
    role === UserRole.COMPTABLE;

  if (!isAllowed) {
    return res.status(403).json({ success: false, error: 'Accès refusé' });
  }

  // ─── GET list ─────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { clientId, page = '1', limit = '50' } = req.query;
      const filter: Record<string, unknown> = {};
      if (clientId && typeof clientId === 'string') filter.clientId = clientId;

      const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
      const docs = await CreditCompte.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean();

      return res.status(200).json({ success: true, data: docs as unknown as ICreditCompte[] });
    } catch (err) {
      console.error('GET credit-compte error:', err);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  // ─── POST create ──────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    // COMPTABLE cannot create
    if (role === UserRole.COMPTABLE) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }

    try {
      const { clientId, montant, reference, description } = req.body as {
        clientId: string;
        montant: number;
        reference?: string;
        description?: string;
      };

      if (!clientId || !montant || Number(montant) <= 0) {
        return res.status(400).json({ success: false, error: 'Client et montant requis' });
      }

      const client = await Client.findById(clientId).lean();
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client introuvable' });
      }

      const numero = await buildUniqueNumero();
      const clientNom = String(client.nom || '');

      // Pre-create client caisse so it exists at validation time
      const caisseClientId = await ensureClientCaisse(clientId, clientNom);

      // ADMIN / ADMIN_TRANSIT → directly ACTIF (transactions created at validation)
      // AGENT_TRANSIT → EN_ATTENTE (pending admin validation, no transactions yet)
      const statut =
        role === UserRole.ADMIN || role === UserRole.ADMIN_TRANSIT ? 'ACTIF' : 'EN_ATTENTE';

      const creditDoc = await CreditCompte.create({
        clientId,
        clientNom,
        montant: Number(montant),
        numero,
        date: new Date(),
        reference: reference?.trim() || undefined,
        description: description?.trim() || undefined,
        caisseClientId: String(caisseClientId),
        createdBy: req.user!.userId,
        statut,
      });

      // If directly ACTIF, create transactions immediately
      if (statut === 'ACTIF') {
        const { Transaction } = await import('@/models');
        const { ensureDefaultGeneralCaisse } = await import('@/lib/caisse');
        const { CaisseType, TransactionType } = await import('@/types');

        const srcClient = `cc-client-${String(creditDoc._id)}`;
        if (!(await Transaction.findOne({ sourcePaiementId: srcClient }))) {
          await Transaction.create({
            caisseId: caisseClientId,
            type: TransactionType.CREDIT,
            montant: Number(montant),
            description: `Crédit compte — ${clientNom}${reference ? ` (${reference})` : ''} [${numero}]`,
            date: new Date(),
            reference: numero,
            userId: req.user!.userId,
            sourcePaiementId: srcClient,
          });
        }
        try {
          const general = await ensureDefaultGeneralCaisse(CaisseType.TRANSIT);
          const srcGen = `cc-general-${String(creditDoc._id)}`;
          if (!(await Transaction.findOne({ sourcePaiementId: srcGen }))) {
            await Transaction.create({
              caisseId: general._id,
              type: TransactionType.CREDIT,
              montant: Number(montant),
              description: `Crédit compte client — ${clientNom} [${numero}]`,
              date: new Date(),
              reference: numero,
              userId: req.user!.userId,
              sourcePaiementId: srcGen,
            });
          }
        } catch (txErr) {
          console.error('CreditCompte → General caisse error:', txErr);
        }
      }

      return res.status(201).json({
        success: true,
        data: creditDoc.toObject() as unknown as ICreditCompte,
      });
    } catch (err) {
      console.error('POST credit-compte error:', err);
      return res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }

  return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
}

export default withAuth(handler);
