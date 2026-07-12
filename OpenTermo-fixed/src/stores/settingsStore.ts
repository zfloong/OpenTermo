import { create } from "zustand";

export type ThemeId = "deep-blue" | "light" | "tabby";
export type CursorStyle = "bar" | "block" | "underline";

interface SettingsState {
  theme: ThemeId;
  fontSize: number;
  fontFamily: string;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  glassAlpha: number;
  borderAlpha: number;

  setTheme: (t: ThemeId) => void;
  setFontSize: (s: number) => void;
  setFontFamily: (f: string) => void;
  setCursorStyle: (s: CursorStyle) => void;
  setCursorBlink: (b: boolean) => void;
  setGlassAlpha: (a: number) => void;
  setBorderAlpha: (a: number) => void;
}

function loadStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? Number(v) : fallback; } catch { return fallback; }
}
function loadBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v !== null ? v === "true" : fallback; } catch { return fallback; }
}
function loadTheme(): ThemeId {
  const v = loadStr("opentermo-theme", "deep-blue");
  if (v === "light" || v === "tabby" || v === "deep-blue") return v as ThemeId;
  return "deep-blue";
}
function loadCursorStyle(): CursorStyle {
  const v = loadStr("opentermo-cursor-style", "bar");
  if (v === "block" || v === "underline") return v as CursorStyle;
  return "bar";
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: loadTheme(),
  fontSize: loadNum("opentermo-fontsize", 14),
  fontFamily: loadStr("opentermo-font-family", ""),
  cursorStyle: loadCursorStyle(),
  cursorBlink: loadBool("opentermo-cursor-blink", true),
  glassAlpha: loadNum("opentermo-glass-alpha", 0.85),
  borderAlpha: loadNum("opentermo-border-alpha", 0.13),

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
  setBorderAlpha: (a) => {
    const clamped = Math.max(0.05, Math.min(0.30, Math.round(a * 100) / 100));
    localStorage.setItem("opentermo-border-alpha", String(clamped));
    set({ borderAlpha: clamped });
  },
}));
