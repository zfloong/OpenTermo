import { create } from "zustand";

export type ThemeId = "deep-blue" | "light" | "system";

export interface ThemeOverride {
  accentHue: number;
  glassAlpha: number;
  borderAlpha: number;
}

export interface KeyboardShortcut {
  id: string;
  action: string;
  keys: string;
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: "search-cmd", action: "搜索脚本命令", keys: "Ctrl + F" },
  { id: "search-term", action: "搜索终端输出", keys: "Ctrl + Shift + F" },
  { id: "zoom-in", action: "放大/缩小终端字体", keys: "Ctrl + 鼠标" },
  { id: "zoom-reset", action: "重置终端字体大小", keys: "Ctrl + 0" },
];

const DEFAULT_OVERRIDES: Record<string, ThemeOverride> = {
  "deep-blue": { accentHue: 210, glassAlpha: 0.88, borderAlpha: 0.13 },
  "light":     { accentHue: 217, glassAlpha: 0.82, borderAlpha: 0.14 },
};

interface SettingsState {
  theme: ThemeId;
  fontSize: number;
  fontFamily: string;
  scheduleEnabled: boolean;
  scheduleDarkStart: string;  // "HH:MM" format, e.g. "22:00"
  scheduleDarkEnd: string;    // "HH:MM" format, e.g. "06:00"
  overrides: Partial<Record<ThemeId, ThemeOverride>>;
  keyboardShortcuts: KeyboardShortcut[];

  setTheme: (t: ThemeId) => void;
  setFontSize: (s: number) => void;
  setFontFamily: (f: string) => void;
  setScheduleEnabled: (v: boolean) => void;
  setScheduleDarkStart: (v: string) => void;
  setScheduleDarkEnd: (v: string) => void;
  saveOverride: (themeId: ThemeId, o: ThemeOverride) => void;
  resetOverride: (themeId: ThemeId) => void;
  resetAllOverrides: () => void;
  getEffectiveOverride: (themeId: ThemeId) => ThemeOverride;
  updateShortcut: (id: string, keys: string) => void;
}

function loadTheme(): ThemeId {
  try {
    const v = localStorage.getItem("opentermo-theme");
    if (v === "light" || v === "deep-blue" || v === "system") return v as ThemeId;
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
  fontFamily: (() => {
    try { return localStorage.getItem("opentermo-fontfamily") || "JetBrains Mono"; } catch {}
    return "JetBrains Mono";
  })(),
  scheduleEnabled: (() => {
    try { return localStorage.getItem("opentermo-schedule") === "1"; } catch {}
    return false;
  })(),
  scheduleDarkStart: (() => {
    try { return localStorage.getItem("opentermo-schedule-start") || "22:00"; } catch {}
    return "19:00";
  })(),
  scheduleDarkEnd: (() => {
    try { return localStorage.getItem("opentermo-schedule-end") || "07:00"; } catch {}
    return "07:00";
  })(),
  overrides: loadAllOverrides(),
  keyboardShortcuts: (() => {
    // Clear old localStorage value to always use latest defaults
    try { localStorage.removeItem("opentermo-shortcuts"); } catch {}
    return DEFAULT_SHORTCUTS;
  })(),

  setTheme: (t) => {
    localStorage.setItem("opentermo-theme", t);
    set({ theme: t });
    // If "system", immediately apply based on OS preference
    if (t === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const effective = prefersDark ? "deep-blue" : "light";
      document.documentElement.setAttribute("data-theme", effective);
    }
  },
  setFontSize: (s) => {
    const clamped = Math.max(10, Math.min(28, Math.round(s)));
    localStorage.setItem("opentermo-fontsize", String(clamped));
    set({ fontSize: clamped });
  },
  setFontFamily: (f) => {
    localStorage.setItem("opentermo-fontfamily", f);
    set({ fontFamily: f });
  },
  setScheduleEnabled: (v) => {
    localStorage.setItem("opentermo-schedule", v ? "1" : "0");
    set({ scheduleEnabled: v });
  },
  setScheduleDarkStart: (v) => {
    localStorage.setItem("opentermo-schedule-start", v);
    set({ scheduleDarkStart: v });
  },
  setScheduleDarkEnd: (v) => {
    localStorage.setItem("opentermo-schedule-end", v);
    set({ scheduleDarkEnd: v });
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
    for (const tid of ["deep-blue", "light"] as ThemeId[]) {
      localStorage.removeItem(`opentermo-override-${tid}`);
    }
    set({ overrides: {} });
  },
  getEffectiveOverride: (themeId) => {
    return get().overrides[themeId] || DEFAULT_OVERRIDES[themeId];
  },
  updateShortcut: (id, keys) => {
    set((s) => {
      const shortcuts = s.keyboardShortcuts.map((sc) =>
        sc.id === id ? { ...sc, keys } : sc
      );
      localStorage.setItem("opentermo-shortcuts", JSON.stringify(shortcuts));
      return { keyboardShortcuts: shortcuts };
    });
  },
}));
