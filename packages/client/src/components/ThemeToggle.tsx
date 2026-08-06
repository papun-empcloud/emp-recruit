import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getActiveTheme, toggleTheme, type Theme } from "@/lib/theme";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getActiveTheme());

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      title={t(theme === "dark" ? "common.switchLightMode" : "common.switchDarkMode")}
      aria-label={t("nav.toggleTheme")}
      className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white dark:focus-visible:ring-offset-[#0f172a]"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
