import type { PresetThemeId, ThemeId } from "@/stores/settingsStore";

type Rgb = [number, number, number];

interface Palette {
  /** light themes flip border/overlay composition */
  light: boolean;
  /** window background */
  bgBase: Rgb;
  /** sidebar / titlebar / statusbar — frosted panel layer */
  bgPanel: Rgb;
  /** cards, inset fields — raised above the panel */
  bgSurface: Rgb;
  /** expanded folder/group bodies — recessed one step below the card */
  bgSunken: Rgb;
  /** dialogs, popups, palettes — always opaque */
  bgElevated: Rgb;
  /** active tab surface (upstream: darker than everything else in dark mode) */
  tabActiveBg: Rgb;
  tabActiveBorder: Rgb;
  /** RGB base that borders are composed from at the user's alpha */
  borderBase: Rgb;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textHeading: string;
  textInverse: string;
  accent: Rgb;
  success: Rgb;
  warning: Rgb;
  danger: Rgb;
  /** terminal canvas */
  termBg: Rgb;
  termFg: string;
  /** selection tint alpha over accent */
  selectAlpha: number;
  overlay: string;
  shadowLg: string;
  shadowXl: string;
}

// ── Ladders, values taken verbatim from the upstream theme definition ────────
const DARK_LADDER: Rgb = [27, 29, 35]; // #1b1d23 root window
const DARK_BORDER: Rgb = [122, 130, 150];
const LIGHT_BORDER: Rgb = [60, 60, 67];

const PALETTES: Record<PresetThemeId, Palette> = {
  "deep-blue": {
    light: false,
    bgBase: DARK_LADDER,
    bgPanel: [35, 38, 45], // #23262d
    bgSurface: [42, 45, 53], // #2a2d35
    bgSunken: DARK_LADDER, // #1b1d23
    bgElevated: [48, 51, 60], // #30333c
    tabActiveBg: [23, 26, 32], // #171a20
    tabActiveBorder: [6, 7, 10], // #06070a
    borderBase: DARK_BORDER,
    textPrimary: "#e6e8ee",
    textSecondary: "#b4b9c4",
    textMuted: "#9196a3",
    textHeading: "#f2f4f8",
    textInverse: "#ffffff",
    accent: [74, 144, 226], // #4a90e2
    success: [78, 201, 176], // #4ec9b0
    warning: [226, 168, 74], // #e2a84a
    danger: [226, 92, 92], // #e25c5c
    termBg: [14, 15, 19], // #0e0f13
    termFg: "#d4d4d4",
    selectAlpha: 0.16,
    overlay: "rgba(0,0,0,0.55)",
    shadowLg: "0 8px 32px rgba(0,0,0,0.55)",
    shadowXl: "0 16px 48px rgba(0,0,0,0.65)",
  },
  light: {
    light: true,
    bgBase: [245, 245, 247], // #f5f5f7
    bgPanel: [255, 255, 255], // #ffffff
    bgSurface: [242, 242, 247], // #f2f2f7
    bgSunken: [224, 224, 230], // #e0e0e6
    bgElevated: [255, 255, 255], // #ffffff
    tabActiveBg: [255, 255, 255],
    tabActiveBorder: [199, 199, 204], // #c7c7cc
    borderBase: LIGHT_BORDER,
    textPrimary: "#1d1d1f",
    textSecondary: "#45454a",
    textMuted: "#606066",
    textHeading: "#0b0b0c",
    textInverse: "#ffffff",
    accent: [0, 113, 227], // #0071e3
    success: [52, 199, 89], // #34c759
    warning: [255, 159, 10], // #ff9f0a
    danger: [255, 59, 48], // #ff3b30
    termBg: [250, 250, 250], // #fafafa
    termFg: "#2d2d2f",
    selectAlpha: 0.12,
    overlay: "rgba(0,0,0,0.20)",
    shadowLg: "0 8px 24px rgba(0,0,0,0.10)",
    shadowXl: "0 16px 40px rgba(0,0,0,0.14)",
  },
};

/** Base hex per theme — used for the settings swatches. */
export const THEME_SWATCH: Record<PresetThemeId, string> = {
  "deep-blue": "#1b1d23",
  light: "#f5f5f7",
};

const rgbToHex = (c: Rgb) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

/** 各预设的强调色 hex —— 自定义档的取色器与色点拿它当基准。 */
export const THEME_ACCENT_HEX: Record<PresetThemeId, string> = {
  "deep-blue": rgbToHex(PALETTES["deep-blue"].accent),
  light: rgbToHex(PALETTES.light.accent),
};

/** 自定义档套用的预设色板 —— 按"预设"索引的地方（终端 ANSI、data-theme）复用它。 */
export function effectivePreset(theme: ThemeId, customBase: PresetThemeId): PresetThemeId {
  return theme === "custom" ? customBase : theme;
}

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** 主题 → 实际色板。自定义 = 基底色板 + 覆盖强调色；其余 token（含终端 ANSI）不开放。 */
function resolvePalette(theme: ThemeId, customBase: PresetThemeId, customAccent: string): Palette {
  const base = PALETTES[effectivePreset(theme, customBase)] ?? PALETTES["deep-blue"];
  if (theme !== "custom") return base;
  const accent = parseHex(customAccent);
  return accent ? { ...base, accent } : base;
}

const rgbTriplet = (c: Rgb) => `${c[0]} ${c[1]} ${c[2]}`;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 非外框类边框（分隔线 / 控件边框 / 滚动条 / 滑轨）的固定强度 —— 取「边框柔和度」
 * 滑块的下限，等于该设置的历史默认值：这些角色不随滑块变化，所以默认外观不变，
 * 而滑块只作用在 `--frame-border` 上。滑块的最小值必须与此保持一致。
 */
const BASE_BORDER_ALPHA = 0.15;

export interface ThemeOptions {
  theme: ThemeId;
  /** 自定义档的基底与强调色；其余主题忽略 */
  customBase: PresetThemeId;
  customAccent: string;
  /** panel/window background opacity (0.2-0.95) */
  glassAlpha: number;
  /** backdrop-blur radius of the panel layer, px (0-40) */
  blurPx: number;
  /** border strength (0.15-0.75) */
  borderAlpha: number;
  /** terminal canvas opacity (0.2-1.0) */
  terminalAlpha: number;
  /** when a background image is set the root layer thins out */
  hasWallpaper: boolean;
}

/**
 * Apply theme tokens to :root. JS is the single source of truth — index.css
 * only carries values that never change with the theme.
 */
export function applyTheme({
  theme,
  customBase,
  customAccent,
  glassAlpha,
  blurPx,
  borderAlpha,
  terminalAlpha,
  hasWallpaper,
}: ThemeOptions) {
  const r = document.documentElement.style;
  const p = resolvePalette(theme, customBase, customAccent);

  // ── Window / panel layers ────────────────────────────────────────────────
  // With a wallpaper the root layer thins out so the image reads through it,
  // mirroring the upstream bg-root = max(0, panel-alpha - 0.44) rule.
  const baseAlpha = hasWallpaper ? Math.max(0.35, glassAlpha - 0.44) : glassAlpha;
  r.setProperty("--bg-base", rgba(p.bgBase, round2(baseAlpha)));
  r.setProperty("--bg-glass", rgba(p.bgPanel, round2(glassAlpha)));
  r.setProperty("--glass-blur", `${Math.round(blurPx)}px`);
  r.setProperty("--bg-surface", `rgb(${p.bgSurface.join(",")})`);
  r.setProperty("--bg-sunken", `rgb(${p.bgSunken.join(",")})`);
  r.setProperty("--bg-elevated", `rgb(${p.bgElevated.join(",")})`);
  r.setProperty("--bg-overlay", p.overlay);
  r.setProperty("--shadow-lg", p.shadowLg);
  r.setProperty("--shadow-xl", p.shadowXl);

  // ── Surfaces ─────────────────────────────────────────────────────────────
  r.setProperty("--surface-hover", p.light ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.055)");
  r.setProperty("--surface-active", p.light ? "rgba(0,0,0,0.075)" : "rgba(255,255,255,0.09)");
  // 列表行的「极淡背景板」：比 --bg-surface 轻得多，只够把一行从磨砂底上分出来。
  // 层级靠这个 + 间距堆出来，而不是再套一层深色大背景。
  r.setProperty("--surface-row", p.light ? "rgba(0,0,0,0.028)" : "rgba(255,255,255,0.035)");
  r.setProperty("--tab-active-bg", `rgb(${p.tabActiveBg.join(",")})`);
  r.setProperty("--tab-active-border", `rgb(${p.tabActiveBorder.join(",")})`);

  // ── Borders ──────────────────────────────────────────────────────────────
  // Two independent groups, so one control can no longer move everything:
  //   • `--frame-border` — 只有「窗口/浮层外框」这一个角色，是「边框柔和度」
  //     滑块唯一驱动的东西：侧栏分界、标题栏、状态栏、对话框、弹出菜单、浮层。
  //   • 其余 token（分隔线、控件边框、滚动条、滑块轨道）由主题固定，不再随滑块
  //     变化 —— 否则把外框调明显会顺带把输入框、开关、滑轨一起加深。
  //    • 外框线本身是「边缘光」而不是灰蓝实线：中亮灰蓝（borderBase）画成 1px
  //      会读成一条数字感的硬线；换成低强度的中性色，暗色主题用白、亮色主题用
  //      黑，才像玻璃的反光边。强度仍由「边框柔和度」滑块驱动。
  const ba = round2(borderAlpha);
  const fixed = BASE_BORDER_ALPHA;
  r.setProperty(
    "--frame-border",
    p.light ? rgba([0, 0, 0], round2(ba * 0.45)) : rgba([255, 255, 255], round2(ba * 0.55)),
  );
  r.setProperty("--border-subtle", rgba(p.borderBase, round2(fixed * 0.66)));
  r.setProperty("--border-default", rgba(p.borderBase, fixed));
  r.setProperty("--border-strong", rgba(p.borderBase, round2(Math.min(1, fixed * 1.38))));
  r.setProperty("--scrollbar-thumb", rgba(p.borderBase, round2(fixed * 0.55)));
  r.setProperty("--scrollbar-thumb-hover", rgba(p.borderBase, round2(fixed * 0.9)));
  // Fills that merely borrowed a border token (slider track, toggle off-state).
  r.setProperty("--track-bg", rgba(p.borderBase, round2(fixed * 1.38)));

  // ── Text ─────────────────────────────────────────────────────────────────
  r.setProperty("--text-primary", p.textPrimary);
  r.setProperty("--text-secondary", p.textSecondary);
  r.setProperty("--text-muted", p.textMuted);
  r.setProperty("--text-heading", p.textHeading);
  r.setProperty("--text-inverse", p.textInverse);

  // ── Semantic colors: one role each ───────────────────────────────────────
  for (const [name, c] of [
    ["accent", p.accent],
    ["color-success", p.success],
    ["color-warning", p.warning],
    ["color-danger", p.danger],
  ] as const) {
    r.setProperty(`--${name}-rgb`, rgbTriplet(c));
    r.setProperty(`--${name}`, `rgb(${c[0]},${c[1]},${c[2]})`);
  }
  r.setProperty("--accent-dim", rgba(p.accent, 0.14));
  r.setProperty("--accent-border", rgba(p.accent, 0.35));
  r.setProperty("--border-focus", rgba(p.accent, 0.55));
  r.setProperty("--color-info", "rgb(var(--accent-rgb))");
  r.setProperty("--surface-selected", rgba(p.accent, p.selectAlpha));

  // ── Terminal canvas ──────────────────────────────────────────────────────
  r.setProperty("--term-bg-rgb", rgbTriplet(p.termBg));
  r.setProperty("--term-fg", p.termFg);
  r.setProperty("--term-alpha", String(round2(terminalAlpha)));
}

/** Bundled wallpaper (public/default-bg.png), used when no custom image is set. */
export const DEFAULT_BACKGROUND = "/default-bg.png";

/** Point the root wallpaper layer at an image, or clear it with `null`. */
export function applyBackgroundImage(url: string | null) {
  const root = document.documentElement;
  if (url) {
    root.style.setProperty("--wp-image", `url("${url}")`);
    root.setAttribute("data-wp", "on");
  } else {
    root.style.removeProperty("--wp-image");
    root.removeAttribute("data-wp");
  }
}
