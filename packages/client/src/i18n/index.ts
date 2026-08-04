// ============================================================================
// i18n — app localization (react-i18next)
// ============================================================================
// Nine languages, statically bundled to match EMP Cloud. Language is detected from localStorage
// then the browser, persisted to localStorage, and applied to <html lang/dir>
// so Arabic renders right-to-left. Missing keys fall back to English.
// ============================================================================
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import pt from "./locales/pt.json";

export interface LanguageMeta {
  code: string;
  /** Endonym — the language's own name, shown in the switcher. */
  label: string;
  dir: "ltr" | "rtl";
  flag: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "English", flag: "EN", dir: "ltr" },
  { code: "hi", label: "\u0939\u093f\u0928\u094d\u0926\u0940", flag: "HI", dir: "ltr" },
  { code: "es", label: "Espa\u00f1ol", flag: "ES", dir: "ltr" },
  { code: "fr", label: "Fran\u00e7ais", flag: "FR", dir: "ltr" },
  { code: "de", label: "Deutsch", flag: "DE", dir: "ltr" },
  { code: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", flag: "AR", dir: "rtl" },
  { code: "pt", label: "Portugu\u00eas", flag: "PT", dir: "ltr" },
  { code: "ja", label: "\u65e5\u672c\u8a9e", flag: "JA", dir: "ltr" },
  { code: "zh", label: "\u4e2d\u6587", flag: "ZH", dir: "ltr" },
];

const RTL_LANGS = new Set(LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code));

/** Apply <html lang> and text direction for the active language. */
export function applyDocumentDirection(lng: string): void {
  const base = (lng || "en").split("-")[0];
  const dir = RTL_LANGS.has(base) ? "rtl" : "ltr";
  document.documentElement.lang = base;
  document.documentElement.dir = dir;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      hi: { translation: hi },
      fr: { translation: fr },
      ar: { translation: ar },
      pt: { translation: pt },
      de: { translation: de },
      ja: { translation: ja },
      zh: { translation: zh },
    },
    fallbackLng: "en",
    supportedLngs: LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // treat en-US as en, etc.
    interpolation: { escapeValue: false }, // React already escapes
    react: { useSuspense: false }, // resources are bundled synchronously
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "empcloud-language",
      caches: ["localStorage"],
      convertDetectedLanguage: (lng: string) => lng.split("-")[0],
    },
  });

// Keep <html> in sync now and on every change.
applyDocumentDirection(i18n.language);
i18n.on("languageChanged", applyDocumentDirection);

export default i18n;
