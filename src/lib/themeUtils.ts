import type { ThemeId, ThemeOverride } from "@/stores/settingsStore";

type ThemeBases = Record<string, { glassR: number; glassG: number; glassB: number; borderIsLight: boolean }>;

const THEME_BASES: ThemeBases = {
  "deep-blue": { glassR: 26, glassG: 26, glassB: 26, borderIsLight: false },
  "light":     { glassR: 255, glassG: 255, glassB: 255, borderIsLight: true },
};

/** Apply a ThemeOverride to the DOM (CSS custom properties on <html>). */
export function applyOverride(theme: ThemeId, o: ThemeOverride) {
  const r = document.documentElement.style;
  const b = THEME_BASES[theme];

  // Accent / Primary
  const h = o.accentHue;
  const primaryColor = `hsl(${h}, 60%, 58%)`;
  const primaryRgb = hslToRgb(h, 60, 58);
  const primarySoft = `hsl(${(h + 20) % 360}, 55%, 63%)`;
  const primaryDim = `hsla(${h}, 60%, 58%, 0.14)`;
  const primaryBorder = `hsla(${h}, 60%, 58%, 0.30)`;

  // New primary variables
  r.setProperty("--primary", primaryColor);
  r.setProperty("--primary-rgb", primaryRgb);
  r.setProperty("--primary-container", primarySoft);
  r.setProperty("--primary-dim", primaryDim);
  r.setProperty("--primary-border", primaryBorder);
  r.setProperty("--color-info", primaryColor);

  // Legacy accent aliases
  r.setProperty("--accent", primaryColor);
  r.setProperty("--accent-rgb", primaryRgb);
  r.setProperty("--accent-soft", primarySoft);
  r.setProperty("--accent-dim", primaryDim);
  r.setProperty("--accent-border", primaryBorder);

  // Glass — low opacity = bright veil, high opacity = dark solid
  const ga = Math.round(o.glassAlpha * 100) / 100;
  const brightR = Math.round(b.glassR + (1 - ga) * 200);
  const brightG = Math.round(b.glassG + (1 - ga) * 200);
  const brightB = Math.round(b.glassB + (1 - ga) * 200);
  r.setProperty("--bg-glass", `rgba(${brightR},${brightG},${brightB},${ga})`);
  const blurPx = Math.round(3 + ga * 16);
  r.setProperty("--glass-blur", `${blurPx}px`);

  // Borders
  const ba = Math.round(o.borderAlpha * 100) / 100;
  const bc = b.borderIsLight ? "0,0,0" : "255,255,255";
  r.setProperty("--border-subtle", `rgba(${bc},${(ba * 0.55).toFixed(2)})`);
  r.setProperty("--border-default", `rgba(${bc},${ba.toFixed(2)})`);
  r.setProperty("--border-strong", `rgba(${bc},${(ba * 1.4).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb", `rgba(${bc},${(ba * 0.7).toFixed(2)})`);
  r.setProperty("--scrollbar-thumb-hover", `rgba(${bc},${(ba * 1.2).toFixed(2)})`);
}

/** Convert HSL to RGB string (e.g. "181 199 239") */
function hslToRgb(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `${Math.round(255 * f(0))} ${Math.round(255 * f(8))} ${Math.round(255 * f(4))}`;
}
