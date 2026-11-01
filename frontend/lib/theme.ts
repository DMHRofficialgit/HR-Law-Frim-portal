export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "dmhr-theme";
export const SHELL_PIN_STORAGE_KEY = "dmhr-shell-pinned";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
}

export function setTheme(mode: ThemeMode) {
  applyTheme(mode);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore quota */
  }
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getStoredTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function getStoredShellPinned(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SHELL_PIN_STORAGE_KEY) === "1";
}

export function setStoredShellPinned(pinned: boolean) {
  try {
    window.localStorage.setItem(SHELL_PIN_STORAGE_KEY, pinned ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Inline boot script — set on <html> before paint to avoid flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='dark'&&t!=='light')t='light';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;
