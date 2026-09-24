import { create } from "zustand";

/** 预设主题：有自己的色板和滑杆默认档。 */
export type PresetThemeId = "deep-blue" | "light";
/** 用户可见的主题：两个预设 + 自定义自由档。 */
export type ThemeId = PresetThemeId | "custom";
export type CursorStyle = "bar" | "block" | "underline";

/** 主题的展示顺序（设置面板按钮 + 标题栏循环切主题共用）。 */
export const THEME_ORDER: ThemeId[] = ["deep-blue", "light", "custom"];
export const THEME_LABELS: Record<ThemeId, string> = {
  "deep-blue": "夜晚",
  light: "白天",
  custom: "自定义",
};

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
  /** 自定义主题的基底色板 */
  customBase: PresetThemeId;
  /** 自定义主题的强调色 hex；空串 = 跟随基底 */
  customAccent: string;

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
  setCustomBase: (b: PresetThemeId) => void;
  setCustomAccent: (hex: string) => void;
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
  const v = loadStr("opentermo-theme", "deep-blue");
  return v === "light" || v === "custom" ? v : "deep-blue";
}
function loadPresetThemeId(key: string): PresetThemeId {
  return loadStr(key, "deep-blue") === "light" ? "light" : "deep-blue";
}
function loadAccent(): string {
  const v = loadStr("opentermo-custom-accent", "");
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "";
}
function loadCursorStyle(): CursorStyle {
  const v = loadStr("opentermo-cursor-style", "bar");
  if (v === "block" || v === "underline") return v as CursorStyle;
  return "bar";
}

// 窗口 / 终端区透明度、边框柔和度都是全局单值（不按主题分存），但每个主题有自己的
// 默认档：切换主题时按这张表改写。暗色：窗口 20% / 终端区 80% / 边框 50%；
// 白天：窗口 95% / 终端区 20% / 边框 75%。
// 自定义档没有默认值 —— 它的定义就是"永不改写"。
const THEME_ALPHA_DEFAULTS: Record<
  PresetThemeId,
  { glassAlpha: number; terminalAlpha: number; borderAlpha: number }
> = {
  "deep-blue": { glassAlpha: 0.2, terminalAlpha: 0.8, borderAlpha: 0.5 },
  light: { glassAlpha: 0.95, terminalAlpha: 0.2, borderAlpha: 0.75 },
};

const CUSTOM_SLOT_KEY = "opentermo-custom-appearance";

/**
 * 边框柔和度在引入"分主题默认值"之前只有一个全局默认值 0.15。
 * 存量 profile 里存着的正是它 —— 那等于"从没调过"，不能让它压住新默认值，
 * 否则所有已经跑过本应用的人都看不到这次改动。
 */
const LEGACY_BORDER_DEFAULT = 0.15;
const BORDER_MIGRATION_KEY = "opentermo-border-alpha-migrated";

function loadBorderAlpha(preset: PresetThemeId): number {
  const fallback = THEME_ALPHA_DEFAULTS[preset].borderAlpha;
  // 迁移只做一次：看过标记就走普通读取，用户此后手动拖到 15% 也能留住。
  let migrated = false;
  try {
    migrated = localStorage.getItem(BORDER_MIGRATION_KEY) === "1";
  } catch {}
  if (migrated) return loadNum("opentermo-border-alpha", fallback, 0.15, 0.75);

  const stored = loadNum("opentermo-border-alpha", fallback, 0.15, 0.75);
  const lifted = stored === LEGACY_BORDER_DEFAULT ? fallback : stored;
  try {
    localStorage.setItem("opentermo-border-alpha", String(lifted));
    localStorage.setItem(BORDER_MIGRATION_KEY, "1");
  } catch {}
  return lifted;
}

/** 自定义档自己那套滑杆值：离开自定义时快照，再次进入时回灌。 */
interface CustomSlot {
  glassAlpha: number;
  terminalAlpha: number;
  blurStrength: number;
  borderAlpha: number;
}

function loadCustomSlot(): Partial<CustomSlot> {
  try {
    const raw = localStorage.getItem(CUSTOM_SLOT_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, unknown>;
    const num = (k: keyof CustomSlot, min: number, max: number) => {
      const v = Number(o[k]);
      return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : undefined;
    };
    return {
      glassAlpha: num("glassAlpha", 0.2, 0.95),
      terminalAlpha: num("terminalAlpha", 0.2, 1),
      blurStrength: num("blurStrength", 0, 40),
      borderAlpha: num("borderAlpha", 0.15, 0.75),
    };
  } catch {
    return {};
  }
}

function saveCustomSlot(slot: CustomSlot) {
  try {
    localStorage.setItem(CUSTOM_SLOT_KEY, JSON.stringify(slot));
  } catch {}
}

// Read once and reused by the theme field and by every slider fallback below: a
// fresh profile has to start on *its own* theme's defaults, not on the dark ones.
const initialTheme = loadTheme();
const initialCustomBase = loadPresetThemeId("opentermo-custom-base");
const initialPreset: PresetThemeId = initialTheme === "custom" ? initialCustomBase : initialTheme;

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: initialTheme,
  fontSize: loadNum("opentermo-fontsize", 14, 10, 28),
  fontFamily: loadStr("opentermo-font-family", ""),
  cursorStyle: loadCursorStyle(),
  cursorBlink: loadBool("opentermo-cursor-blink", true),
  glassAlpha: loadNum("opentermo-glass-alpha", THEME_ALPHA_DEFAULTS[initialPreset].glassAlpha, 0.2, 0.95),
  blurStrength: loadNum("opentermo-blur-strength", 40, 0, 40),
  borderAlpha: loadBorderAlpha(initialPreset),
  terminalAlpha: loadNum("opentermo-terminal-alpha", THEME_ALPHA_DEFAULTS[initialPreset].terminalAlpha, 0.2, 1),
  hasWallpaper: loadBool("opentermo-background", true),
  customBase: initialCustomBase,
  customAccent: loadAccent(),

  setTheme: (t) => {
    localStorage.setItem("opentermo-theme", t);
    set((s) => {
      // 点当前已选的主题不算切换，不动手动调过的透明度。
      if (t === s.theme) return { theme: t };

      if (t === "custom") {
        // 进自定义：回灌存档，首次为空就拿当前值当起点。
        const saved = loadCustomSlot();
        const next = {
          theme: t,
          glassAlpha: saved.glassAlpha ?? s.glassAlpha,
          terminalAlpha: saved.terminalAlpha ?? s.terminalAlpha,
          blurStrength: saved.blurStrength ?? s.blurStrength,
          borderAlpha: saved.borderAlpha ?? s.borderAlpha,
        };
        // 自定义态下全局键是权威来源（重启直接读回），所以这里要一并落盘。
        localStorage.setItem("opentermo-glass-alpha", String(next.glassAlpha));
        localStorage.setItem("opentermo-terminal-alpha", String(next.terminalAlpha));
        localStorage.setItem("opentermo-blur-strength", String(next.blurStrength));
        localStorage.setItem("opentermo-border-alpha", String(next.borderAlpha));
        return next;
      }

      // 离开自定义：把当前这套快照回存档，下次进来还在。
      if (s.theme === "custom") {
        saveCustomSlot({
          glassAlpha: s.glassAlpha,
          terminalAlpha: s.terminalAlpha,
          blurStrength: s.blurStrength,
          borderAlpha: s.borderAlpha,
        });
      }

      const d = THEME_ALPHA_DEFAULTS[t];
      localStorage.setItem("opentermo-glass-alpha", String(d.glassAlpha));
      localStorage.setItem("opentermo-terminal-alpha", String(d.terminalAlpha));
      localStorage.setItem("opentermo-border-alpha", String(d.borderAlpha));
      return {
        theme: t,
        glassAlpha: d.glassAlpha,
        terminalAlpha: d.terminalAlpha,
        borderAlpha: d.borderAlpha,
      };
    });
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
  setCustomBase: (b) => {
    localStorage.setItem("opentermo-custom-base", b);
    set({ customBase: b });
  },
  setCustomAccent: (hex) => {
    localStorage.setItem("opentermo-custom-accent", hex);
    set({ customAccent: hex });
  },
}));
