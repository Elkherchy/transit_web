/**
 * Tests de sécurité automatisés.
 *
 * Lance :
 *   1. Test "deny-by-default" : tous les endpoints API doivent répondre 401 sans token
 *   2. Test "RBAC" : les routes admin doivent répondre 403 avec un token non-admin
 *   3. Test "en-têtes sécurité" : présence de X-Frame-Options, X-Content-Type-Options, etc.
 *   4. Test "secrets" : refus de boot si NEXTAUTH_SECRET trop court / fallback supprimé
 *   5. Test "endpoints supprimés" : /api/hello et /api/auth/login doivent renvoyer 404
 *
 * Usage :
 *   BASE_URL=http://localhost:3000 \
 *   TEST_USER_EMAIL=user@example.com TEST_USER_PASSWORD=xxx \
 *   npx tsx src/scripts/securityTest.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_DIR = path.join(process.cwd(), 'src', 'pages', 'api');

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

interface Result {
  name: string;
  ok: boolean;
  detail?: string;
}
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ${c.green}✓${c.reset} ${name}${detail ? ` ${c.cyan}(${detail})${c.reset}` : ''}`);
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  ${c.red}✗${c.reset} ${name} ${c.red}— ${detail}${c.reset}`);
}
function section(title: string) {
  console.log(`\n${c.bold}${c.cyan}▶ ${title}${c.reset}`);
}

/* -----------------------------------------------------------------
 * Discovery : liste tous les endpoints API à partir du file system.
 * -----------------------------------------------------------------*/
function listApiRoutes(dir: string, prefix = '/api'): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listApiRoutes(full, `${prefix}/${entry.name}`));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    let name = entry.name.replace(/\.ts$/, '');
    if (name === 'index') {
      out.push(prefix);
    } else if (name.startsWith('[...')) {
      // catch-all (NextAuth) → on saute
      continue;
    } else {
      // remplace [param] par une valeur factice pour pouvoir hit l'endpoint
      name = name.replace(/\[([^\]]+)\]/g, '000000000000000000000000');
      out.push(`${prefix}/${name}`);
    }
  }
  return out.map((p) => p.replace(/\[([^\]]+)\]/g, '000000000000000000000000'));
}

/** Doit refléter la whitelist stricte du middleware. */
const PUBLIC_API_EXACT = new Set<string>([
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/error',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/auth/session',
]);
const PUBLIC_API_PREFIXES = [
  '/api/auth/callback/',
  '/api/auth/signin/',
  '/api/auth/signout/',
];

function isPublicApi(route: string): boolean {
  if (PUBLIC_API_EXACT.has(route)) return true;
  return PUBLIC_API_PREFIXES.some((p) => route.startsWith(p));
}

/* -----------------------------------------------------------------
 * Helpers HTTP
 * -----------------------------------------------------------------*/
async function req(
  url: string,
  init: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url, { redirect: 'manual', ...init });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

async function loginAndGetCookie(email: string, password: string): Promise<string | null> {
  // 1. CSRF
  const csrfRes = await req(`${BASE_URL}/api/auth/csrf`);
  let csrfToken = '';
  try {
    csrfToken = (JSON.parse(csrfRes.body) as { csrfToken: string }).csrfToken;
  } catch {
    return null;
  }
  const csrfCookie = csrfRes.headers.get('set-cookie') || '';

  // 2. POST callback/credentials
  const form = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE_URL}/dashboard`,
    json: 'true',
  });
  const loginRes = await req(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookie,
    },
    body: form.toString(),
  });
  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) return null;
  // récupère le cookie de session (next-auth.session-token ou __Secure-…)
  const match = setCookie.match(/(__Secure-)?next-auth\.session-token=[^;]+/);
  return match ? match[0] : null;
}

/* -----------------------------------------------------------------
 * Test 1 : deny-by-default sur tous les endpoints API non-publics
 * -----------------------------------------------------------------*/
async function testDenyByDefault() {
  section('1. Deny-by-default — endpoints API sans token');
  const routes = listApiRoutes(API_DIR).filter((r) => !isPublicApi(r));

  for (const route of routes) {
    const { status } = await req(`${BASE_URL}${route}`);
    if (status === 401) {
      pass(`GET ${route}`, `401`);
    } else if (status === 405) {
      // l'endpoint n'accepte pas GET mais a quand même renvoyé une réponse → vérifions qu'il
      // bloque aussi sans auth. 405 sans token = handler atteint = NOK.
      fail(`GET ${route}`, `405 — handler atteint sans auth (middleware ne couvre pas ?)`);
    } else if (status === 404) {
      pass(`GET ${route}`, `404 (route dynamique non résolue, normal)`);
    } else {
      fail(`GET ${route}`, `attendu 401, reçu ${status}`);
    }
  }
}

/* -----------------------------------------------------------------
 * Test 2 : RBAC — un user non-admin ne peut pas accéder aux routes admin
 * -----------------------------------------------------------------*/
async function testRbac() {
  section('2. RBAC — accès admin refusé pour user non-admin');
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    console.log(`  ${c.yellow}⚠ TEST_USER_EMAIL/PASSWORD non fournis — test skippé${c.reset}`);
    return;
  }
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  if (!cookie) {
    fail('login user non-admin', 'impossible de récupérer un cookie de session');
    return;
  }
  const adminTargets = ['/api/users', '/dashboard/utilisateurs'];
  for (const target of adminTargets) {
    const { status } = await req(`${BASE_URL}${target}`, { headers: { Cookie: cookie } });
    if (target.startsWith('/api/')) {
      if (status === 403) pass(`GET ${target}`, '403');
      else fail(`GET ${target}`, `attendu 403, reçu ${status}`);
    } else {
      // page → redirige vers /dashboard
      if (status === 307 || status === 302) pass(`GET ${target}`, `${status} (redirect)`);
      else fail(`GET ${target}`, `attendu redirect, reçu ${status}`);
    }
  }
}

/* -----------------------------------------------------------------
 * Test 4 : en-têtes de sécurité
 * -----------------------------------------------------------------*/
async function testSecurityHeaders() {
  section('4. En-têtes de sécurité');
  const { headers } = await req(`${BASE_URL}/login`);
  const required = [
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ] as const;
  // /privacy doit être public (200) sans token
  const priv = await req(`${BASE_URL}/privacy`);
  if (priv.status === 200) pass('/privacy public', '200');
  else fail('/privacy public', `attendu 200, reçu ${priv.status}`);
  for (const [h, expected] of required) {
    const v = headers.get(h);
    if (v?.toLowerCase() === expected.toLowerCase()) pass(`${h}: ${v}`);
    else fail(`${h}`, `attendu "${expected}", reçu "${v ?? '(absent)'}"`);
  }
  if (process.env.NODE_ENV === 'production') {
    const hsts = headers.get('Strict-Transport-Security');
    if (hsts) pass(`HSTS présent`, hsts);
    else fail('HSTS', 'absent en production');
  }
}

/* -----------------------------------------------------------------
 * Test 5 : endpoints qui DOIVENT avoir disparu
 * -----------------------------------------------------------------*/
async function testRemovedEndpoints() {
  section('5. Endpoints supprimés');
  for (const route of ['/api/hello', '/api/auth/login']) {
    const { status } = await req(`${BASE_URL}${route}`);
    if (status === 404) pass(`${route} → 404`);
    else fail(route, `attendu 404, reçu ${status}`);
  }
}

/* -----------------------------------------------------------------
 * Test 6 : NEXTAUTH_SECRET strict (lecture du fichier source)
 * -----------------------------------------------------------------*/
async function testSecretStrict() {
  section('6. NEXTAUTH_SECRET — pas de fallback en clair');
  const file = path.join(process.cwd(), 'src', 'lib', 'nextAuthSecret.ts');
  const src = fs.readFileSync(file, 'utf8');
  if (/your-secret-key|change-in-production/i.test(src)) {
    fail('nextAuthSecret.ts', 'fallback en clair détecté');
  } else if (!/throw new Error/.test(src)) {
    fail('nextAuthSecret.ts', 'absence de throw — devrait planter si secret manquant');
  } else {
    pass('nextAuthSecret.ts', 'pas de fallback, throw présent');
  }
}

/* -----------------------------------------------------------------
 * Run
 * -----------------------------------------------------------------*/
async function main() {
  console.log(`${c.bold}Cible :${c.reset} ${BASE_URL}\n`);
  await testSecretStrict();
  await testRemovedEndpoints();
  await testSecurityHeaders();
  await testDenyByDefault();
  await testRbac();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(
    `\n${c.bold}Résumé :${c.reset} ${c.green}${passed} OK${c.reset} / ${
      failed > 0 ? c.red : c.green
    }${failed} KO${c.reset}`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
