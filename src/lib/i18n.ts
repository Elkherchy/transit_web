import i18n, { type Resource } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import frCommon from '../../public/locales/fr/common.json';
import arCommon from '../../public/locales/ar/common.json';

export const SUPPORTED_LANGS = ['fr', 'ar'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const RTL_LANGS: SupportedLang[] = ['ar'];

export function isRtl(lang: string | undefined): boolean {
  return RTL_LANGS.includes((lang || '').split('-')[0] as SupportedLang);
}

const RESOURCES: Resource = {
  fr: { common: frCommon as unknown as Record<string, string> },
  ar: { common: arCommon as unknown as Record<string, string> },
};

/**
 * Init i18next côté client. Les traductions sont **embarquées dans le bundle**
 * via import JSON statique → disponibles instantanément (pas de chargement
 * HTTP, pas de flash de clés). Idempotent.
 *
 * Détection : cookie `i18next` → localStorage → navigateur.
 */
export function initI18n() {
  if (i18n.isInitialized) return i18n;

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: RESOURCES,
      lng: 'ar',
      fallbackLng: 'ar',
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      ns: ['common'],
      defaultNS: 'common',
      detection: {
        order: ['cookie', 'localStorage', 'navigator', 'htmlTag'],
        caches: ['cookie', 'localStorage'],
        lookupCookie: 'i18next',
        lookupLocalStorage: 'i18next',
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      load: 'languageOnly',
      returnNull: false,
    });

  return i18n;
}

/**
 * Init i18n côté serveur (Next.js GSSP / GIP). Lit la langue depuis le cookie
 * et la passe à i18n. Renvoie la langue résolue pour la passer en prop client.
 * Langue par défaut : **arabe** (peut être changée par cookie i18next).
 */
export function getServerLang(cookieHeader?: string): SupportedLang {
  if (!cookieHeader) return 'ar';
  const match = cookieHeader.match(/(?:^|;\s*)i18next=([^;]+)/);
  const raw = match?.[1];
  if (!raw) return 'ar';
  const lang = decodeURIComponent(raw).split('-')[0] as SupportedLang;
  return SUPPORTED_LANGS.includes(lang) ? lang : 'ar';
}

export default i18n;
