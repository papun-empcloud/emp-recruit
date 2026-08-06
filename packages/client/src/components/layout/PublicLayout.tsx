import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

export function PublicLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-[#0b1120] dark:text-slate-100">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-white px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 dark:bg-slate-800 dark:text-white">Skip to main content</a>
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-slate-950 dark:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white" aria-hidden="true">E</span>
            {t("components.publicLayout.careers")}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          {t("components.publicLayout.poweredBy")}
        </div>
      </footer>
    </div>
  );
}
