import { create } from "zustand";

export type ThemeId = "deep-blue" | "light";
export type CursorStyle = "bar" | "block" | "underline";

interface SettingsState {
  theme: ThemeId;
  fontSize: number;
  fontFamily: string;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** panel / window background opacity */
  glassAlpha: number;
  /** backdrop-blur radius of the panel layer, px */
  blurStrength: number;
  borderAlpha: number;
  /** terminal canvas opacity — independent of the panels */
  terminalAlpha: number;
  /** background image enabled — the custom one if set, else the bundled default */
  hasWallpaper: boolean;

  setTheme: (t: ThemeId) => void;
  setFontSize: (s: number) => void;
  setFontFamily: (f: string) => void;
  setCursorStyle: (s: CursorStyle) => void;
  setCursorBlink: (b: boolean) => void;
  setGlassAlpha: (a: number) => void;
  setBlurStrength: (v: number) => void;
  setBorderAlpha: (a: number) => void;
  setTerminalAlpha: (a: number) => void;
  setHasWallpaper: (b: boolean) => void;
}

function loadStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function loadNum(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  } catch { return fallback; }
}
function loadBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v !== null ? v === "true" : fallback; } catch { return fallback; }
}
function loadTheme(): ThemeId {
  // Retired ids (e.g. the old "tabby") fall back to the default theme.
  return loadStr("opentermo-theme", "deep-blue") === "light" ? "light" : "deep-blue";
}
function loadCursorStyle(): CursorStyle {
  const v = loadStr("opentermo-cursor-style", "bar");
  if (v === "block" || v === "underline") return v as CursorStyle;
  return "bar";
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: loadTheme(),
  fontSize: loadNum("opentermo-fontsize", 14, 10, 28),
  fontFamily: loadStr("opentermo-font-family", ""),
  cursorStyle: loadCursorStyle(),
  cursorBlink: loadBool("opentermo-cursor-blink", true),
  glassAlpha: loadNum("opentermo-glass-alpha", 0.2, 0.2, 0.95),
  blurStrength: loadNum("opentermo-blur-strength", 40, 0, 40),
  // Stored values below 0.15 come from the older 0.05-0.30 scale — lift them
  // onto the current range so borders stay visible.
  borderAlpha: loadNum("opentermo-border-alpha", 0.15, 0.15, 0.75),
  terminalAlpha: loadNum("opentermo-terminal-alpha", 0.92, 0.2, 1),
  hasWallpaper: loadBool("opentermo-background", true),

  setTheme: (t) => {
    localStorage.setItem("opentermo-theme", t);
    set({ theme: t });
  },
  setFontSize: (s) => {
    const clamped = Math.max(10, Math.min(28, Math.round(s)));
    localStorage.setItem("opentermo-fontsize", String(clamped));
    set({ fontSize: clamped });
  },
  setFontFamily: (f) => {
    localStorage.setItem("opentermo-font-family", f);
    set({ fontFamily: f });
  },
  setCursorStyle: (s) => {
    localStorage.setItem("opentermo-cursor-style", s);
    set({ cursorStyle: s });
  },
  setCursorBlink: (b) => {
    localStorage.setItem("opentermo-cursor-blink", String(b));
    set({ cursorBlink: b });
  },
  setGlassAlpha: (a) => {
    const clamped = Math.max(0.2, Math.min(0.95, Math.round(a * 100) / 100));
    localStorage.setItem("opentermo-glass-alpha", String(clamped));
    set({ glassAlpha: clamped });
  },
  setBlurStrength: (v) => {
    const clamped = Math.max(0, Math.min(40, Math.round(v)));
    localStorage.setItem("opentermo-blur-strength", String(clamped));
    set({ blurStrength: clamped });
  },
  setBorderAlpha: (a) => {
    const clamped = Math.max(0.15, Math.min(0.75, Math.round(a * 100) / 100));
    localStorage.setItem("opentermo-border-alpha", String(clamped));
    set({ borderAlpha: clamped });
  },
  setTerminalAlpha: (a) => {
    const clamped = Math.max(0.2, Math.min(1, Math.round(a * 100) / 100));
    localStorage.setItem("opentermo-terminal-alpha", String(clamped));
    set({ terminalAlpha: clamped });
  },
  setHasWallpaper: (b) => {
    localStorage.setItem("opentermo-background", String(b));
    set({ hasWallpaper: b });
  },
}));
