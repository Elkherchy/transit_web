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
    if (process.env.NODE_ENV !== "production") return;
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
            <Component {...pageProps} />
          </AuthProvider>
        </SessionProvider>
      </div>
    </I18nextProvider>
  );
}
