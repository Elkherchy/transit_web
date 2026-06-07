import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Languages, Check } from 'lucide-react';
import { SUPPORTED_LANGS, type SupportedLang } from '@/lib/i18n';

const FLAG: Record<SupportedLang, string> = {
  fr: 'FR',
  ar: 'AR',
};

export default function LanguageSwitcher({
  variant = 'dark',
}: {
  variant?: 'dark' | 'light';
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const current = (i18n.language || 'fr').split('-')[0] as SupportedLang;

  const change = useCallback(
    async (lang: SupportedLang) => {
      if (lang === current) return;
      await i18n.changeLanguage(lang);
      // Persiste côté cookie (Next.js i18n + détecteur i18next).
      try {
        document.cookie = `i18next=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch {
        /* ignore */
      }
      // Re-render complet pour rafraîchir les pages avec données serveur.
      router.replace(router.asPath, undefined, { scroll: false });
    },
    [current, i18n, router]
  );

  const triggerCls =
    variant === 'dark'
      ? 'flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors'
      : 'flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerCls}
        aria-label={t('lang.switcher')}
      >
        <Languages className="h-4 w-4" aria-hidden />
        <span className="text-xs font-bold tracking-wider">
          {FLAG[current] || 'FR'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {SUPPORTED_LANGS.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onSelect={(e) => {
              e.preventDefault();
              void change(lang);
            }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider w-7 text-center text-muted-foreground">
                {FLAG[lang]}
              </span>
              {t(`lang.${lang}`)}
            </span>
            {current === lang ? (
              <Check className="h-4 w-4 text-blue-600" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
