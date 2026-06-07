/**
 * Secret unique partagé entre NextAuth et le middleware Edge.
 * Plante au boot si la variable n'est pas définie — pas de fallback en clair.
 */
export function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      '[Security] NEXTAUTH_SECRET manquant ou trop court (>=32 chars requis). ' +
        'Génère-le avec: `openssl rand -base64 48`'
    );
  }
  return secret;
}
