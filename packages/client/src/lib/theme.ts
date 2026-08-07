// Light/dark theme. The `dark` class on <html> is set as early as possible by
// an inline script in index.html (avoids a flash); this module keeps it in sync
// and persists the choice.
export type Theme = "light" | "dark";

export function getActiveTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0f172a" : "#ffffff");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getActiveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
