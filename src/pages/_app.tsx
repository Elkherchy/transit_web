import "@/styles/globals.css";
import "@/lib/pwa-install"; // register beforeinstallprompt listener at startup
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
import {
  getPwaInstallPrompt,
  clearPwaInstallPrompt,
  onPwaInstallChange,
} from "@/lib/pwa-install";

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

function detectStandalone(): boolean {
  if (typeof window === "undefined") return true; // SSR → hide
  // iOS Safari uses navigator.standalone
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => getPwaInstallPrompt() as BeforeInstallPromptEvent | null
  );
  // Initialise synchronously — no flash of banner on already-installed PWA
  const [isStandalone, setIsStandalone] = useState(detectStandalone);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const unsub = onPwaInstallChange(() => {
      setDeferredPrompt(getPwaInstallPrompt() as BeforeInstallPromptEvent | null);
    });
    window.addEventListener("appinstalled", () => setIsStandalone(true));

    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(display-mode: standalone)");
      const onChange = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
      mq.addEventListener("change", onChange);
      return () => {
        mq!.removeEventListener("change", onChange);
        unsub();
      };
    } catch {
      return () => unsub();
    }
  }, []);

  if (isStandalone || dismissed) return null;

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      clearPwaInstallPrompt();
      setDeferredPrompt(null);
      setDismissed(true);
    } else {
      setShowInstructions(true);
    }
  };

  return (
    <>
      {showInstructions && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowInstructions(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-sm">{t("pwa.instructionsTitle")}</p>

            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">💻 {t("pwa.instructionsChromePc")}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t("pwa.instructionsChromeStep1")}</li>
                <li><strong>{t("pwa.instructionsChromeStep2")}</strong></li>
                <li><strong>{t("pwa.instructionsChromeStep3")}</strong></li>
              </ol>
              <p className="text-xs text-slate-400 italic">{t("pwa.instructionsChromeBar")}</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">🤖 {t("pwa.instructionsAndroid")}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t("pwa.instructionsAndroidStep1")}</li>
                <li><strong>{t("pwa.instructionsAndroidStep2")}</strong></li>
              </ol>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">🍎 {t("pwa.instructionsIos")}</p>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal ps-4">
                <li>{t("pwa.instructionsIosStep1")}</li>
                <li><strong>{t("pwa.instructionsIosStep2")}</strong></li>
              </ol>
            </div>

            <button
              onClick={() => setShowInstructions(false)}
              className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              {t("pwa.instructionsClose")}
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
