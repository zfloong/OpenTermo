import { create } from "zustand";

export type ThemeId = "deep-blue" | "light" | "tabby";

export interface ThemeOverride {
  accentHue: number;
  glassAlpha: number;
  borderAlpha: number;
}

const DEFAULT_OVERRIDES: Record<ThemeId, ThemeOverride> = {
  "deep-blue": { accentHue: 210, glassAlpha: 0.88, borderAlpha: 0.13 },
  "light":     { accentHue: 217, glassAlpha: 0.82, borderAlpha: 0.14 },
  "tabby":     { accentHue: 255, glassAlpha: 0.82, borderAlpha: 0.13 },
};

interface SettingsState {
  theme: ThemeId;
  fontSize: number;
  overrides: Partial<Record<ThemeId, ThemeOverride>>;

  setTheme: (t: ThemeId) => void;
  setFontSize: (s: number) => void;
  saveOverride: (themeId: ThemeId, o: ThemeOverride) => void;
  resetOverride: (themeId: ThemeId) => void;
  resetAllOverrides: () => void;
  getEffectiveOverride: (themeId: ThemeId) => ThemeOverride;
}

function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem("opentermo-theme");
    if (v === "light" || v === "tabby" || v === "deep-blue") return v as ThemeId;
  } catch {}
  return "deep-blue";
}

function loadOverrideKey(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadAllOverrides(): Partial<Record<ThemeId, ThemeOverride>> {
  const result: Partial<Record<ThemeId, ThemeOverride>> = {};
  for (const tid of ["deep-blue", "light", "tabby"] as ThemeId[]) {
    const o = loadOverrideKey(`opentermo-override-${tid}`);
    if (o) result[tid] = o;
  }
  return result;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: loadTheme(),
  fontSize: (() => {
    try { const v = localStorage.getItem("opentermo-fontsize"); if (v) return Number(v); } catch {}
    return 14;
  })(),
  overrides: loadAllOverrides(),

  setTheme: (t) => {
    localStorage.setItem("opentermo-theme", t);
    set({ theme: t });
  },
  setFontSize: (s) => {
    const clamped = Math.max(10, Math.min(28, Math.round(s)));
    localStorage.setItem("opentermo-fontsize", String(clamped));
    set({ fontSize: clamped });
  },
  saveOverride: (themeId, o) => {
    localStorage.setItem(`opentermo-override-${themeId}`, JSON.stringify(o));
    set((s) => ({ overrides: { ...s.overrides, [themeId]: o } }));
  },
  resetOverride: (themeId) => {
    localStorage.removeItem(`opentermo-override-${themeId}`);
    set((s) => {
      const copy = { ...s.overrides };
      delete copy[themeId];
      return { overrides: copy };
    });
  },
  resetAllOverrides: () => {
    for (const tid of ["deep-blue", "light", "tabby"] as ThemeId[]) {
      localStorage.removeItem(`opentermo-override-${tid}`);
    }
    set({ overrides: {} });
  },
  getEffectiveOverride: (themeId) => {
    return get().overrides[themeId] || DEFAULT_OVERRIDES[themeId];
  },
}));
