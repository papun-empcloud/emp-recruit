// ============================================================================
// i18n — app localization (react-i18next)
// ============================================================================
// Nine languages, statically bundled. Language is detected from localStorage
// then the browser, persisted to localStorage, and applied to <html lang/dir>
// so Arabic renders right-to-left. Missing keys fall back to English.
// ============================================================================
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ar from "./locales/ar.json";
import pt from "./locales/pt.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";

export interface LanguageMeta {
  code: string;
  /** Endonym — the language's own name, shown in the switcher. */
  label: string;
  dir: "ltr" | "rtl";
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "hi", label: "हिन्दी", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "pt", label: "Português", dir: "ltr" },
  { code: "ja", label: "日本語", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" },
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
      hi: { translation: hi },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      ar: { translation: ar },
      pt: { translation: pt },
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
      lookupLocalStorage: "lang",
      caches: ["localStorage"],
    },
  });

// Keep <html> in sync now and on every change.
applyDocumentDirection(i18n.language);
i18n.on("languageChanged", applyDocumentDirection);

export default i18n;
