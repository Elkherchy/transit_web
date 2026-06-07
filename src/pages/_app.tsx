import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import { Poppins } from "next/font/google";
import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { AuthProvider } from "@/contexts/AuthContext";
import i18n, {
  initI18n,
  isRtl,
  getServerLang,
  type SupportedLang,
} from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Init i18next dès le chargement du module — server ET client. Ressources
// bundlées (import statique JSON), pas de chargement async.
initI18n();

type AppI18nProps = AppProps;

/** Lit la langue depuis le cookie i18next côté client (document.cookie). */
function readClientCookieLang(): SupportedLang | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie || "";
  const match = raw.match(/(?:^|;\s*)i18next=([^;]+)/);
  return match ? getServerLang(`i18next=${match[1]}`) : null;
}

function HtmlDirSync() {
  const { i18n: i18next } = useTranslation();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const lang = (i18next.language || "ar").split("-")[0];
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [i18next.language]);
  return null;
}

function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("[SW] register failed:", err));
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}

function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true); // true = hide until we know
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Hide banner if already running as installed PWA
    const mq = window.matchMedia("(display-mode: standalone)");
    setIsStandalone(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener("change", onChange);

    // Capture native install prompt when Chrome offers it
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsStandalone(true));

    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setDismissed(true);
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      <div
        className="fixed bottom-4 start-4 end-4 z-[9999] mx-auto max-w-md flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl"
        role="alert"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="SNTS" className="h-10 w-10 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {t("pwa.installTitle", { defaultValue: "Installer SNTS" })}
          </p>
          <p className="text-xs text-muted-foreground leading-tight">
            {t("pwa.installSubtitle", { defaultValue: "Accès rapide depuis l'écran d'accueil" })}
          </p>
        </div>
        <button
          onClick={() => void install()}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
        >
          {t("pwa.installBtn", { defaultValue: "Installer" })}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      {showInstructions && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowInstructions(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-sm">
              {t("pwa.instructionsTitle", { defaultValue: "Installer l'application" })}
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-none">
              <li>🤖 <strong>Android Chrome</strong> : menu ⋮ → &ldquo;Ajouter à l&rsquo;écran d&rsquo;accueil&rdquo;</li>
              <li>🍎 <strong>iOS Safari</strong> : bouton Partager □↑ → &ldquo;Sur l&rsquo;écran d&rsquo;accueil&rdquo;</li>
              <li>💻 <strong>Desktop Chrome</strong> : icône ⊕ dans la barre d&rsquo;adresse</li>
            </ul>
            <button
              onClick={() => setShowInstructions(false)}
              className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              {t("pwa.instructionsClose", { defaultValue: "OK" })}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function useCurrentLang(): SupportedLang {
  // 1ère valeur = langue par défaut i18n (ar pour cohérence SSR/HTML initial).
  const [lang, setLang] = useState<SupportedLang>(() => {
    const fromI18n = (i18n.language || "ar").split("-")[0] as SupportedLang;
    return fromI18n;
  });
  useEffect(() => {
    // 1ère hydratation : lit le cookie pour synchroniser.
    const cookieLang = readClientCookieLang();
    if (cookieLang && cookieLang !== i18n.language) {
      void i18n.changeLanguage(cookieLang);
    }
    // Écoute les changements futurs (LanguageSwitcher, etc.) pour mettre à
    // jour `dir`/`lang` du wrapper en temps réel.
    const handler = (next: string) => {
      const norm = (next || "ar").split("-")[0] as SupportedLang;
      setLang(norm);
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);
  return lang;
}

export default function MyApp({
  Component,
  pageProps: { session, ...pageProps },
}: AppI18nProps) {
  const lang = useCurrentLang();

  return (
    <I18nextProvider i18n={i18n}>
      <div
        className={poppins.variable}
        lang={lang}
        dir={isRtl(lang) ? "rtl" : "ltr"}
      >
        <SessionProvider session={session} refetchOnWindowFocus={false}>
          <AuthProvider>
            <HtmlDirSync />
            <ServiceWorkerRegister />
            <PwaInstallBanner />
            <Component {...pageProps} />
          </AuthProvider>
        </SessionProvider>
      </div>
    </I18nextProvider>
  );
}
