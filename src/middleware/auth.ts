import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getToken } from 'next-auth/jwt';
import { getNextAuthSecret } from '@/lib/nextAuthSecret';
import { JWTPayload, UserRole, CaisseType } from '@/types';

export interface AuthenticatedRequest extends NextApiRequest {
  user?: JWTPayload;
}

async function resolveUserFromRequest(req: NextApiRequest): Promise<JWTPayload | null> {
  const secret = getNextAuthSecret();

  try {
    const nextToken = await getToken({ req, secret });
    if (nextToken?.sub) {
      return {
        userId: nextToken.sub,
        email: (nextToken.email as string) || '',
        role: nextToken.role as UserRole,
        caisse: nextToken.caisse as CaisseType | undefined,
        caisseCompteId: nextToken.caisseCompteId as string | undefined,
      };
    }
  } catch (e) {
    console.error('[Auth] Erreur résolution token:', e instanceof Error ? e.message : 'unknown');
  }

  return null;
}

export function withAuth(handler: NextApiHandler, allowedRoles?: UserRole[]) {
  return async (req: AuthenticatedRequest, res: NextApiResponse) => {
    try {
      const decoded = await resolveUserFromRequest(req);

      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: 'Non authentifié — connectez-vous via la page de connexion',
        });
      }

      if (allowedRoles && allowedRoles.length > 0) {
        const roleStrings = allowedRoles.map((r) => String(r));
        const userRole = String(decoded.role);
        if (!roleStrings.includes(userRole)) {
          return res.status(403).json({
            success: false,
            error: 'Accès non autorisé',
          });
        }
      }

      req.user = decoded;
      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Erreur d\'authentification',
      });
    }
  };
}

export const withAdmin = (handler: NextApiHandler) =>
  withAuth(handler, [
    UserRole.ADMIN,
    UserRole.ADMIN_TRANSIT,
  ]);

/** Action restreinte aux admins du domaine transit (super-admin inclus). */
export const withAdminTransit = (handler: NextApiHandler) =>
  withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT]);

export const withAgentTransit = (handler: NextApiHandler) =>
  withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.AGENT_TRANSIT]);

export const withUserPayeur = (handler: NextApiHandler) =>
  withAuth(handler, [UserRole.ADMIN, UserRole.USER_PAYEUR]);

export const withComptable = (handler: NextApiHandler) =>
  withAuth(handler, [UserRole.ADMIN, UserRole.COMPTABLE]);

export const withCaissier = (handler: NextApiHandler) =>
  withAuth(handler, [UserRole.ADMIN, UserRole.ADMIN_TRANSIT, UserRole.CAISSIER]);

export const withTransitAccess = (handler: NextApiHandler) =>
  withAuth(handler, [
    UserRole.ADMIN,
    UserRole.ADMIN_TRANSIT,
    UserRole.AGENT_TRANSIT,
    UserRole.USER_PAYEUR,
    UserRole.COMPTABLE,
    UserRole.CAISSIER,
  ]);

// Middleware spécial pour les caissiers - permet aussi l'accès au sélecteur de payeurs
export const withCaissierAccess = (handler: NextApiHandler) =>
  withAuth(handler, [
    UserRole.ADMIN,
    UserRole.ADMIN_TRANSIT,
    UserRole.CAISSIER,
    UserRole.COMPTABLE,
  ]);
