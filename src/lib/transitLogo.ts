/** Fichier dans `public/` — logo compact (remplace l’ancien bandeau transit.png). */
export const TRANSIT_LOGO_FILENAME = 'transit-logo.png';

export const EMAMA_TRANSIT_AR = 'امامة اترانزيت';

export function transitLogoPublicPath(): string {
  return `/${TRANSIT_LOGO_FILENAME}`;
}

/** URL absolue pour navigateur / React-PDF côté client. */
export function transitLogoPublicUrl(origin?: string): string {
  const p = transitLogoPublicPath();
  const o = origin?.trim();
  if (o && /^https?:\/\//i.test(o)) {
    return `${o.replace(/\/$/, '')}${p}`;
  }
  return p;
}
