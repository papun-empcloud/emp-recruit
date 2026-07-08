import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getActiveTheme, toggleTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getActiveTheme());

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
