import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getNextAuthSecret } from '@/lib/nextAuthSecret';

/**
 * Routes publiques (whitelist stricte). Tout le reste exige un token.
 * - /login                  : page de connexion
 * - PUBLIC_AUTH_API_PATHS   : endpoints NextAuth strictement nécessaires au flux de login
 * - /_next, favicon, assets : exclus via le matcher plus bas
 */
const PUBLIC_PATHS: ReadonlyArray<string> = ['/login', '/privacy'];

/**
 * Whitelist stricte des endpoints `/api/auth/*` accessibles sans token.
 * Tout le reste sous `/api/auth/` (ex : `/api/auth/me`, `/api/auth/register`)
 * exige une authentification.
 */
const PUBLIC_AUTH_API_PATHS: ReadonlyArray<string> = [
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/error',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/session',
];

/** Préfixes NextAuth dynamiques : /api/auth/callback/*, /api/auth/signin/*, /api/auth/signout/* */
const PUBLIC_AUTH_API_PREFIXES: ReadonlyArray<string> = [
  '/api/auth/callback/',
  '/api/auth/signin/',
  '/api/auth/signout/',
];

/** Page d'accueil — redirige vers /dashboard si connecté, sinon /login. */
const ROOT_PATH = '/';

/**
 * Routes (page ou API) accessibles aux 2 rôles admin (super + scopé transit).
 * Le filtrage métier fin (un ADMIN_TRANSIT ne crée que ses rôles) est appliqué
 * dans les handlers. Ce middleware se contente de bloquer les non-admins.
 */
const ADMIN_ONLY_PREFIXES: ReadonlyArray<string> = [
  '/dashboard/utilisateurs',
];

const ADMIN_ROLES: ReadonlySet<string> = new Set([
  'ADMIN',
  'ADMIN_TRANSIT',
]);

/** /api/users/payeurs : liste accessible aux rôles non-admin (caissier/comptable). */
const PUBLIC_AUTH_API_USER_PATHS: ReadonlyArray<string> = [
  '/api/users/payeurs',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_AUTH_API_PATHS.includes(pathname)) return true;
  if (PUBLIC_AUTH_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  // Toutes les routes /api/users/* sont admin SAUF la liste payeurs
  if (pathname.startsWith('/api/users')) {
    if (PUBLIC_AUTH_API_USER_PATHS.includes(pathname)) return false;
    return true;
  }
  return false;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/** En-têtes de sécurité appliqués à toutes les réponses. */
function applySecurityHeaders(response: NextResponse): NextResponse {
  const headers = response.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // HSTS uniquement en production (sinon casse le dev http://)
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  return response;
}

function unauthorized(request: NextRequest, pathname: string): NextResponse {
  if (isApiPath(pathname)) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
    );
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

function forbidden(request: NextRequest, pathname: string): NextResponse {
  if (isApiPath(pathname)) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 })
    );
  }
  return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Whitelist publique : laisser passer en ajoutant juste les en-têtes de sécurité
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // 2. Récupérer le token (toute autre route en exige un — deny by default)
  const token = await getToken({
    req: request,
    secret: getNextAuthSecret(),
  });

  // 3. Page racine : redirige selon l'état de session
  if (pathname === ROOT_PATH) {
    const target = new URL(token ? '/dashboard' : '/login', request.url);
    return applySecurityHeaders(NextResponse.redirect(target));
  }

  if (!token) {
    return unauthorized(request, pathname);
  }

  // 4. Contrôle de rôle pour les routes admin (super + scopés).
  if (isAdminPath(pathname) && !ADMIN_ROLES.has(String(token.role || ''))) {
    return forbidden(request, pathname);
  }

  // 5. Propager l'identité au handler (défense en profondeur, en plus de withAuth*)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', token.sub || '');
  requestHeaders.set('x-user-role', (token.role as string) || '');

  return applySecurityHeaders(
    NextResponse.next({
      request: { headers: requestHeaders },
    })
  );
}

export const config = {
  matcher: [
    // Tout sauf assets statiques. Les /api/auth/* sont gérées dans le middleware (whitelist).
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
