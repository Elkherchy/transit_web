import type { NextApiResponse } from 'next';
import connectDB from '@/lib/db';
import { Caisse } from '@/models';
import { ApiResponse, ICaisse, UserRole, CompteType, CaisseKind } from '@/types';
import { AuthenticatedRequest, withAuth } from '@/middleware/auth';

// GET /api/banques - Liste tous les comptes banque
async function listBanques(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisse[]>>) {
  try {
    await connectDB();
    
    const banques = await Caisse.find({ type: CompteType.BANQUE, actif: true })
      .sort({ nom: 1 })
      .lean();
    
    return res.status(200).json({
      success: true,
      data: banques as ICaisse[],
    });
  } catch (error) {
    console.error('List banques error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

// POST /api/banques - Créer un compte banque (admin uniquement)
async function createBanque(req: AuthenticatedRequest, res: NextApiResponse<ApiResponse<ICaisse>>) {
  try {
    await connectDB();
    
    const { nom, numeroCompte, iban, swift, solde, description } = req.body;
    
    if (!nom || !numeroCompte) {
      return res.status(400).json({
        success: false,
        error: 'Le nom et le numéro de compte sont requis',
      });
    }
    
    const banque = await Caisse.create({
      nom,
      type: CompteType.BANQUE,
      kind: CaisseKind.GENERAL,
      numeroCompte,
      iban: iban || undefined,
      swift: swift || undefined,
      solde: solde || 0,
      description: description || undefined,
    });
    
    return res.status(201).json({
      success: true,
      data: banque as ICaisse,
      message: 'Compte banque créé avec succès',
    });
  } catch (error) {
    console.error('Create banque error:', error);
    return res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
}

export default function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return withAuth(listBanques, [UserRole.ADMIN, UserRole.COMPTABLE, UserRole.CAISSIER, UserRole.AGENT_TRANSIT])(req, res);
    case 'POST':
      return withAuth(createBanque, [UserRole.ADMIN])(req, res);
    default:
      return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }
}
