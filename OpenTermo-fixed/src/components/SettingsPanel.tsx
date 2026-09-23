import { useEffect, useState } from "react";
import { Settings, Palette, Info, RotateCcw, ExternalLink, Terminal, Image as ImageIcon, Trash2, Droplet } from "lucide-react";
import { useSettingsStore, THEME_ORDER, THEME_LABELS, type ThemeId, type PresetThemeId } from "@/stores/settingsStore";
import { applyBackgroundImage, DEFAULT_BACKGROUND, THEME_SWATCH, THEME_ACCENT_HEX } from "@/lib/themeUtils";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import {
  setBackgroundImage,
  clearBackgroundImage,
} from "@/lib/tauriCommands";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Section = "appearance" | "terminal" | "about";

const THEMES: { id: ThemeId; label: string }[] = THEME_ORDER.map((id) => ({
  id,
  label: THEME_LABELS[id],
}));

const FONT_OPTIONS = [
  { value: "", label: "默认 (Meatshell Mono)" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Fira Code", label: "Fira Code" },
  { value: "Cascadia Code", label: "Cascadia Code" },
  { value: "Consolas", label: "Consolas" },
  { value: "Source Code Pro", label: "Source Code Pro" },
];

const CURSOR_OPTIONS: { value: "bar" | "block" | "underline"; label: string }[] = [
  { value: "bar", label: "条状" },
  { value: "block", label: "方块" },
  { value: "underline", label: "下划线" },
];

const NAV_ITEMS: { id: Section; icon: React.ReactNode; label: string }[] = [
  { id: "appearance", icon: <Palette size={16} />, label: "外观" },
  { id: "terminal", icon: <Terminal size={16} />, label: "终端" },
  { id: "about", icon: <Info size={16} />, label: "关于" },
];

function rangeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
  fmt?: (v: number) => string
) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--accent)] tabular-nums font-medium">
          {fmt ? fmt(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--border-strong)]
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
          [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  );
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [section, setSection] = useState<Section>("appearance");
  // 关于页曾经硬编码版本号，连续两个版本都是错的 —— 改成运行时向 Tauri 取。
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const cursorStyle = useSettingsStore((s) => s.cursorStyle);
  const cursorBlink = useSettingsStore((s) => s.cursorBlink);
  const glassAlpha = useSettingsStore((s) => s.glassAlpha);
  const blurStrength = useSettingsStore((s) => s.blurStrength);
  const borderAlpha = useSettingsStore((s) => s.borderAlpha);
  const terminalAlpha = useSettingsStore((s) => s.terminalAlpha);
  const hasWallpaper = useSettingsStore((s) => s.hasWallpaper);
  const customBase = useSettingsStore((s) => s.customBase);
  const customAccent = useSettingsStore((s) => s.customAccent);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const setCursorStyle = useSettingsStore((s) => s.setCursorStyle);
  const setCursorBlink = useSettingsStore((s) => s.setCursorBlink);
  const setGlassAlpha = useSettingsStore((s) => s.setGlassAlpha);
  const setBlurStrength = useSettingsStore((s) => s.setBlurStrength);
  const setBorderAlpha = useSettingsStore((s) => s.setBorderAlpha);
  const setTerminalAlpha = useSettingsStore((s) => s.setTerminalAlpha);
  const setHasWallpaper = useSettingsStore((s) => s.setHasWallpaper);
  const setCustomBase = useSettingsStore((s) => s.setCustomBase);
  const setCustomAccent = useSettingsStore((s) => s.setCustomAccent);

  const [bgMsg, setBgMsg] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);

  const previewTheme = (tid: ThemeId) => {
    setTheme(tid);
  };

  const swatchColor = (id: ThemeId) =>
    id === "custom" ? customAccent || THEME_ACCENT_HEX[customBase] : THEME_SWATCH[id];

  const handlePickBackground = async () => {
    const picked = await openFileDialog({
      multiple: false,
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
    });
    if (typeof picked !== "string") return;
    setBgBusy(true);
    setBgMsg(null);
    try {
      const url = await setBackgroundImage(picked);
      applyBackgroundImage(url);
      setHasWallpaper(true);
    } catch (e: any) {
      setBgMsg(e?.toString?.() || "背景图导入失败");
    } finally {
      setBgBusy(false);
    }
  };

  const handleClearBackground = async () => {
    setBgBusy(true);
    try {
      await clearBackgroundImage();
      applyBackgroundImage(null);
      setHasWallpaper(false);
      setBgMsg(null);
    } catch (e: any) {
      setBgMsg(e?.toString?.() || "移除背景图失败");
    } finally {
      setBgBusy(false);
    }
  };

  const handleResetAll = async () => {
    // 只回预设；自定义档的存档刻意保留 —— 那是用户自己调的一套，不该被「恢复默认」清掉。
    setTheme("deep-blue");
    setFontSize(14);
    setFontFamily("");
    setCursorStyle("bar");
    setCursorBlink(true);
    setGlassAlpha(0.2);
    setBlurStrength(40);
    setBorderAlpha(0.15);
    setTerminalAlpha(0.8);
    // Drop the custom image before re-enabling, so the effect that loads the
    // wallpaper can't pick up the old file on its way out.
    await clearBackgroundImage().catch(() => {});
    setHasWallpaper(true);
    applyBackgroundImage(DEFAULT_BACKGROUND);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[640px] p-0 max-h-[85vh] overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-1">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-dim)]">
              <Settings size={17} className="text-[var(--accent)]" />
            </span>
            设置
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[450px]">
          {/* ── Left nav ── */}
          <nav className="w-32 flex-shrink-0 border-r border-[var(--border-subtle)] px-2 py-4 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left
                  ${section === item.id
                    ? "bg-[var(--surface-selected)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {/* ── Right content ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {section === "appearance" && (
              <div className="flex flex-col gap-5">

                {/* ── 主题 ── */}
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Palette size={14} className="text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-heading)]">主题</span>
                  </div>
                  <div className="flex gap-2">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => previewTheme(t.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all flex-1
                          ${theme === t.id
                            ? "bg-[var(--surface-selected)] text-[var(--accent)] border border-[var(--accent-border)]"
                            : "text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
                          }`}
                      >
                        <span className="w-4 h-4 rounded-full border border-[var(--border-subtle)] flex-shrink-0"
                          style={{ backgroundColor: swatchColor(t.id) }} />
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {theme === "custom" && (
                    <div className="flex flex-col gap-3 mt-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)]">基底</span>
                        <div className="flex gap-2">
                          {(["deep-blue", "light"] as PresetThemeId[]).map((b) => (
                            <button
                              key={b}
                              onClick={() => setCustomBase(b)}
                              className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all
                                ${customBase === b
                                  ? "bg-[var(--surface-selected)] text-[var(--accent)] border-[var(--accent-border)]"
                                  : "text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
                                }`}
                            >
                              {THEME_LABELS[b]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">强调色</span>
                        <span className="flex items-center gap-2">
                          {customAccent && (
                            <button
                              onClick={() => setCustomAccent("")}
                              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                            >
                              跟随基底
                            </button>
                          )}
                          <input
                            type="color"
                            value={customAccent || THEME_ACCENT_HEX[customBase]}
                            onChange={(e) => setCustomAccent(e.target.value)}
                            className="w-9 h-6 p-0 rounded border border-[var(--border-default)] bg-transparent cursor-pointer"
                          />
                        </span>
                      </label>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        这一档下透明度、磨砂、边框都归你，切走再切回来还是这套；终端配色跟随基底。
                      </p>
                    </div>
                  )}
                </section>

                <hr className="border-0 h-px bg-[var(--border-subtle)]" />


                {/* ── 窗口 ── */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)]">
                      <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--text-heading)]">窗口</span>
                  </div>
                  {rangeSlider("透明度", 20, 95, 1, Math.round(glassAlpha * 100), (v) => {
                    setGlassAlpha(v / 100);
                  }, (v) => `${v}%`)}
                  {rangeSlider("磨砂强度", 0, 40, 1, blurStrength, setBlurStrength, (v) => (v === 0 ? "关闭" : `${v}px`))}
                  {rangeSlider("边框柔和度", 15, 75, 1, Math.round(borderAlpha * 100), (v) => {
                    setBorderAlpha(v / 100);
                  }, (v) => `${v}%`)}
                </section>

                <hr className="border-0 h-px bg-[var(--border-subtle)]" />

                {/* ── 背景 ── */}
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon size={14} className="text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-heading)]">背景</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePickBackground}
                      disabled={bgBusy}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-[var(--accent)] border border-[var(--accent-border)] bg-[var(--accent-dim)] hover:bg-accent/20 disabled:opacity-50 transition-all"
                    >
                      <ImageIcon size={14} />
                      {hasWallpaper ? "更换背景图" : "选择背景图"}
                    </button>
                    <button
                      onClick={handleClearBackground}
                      disabled={bgBusy || !hasWallpaper}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all"
                      title="移除背景图"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    默认使用内置背景图；选了自己的图片会覆盖它。终端区透明度已移到「终端」页。
                  </p>
                  {bgMsg && (
                    <p className="text-xs text-[var(--color-danger)]">{bgMsg}</p>
                  )}
                </section>

                <hr className="border-0 h-px bg-[var(--border-subtle)]" />

                {/* ── 重置 ── */}
                <button onClick={handleResetAll}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-[var(--color-danger)] border border-danger/25 hover:bg-danger/10 transition-all">
                  <RotateCcw size={14} />
                  全部恢复默认
                </button>
              </div>
            )}


            {section === "terminal" && (
              <div className="flex flex-col gap-5">
                {/* ── 终端字体 ── */}
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)]">
                      <line x1="4" y1="7" x2="20" y2="7" /><line x1="9" y1="7" x2="9" y2="17" /><line x1="15" y1="7" x2="15" y2="17" /><line x1="4" y1="17" x2="20" y2="17" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--text-heading)]">终端字体</span>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-secondary)]">字族</span>
                    <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}
                      className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors">
                      {FONT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </label>
                  {rangeSlider("字号", 10, 28, 1, fontSize, setFontSize, (v) => `${v}px`)}
                </section>

                <hr className="border-0 h-px bg-[var(--border-subtle)]" />

                {/* ── 光标 ── */}
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--accent)]">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="1.5" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--text-heading)]">光标</span>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-secondary)]">样式</span>
                    <select value={cursorStyle} onChange={(e) => setCursorStyle(e.target.value as "bar" | "block" | "underline")}
                      className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors">
                      {CURSOR_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between py-1">
                    <span className="text-xs text-[var(--text-secondary)]">闪烁</span>
                    <button onClick={() => setCursorBlink(!cursorBlink)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${cursorBlink ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${cursorBlink ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </label>
                </section>

                <hr className="border-0 h-px bg-[var(--border-subtle)]" />

                {/* ── 终端区透明度 ── */}
                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Droplet size={14} className="text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-heading)]">背景透明</span>
                  </div>
                  {rangeSlider("终端区透明度", 20, 100, 1, Math.round(terminalAlpha * 100), (v) => {
                    setTerminalAlpha(v / 100);
                  }, (v) => `${v}%`)}
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    只影响终端区域：数值越低，窗口背景图越明显。
                  </p>
                </section>
              </div>
            )}

            {section === "about" && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                {/* Logo */}
                <svg viewBox="0 0 64 64" className="w-14 h-14" xmlns="http://www.w3.org/2000/svg">
                  <rect width="64" height="64" rx="16" fill="#121212" />
                  <text x="7" y="44" fontFamily="Arial Black, system-ui, sans-serif" fontSize="36" fontWeight="900" fill="#fff">&gt;_</text>
                  <rect x="46" y="16" width="4" height="24" rx="2" fill="#4ade80" />
                </svg>

                <div className="text-center">
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">OpenTermo</h2>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">v{appVersion || "—"}</p>
                </div>

                <p className="text-sm text-[var(--text-secondary)] text-center max-w-xs leading-relaxed">
                  一款基于 Tauri 的现代化 SSH 终端客户端，使用 Rust 高性能引擎。
                </p>

                <div className="w-full max-w-xs border-t border-[var(--border-subtle)] pt-3 mt-1">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">前端</span>
                      <span className="text-[var(--text-primary)]">React + xterm.js</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">后端</span>
                      <span className="text-[var(--text-primary)]">Rust / Meatshell</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">框架</span>
                      <span className="text-[var(--text-primary)]">Tauri 2.0</span>
                    </div>
                  </div>
                </div>

                <a href="https://github.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline mt-1">
                  <ExternalLink size={12} />
                  GitHub 仓库
                </a>

                <p className="text-[10px] text-[var(--text-muted)] opacity-50 mt-4">&copy; 2024 OpenTermo</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
