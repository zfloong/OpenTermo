import { Settings, Palette, Type, Check, Droplets, Eye, Sliders } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
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

const themes = [
  { id: "deep-blue" as const, label: "深蓝", desc: "深邃蓝色调", colors: ["#080c12", "#5b9cf5", "#818cf8"] },
  { id: "classic" as const, label: "经典", desc: "纯黑半透明", colors: ["#000000", "#5599f0", "#0a0a0a"] },
  { id: "light" as const, label: "浅色", desc: "明亮清爽", colors: ["#f8f9fb", "#3b82f6", "#6366f1"] },
];

export default function SettingsPanel({ open, onClose }: Props) {
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xs p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-dim)]">
              <Settings size={17} className="text-[var(--accent)]" />
            </span>
            设置
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-4">
          {/* ── 主题 ── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Palette size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-heading)]">主题</span>
            </div>
            <div className="flex flex-col gap-2">
              {themes.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`group flex items-center gap-3.5 px-4 py-3 rounded-xl border transition-all text-left
                      ${active
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] ring-1 ring-[var(--accent)]/30"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
                      }`}
                  >
                    <div className="flex rounded-lg overflow-hidden border border-[var(--border-subtle)] shrink-0 shadow-sm">
                      {t.colors.map((c, i) => (
                        <div key={i} className="w-7 h-8" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{t.label}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{t.desc}</div>
                    </div>
                    {active && (
                      <Check size={18} className="text-[var(--accent)] shrink-0" strokeWidth={2.5} />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="h-px bg-[var(--border-subtle)] mx-2" />

          {/* ── 字号 ── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <Type size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-heading)]">字号</span>
            </div>
            <div className="flex items-baseline gap-1.5 px-1">
              <span className="text-4xl font-bold text-[var(--accent)] tabular-nums leading-none">{fontSize}</span>
              <span className="text-sm text-[var(--text-muted)]">px</span>
            </div>
            <div className="px-2">
              <input
                type="range"
                min="12"
                max="28"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer
                  bg-[var(--border-strong)]
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20
                  [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
              />
            </div>
            <div className="flex justify-between text-xs text-[var(--text-muted)] px-3">
              <span>12</span>
              <span>18</span>
              <span>28</span>
            </div>
            <div className="px-4 py-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-center text-[var(--text-secondary)] select-none"
              style={{ fontSize: fontSize + 'px' }}
            >
              Aa 预览效果
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}