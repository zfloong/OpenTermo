import type { ThemeId } from "@/stores/settingsStore";

type ThemeMeta = { baseR: number; baseG: number; baseB: number; borderIsLight: boolean };

const THEME_META: Record<ThemeId, ThemeMeta> = {
  "deep-blue": { baseR: 18, baseG: 18, baseB: 20, borderIsLight: false },
  "light":     { baseR: 248, baseG: 249, baseB: 251, borderIsLight: true },
  "tabby":     { baseR: 22, baseG: 26, baseB: 34, borderIsLight: false },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/**
 * Apply theme visual variables to :root.
 * @param theme - theme id
 * @param glassAlpha - window/panel transparency (0.2-0.95)
 * @param borderAlpha - border visibility (0.05-0.30)
 */
export function applyTheme(theme: ThemeId, glassAlpha: number, borderAlpha: number) {
  const r = document.documentElement.style;
  const m = THEME_META[theme];

  // --- Base background with transparency ---
  const bgAlpha = Math.round(glassAlpha * 100) / 100;
  r.setProperty("--bg-base", `rgba(${m.baseR},${m.baseG},${m.baseB},${bgAlpha})`);
  const blurPx = Math.round(3 + bgAlpha * 16);
  r.setProperty("--glass-blur", `${blurPx}px`);

  // --- Panel background ---
  const panelOffset = m.borderIsLight ? 4 : -4;
  var panelR = clamp(m.baseR + panelOffset, 0, 255);
  var panelG = clamp(m.baseG + panelOffset, 0, 255);
  var panelB = clamp(m.baseB + panelOffset, 0, 255);
  r.setProperty("--bg-glass", `rgba(${panelR},${panelG},${panelB},${bgAlpha})`);
  r.setProperty("--bg-elevated", `rgb(${panelR},${panelG},${panelB})`);
  // --- Accent colors — bright blue for all themes ---
  var accentR = 59; var accentG = 130; var accentB = 246;
  r.setProperty("--accent-rgb", `${accentR} ${accentG} ${accentB}`);
  r.setProperty("--accent", `rgb(${accentR},${accentG},${accentB})`);
  r.setProperty("--accent-dim", `rgba(${accentR},${accentG},${accentB},0.14)`);
  r.setProperty("--accent-border", `rgba(${accentR},${accentG},${accentB},0.30)`);
  r.setProperty("--color-info", `rgb(${accentR},${accentG},${accentB})`);
  r.setProperty("--color-success", "rgb(74, 222, 128)");
  r.setProperty("--color-warning", "rgb(251, 191, 36)");
  r.setProperty("--color-danger", "rgb(248, 113, 113)");



  var surfOffset = m.borderIsLight ? 6 : -6;
  r.setProperty("--bg-surface", `rgb(${clamp(panelR+surfOffset,0,255)},${clamp(panelG+surfOffset,0,255)},${clamp(panelB+surfOffset,0,255)})`);

  // --- Surface interaction states ---
  if (m.borderIsLight) {
    r.setProperty("--surface-hover", "rgba(0,0,0,0.04)");
    r.setProperty("--surface-active", "rgba(0,0,0,0.07)");
    r.setProperty("--surface-selected", "rgba(59,130,246,0.08)");
  } else {
    r.setProperty("--surface-hover", "rgba(255,255,255,0.06)");
    r.setProperty("--surface-active", "rgba(255,255,255,0.09)");
    r.setProperty("--surface-selected", "rgba(255,255,255,0.10)");
  }

  // --- Borders: softer color (grayish instead of pure white/black) ---
  var ba = Math.round(borderAlpha * 100) / 100;
  // Soft border base RGB: light themes use dark gray, dark themes use light gray (not pure white)
  var bcR = m.borderIsLight ? "80" : "180";
  var bcG = m.borderIsLight ? "80" : "180";
  var bcB = m.borderIsLight ? "90" : "185";
  r.setProperty("--border-subtle", `rgba(${bcR},${bcG},${bcB},${(ba * 0.5).toFixed(2)})`);
  r.setProperty("--border-default", `rgba(${bcR},${bcG},${bcB},${ba.toFixed(2)})`);
  r.setProperty("--border-strong", `rgba(${bcR},${bcG},${bcB},${(ba * 1.5).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb", `rgba(${bcR},${bcG},${bcB},${(ba * 0.6).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb-hover", `rgba(${bcR},${bcG},${bcB},${(ba * 1.0).toFixed(2)})`);
}
