import type { ThemeId, ThemeOverride } from "@/stores/settingsStore";

type ThemeMeta = { baseR: number; baseG: number; baseB: number; borderIsLight: boolean };

const THEME_META: Record<ThemeId, ThemeMeta> = {
  "deep-blue": { baseR: 26, baseG: 26, baseB: 26, borderIsLight: false },
  "light":     { baseR: 248, baseG: 249, baseB: 251, borderIsLight: true },
  "tabby":     { baseR: 26, baseG: 31, baseB: 39, borderIsLight: false },
};

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function hslToRgbStr(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return `${rgb.r} ${rgb.g} ${rgb.b}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** Linear interpolation between two values */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function applyOverride(theme: ThemeId, o: ThemeOverride) {
  const r = document.documentElement.style;
  const m = THEME_META[theme];

  // ━━━━━ Accent colors ━━━━━
  const accH = o.accentHue;
  r.setProperty("--accent", `hsl(${accH}, 60%, 58%)`);
  r.setProperty("--accent-rgb", hslToRgbStr(accH, 60, 58));
  const softH = (accH + 20) % 360;
  r.setProperty("--accent-soft", `hsl(${softH}, 55%, 63%)`);
  r.setProperty("--accent-soft-rgb", hslToRgbStr(softH, 55, 63));
  r.setProperty("--accent-dim", `hsla(${accH}, 60%, 58%, 0.14)`);
  r.setProperty("--accent-border", `hsla(${accH}, 60%, 58%, 0.30)`);
  r.setProperty("--color-info", `hsl(${accH}, 60%, 58%)`);

  // ━━━━━ Transparency ━━━━━
  // glassAlpha controls ONLY window transparency + blur, not panel lightness
  const ga = Math.round(o.glassAlpha * 100) / 100;
  const bgAlpha = ga;
  r.setProperty("--bg-base", `rgba(${m.baseR},${m.baseG},${m.baseB},${bgAlpha})`);
  const blurPx = Math.round(3 + ga * 16);
  r.setProperty("--glass-blur", `${blurPx}px`);

  // ━━━━━ Panel colors ━━━━━
  const pH = o.panelHue;
  const pSat = o.panelSat;

  // Decide panel RGB: hue=-1 means neutral gray (use THEME_META base)
  let panelR: number, panelG: number, panelB: number;
  let panelIsColored = false;

  if (pH < 0 || pSat <= 5) {
    // Neutral gray — use theme base RGB
    panelR = m.baseR;
    panelG = m.baseG;
    panelB = m.baseB;
    panelIsColored = false;
  } else {
    // Colored panel from HSL
    // Fixed lightness: ~18% dark themes, ~90% light themes
    const pLgt = m.borderIsLight ? 91 : 18;
    const rgb = hslToRgb(pH, pSat, pLgt);
    panelR = rgb.r;
    panelG = rgb.g;
    panelB = rgb.b;
    panelIsColored = true;
  }

  // bg-glass: panel color with glassAlpha as opacity
  r.setProperty("--bg-glass", `rgba(${panelR},${panelG},${panelB},${ga})`);

  // bg-elevated: same as glass but fully opaque
  r.setProperty("--bg-elevated", `rgb(${panelR},${panelG},${panelB})`);

  // bg-surface: slightly offset — darker for dark themes, lighter for light
  const surfOffset = m.borderIsLight ? 3 : -6;
  r.setProperty("--bg-surface", `rgb(${clamp(panelR+surfOffset,0,255)},${clamp(panelG+surfOffset,0,255)},${clamp(panelB+surfOffset,0,255)})`);

  // Surface interaction states — derived from panel color
  const hoverAlpha = m.borderIsLight ? 0.93 : 0.93;
  const hoverR = Math.round(panelR * hoverAlpha + (m.borderIsLight ? 0 : 0));
  const hoverG = Math.round(panelG * hoverAlpha + (m.borderIsLight ? 0 : 0));
  const hoverB = Math.round(panelB * hoverAlpha + (m.borderIsLight ? 0 : 0));
  // For dark themes, surface hover = slightly lighter than panel
  // For light themes, surface hover = slightly darker
  if (m.borderIsLight) {
    r.setProperty("--surface-hover", `rgba(0,0,0,0.05)`);
    r.setProperty("--surface-active", `rgba(0,0,0,0.07)`);
    if (panelIsColored) {
      r.setProperty("--surface-selected", `rgba(${panelR},${panelG},${panelB},0.18)`);
    } else {
      r.setProperty("--surface-selected", `rgba(59,130,246,0.08)`);
    }
  } else {
    r.setProperty("--surface-hover", `rgba(255,255,255,0.07)`);
    r.setProperty("--surface-active", `rgba(255,255,255,0.09)`);
    if (panelIsColored) {
      r.setProperty("--surface-selected", `rgba(${panelR},${panelG},${panelB},0.25)`);
    } else {
      r.setProperty("--surface-selected", `rgba(255,255,255,0.10)`);
    }
  }

  // ━━━━━ Borders ━━━━━
  const ba = Math.round(o.borderAlpha * 100) / 100;
  const bc = m.borderIsLight ? "0,0,0" : "255,255,255";
  r.setProperty("--border-subtle", `rgba(${bc},${(ba * 0.55).toFixed(2)})`);
  r.setProperty("--border-default", `rgba(${bc},${ba.toFixed(2)})`);
  r.setProperty("--border-strong", `rgba(${bc},${(ba * 1.4).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb", `rgba(${bc},${(ba * 0.7).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb-hover", `rgba(${bc},${(ba * 1.2).toFixed(2)})`);
}