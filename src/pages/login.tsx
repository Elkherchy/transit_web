import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { withI18n } from '@/lib/withI18n';

export const getServerSideProps = withI18n();
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** Fichier servi depuis `public/bg-login.png` → URL `/bg-login.png` */
const LOGIN_BG_URL = '/bg-login.png';

/** Dernier e-mail utilisé pour une connexion réussie (réaffiché après déconnexion, modifiable). */
const LAST_LOGIN_EMAIL_KEY = 'emama_last_login_email';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { status } = useSession();
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || didRedirectRef.current) return;
    didRedirectRef.current = true;
    window.location.assign('/dashboard');
  }, [status]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(LAST_LOGIN_EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      /* navigateur privé / quota */
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        setError(t('dashboard.login.errorInvalid'));
        return;
      }

      const trimmed = email.trim();
      if (trimmed) {
        try {
          localStorage.setItem(LAST_LOGIN_EMAIL_KEY, trimmed);
        } catch {
          /* ignore */
        }
      }

      window.location.assign(result?.url ?? '/dashboard');
    } catch {
      setError(t('dashboard.login.errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#050a14]">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-200" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white lg:flex-row">
      {/* Panneau gauche — desktop uniquement (image public/bg-login.png) */}
      <aside
        className="relative hidden min-h-0 w-[60%] shrink-0 flex-col justify-center overflow-hidden bg-[#030711] xl:w-[62%] lg:flex"
        aria-hidden={false}
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${LOGIN_BG_URL})` }}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20 lg:bg-gradient-to-r lg:from-black/55 lg:via-black/25 lg:to-transparent rtl:lg:bg-gradient-to-l"
          aria-hidden
        />
        <div className="relative z-10 px-6 py-10 sm:px-10 lg:px-14 xl:px-20 text-start rtl:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/90">
            SNTS
          </p>
          <h1 className="mt-3 max-w-xl text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl xl:text-4xl rtl:me-auto">
            {t('dashboard.login.tagline')}
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base rtl:me-auto">
            {t('dashboard.login.description')}
          </p>
        </div>
      </aside>

      {/* Formulaire — plein écran sur mobile, colonne droite sur lg+ */}
      <main className="flex min-h-dvh w-full flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:min-h-0 lg:w-[40%] lg:min-w-0 lg:shrink-0 lg:px-12 xl:w-[38%] xl:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 space-y-2 text-center lg:space-y-1 lg:text-start">
            <div className="flex justify-center lg:justify-start rtl:lg:justify-end">
              <div className="relative h-14 w-36 shrink-0 sm:h-12 sm:w-32 lg:h-11 lg:w-28">
                <Image
                  src="/emama-favorie.png"
                  alt="SNTS"
                  fill
                  className="object-contain object-center lg:object-left"
                  sizes="(max-width: 1024px) 144px, 112px"
                  priority
                />
              </div>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#02389b]">
              {t('dashboard.login.secure')}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t('dashboard.login.title')}
            </h2>
          </div>

          <div className="mb-8 h-px w-full bg-slate-200" />

          {error ? (
            <Alert variant="destructive" className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                {t('dashboard.login.emailLabel')}
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('dashboard.login.emailPlaceholder')}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-md border-slate-300 bg-white ps-12 pe-12 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-[#02389b] focus-visible:ring-[#02389b]/25"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                {t('dashboard.login.passwordLabel')}
              </Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('dashboard.login.passwordPlaceholder')}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-md border-slate-300 bg-white ps-12 pe-12 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-[#02389b] focus-visible:ring-[#02389b]/25"
                />
                <button
                  type="button"
                  className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('dashboard.login.hidePassword') : t('dashboard.login.showPassword')}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full rounded-md bg-[#0a1931] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0d2244]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="me-2 h-5 w-5 animate-spin" />
                  {t('dashboard.login.submitting')}
                </>
              ) : (
                t('dashboard.login.submit')
              )}
            </Button>
          </form>

          <footer className="mt-12 border-t border-slate-100 pt-8 text-center text-xs text-slate-500">
            <p>
              © {new Date().getFullYear()} SNTS
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
