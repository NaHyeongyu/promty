import { useSyncExternalStore } from "react";

export type AppTheme = "bright" | "dark";

export const DEFAULT_APP_THEME: AppTheme = "dark";
export const THEME_STORAGE_KEY = "promty.theme";

const themeListeners = new Set<() => void>();
let currentTheme: AppTheme = DEFAULT_APP_THEME;
let isInitialized = false;

export function resolveAppTheme(value: string | null | undefined): AppTheme {
  return value === "bright" || value === "dark" ? value : DEFAULT_APP_THEME;
}

function readStoredTheme() {
  try {
    return resolveAppTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_THEME;
  }
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "bright" ? "light" : "dark";
}

function emitThemeChange() {
  themeListeners.forEach((listener) => listener());
}

export function initializeTheme() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  currentTheme = readStoredTheme();
  applyTheme(currentTheme);
  document.documentElement.removeAttribute("data-design-concept");

  if (isInitialized) return;
  isInitialized = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const nextTheme = resolveAppTheme(event.newValue);
    if (nextTheme === currentTheme) return;
    currentTheme = nextTheme;
    applyTheme(currentTheme);
    emitThemeChange();
  });
}

export function setAppTheme(theme: AppTheme) {
  currentTheme = theme;
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for the current session.
  }
  emitThemeChange();
}

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function getThemeSnapshot() {
  return currentTheme;
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    () => DEFAULT_APP_THEME,
  );
  return { setTheme: setAppTheme, theme };
}
