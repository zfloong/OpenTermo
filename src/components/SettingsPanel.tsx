import { useState, useCallback } from "react";
import { Settings, Palette, Type, Check, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useSettingsStore, type ThemeId, type ThemeOverride } from "@/stores/settingsStore";
import { applyOverride } from "@/lib/themeUtils";
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

const THEME_META: { id: ThemeId; label: string; desc: string; colors: string[] }[] = [
  { id: "deep-blue", label: "暗色", desc: "纯黑白灰层次", colors: ["#000000", "#8b9dc3", "#1a1a1a"] },
  { id: "light",     label: "白天", desc: "明亮清爽",     colors: ["#f8f9fb", "#3b82f6", "#6366f1"] },
  { id: "tabby",     label: "Tabby", desc: "蓝紫深灰风", colors: ["#13171d", "#7b68ee", "#9b8cf0"] },
];

const DEFAULT_OVERRIDES: Record<ThemeId, ThemeOverride> = {
  "deep-blue": { accentHue: 210, glassAlpha: 0.88, borderAlpha: 0.13 },
  "light":     { accentHue: 217, glassAlpha: 0.82, borderAlpha: 0.14 },
  "tabby":     { accentHue: 255, glassAlpha: 0.82, borderAlpha: 0.13 },
};

function rangeSlider(label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void, fmt?: (v: number) => string) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="text-[var(--accent)] tabular-nums font-medium">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
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
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const overrides = useSettingsStore((s) => s.overrides);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const saveOverride = useSettingsStore((s) => s.saveOverride);
  const resetOverride = useSettingsStore((s) => s.resetOverride);
  const resetAllOverrides = useSettingsStore((s) => s.resetAllOverrides);

  const [expanded, setExpanded] = useState<ThemeId | null>(null);

  // Draft state for editing
  const [draft, setDraft] = useState<ThemeOverride | null>(null);

  const openEditor = useCallback((tid: ThemeId) => {
    if (expanded === tid) {
      setExpanded(null);
      setDraft(null);
      return;
    }
    setExpanded(tid);
    const current = overrides[tid] || DEFAULT_OVERRIDES[tid];
    setDraft({ ...current });
  }, [expanded, overrides]);

  const updateDraft = useCallback((key: keyof ThemeOverride, value: number) => {
    setDraft((d) => {
      if (!d) return null;
      const next = { ...d, [key]: value };
      // Real-time preview: apply draft to DOM
      const tid = expanded;
      if (tid) applyOverride(tid, next);
      return next;
    });
  }, [expanded]);

  const handleSave = useCallback(() => {
    if (!expanded || !draft) return;
    saveOverride(expanded, draft);
    setExpanded(null);
    setDraft(null);
  }, [expanded, draft, saveOverride]);

  const handleCancel = useCallback(() => {
    setExpanded(null);
    setDraft(null);
  }, []);

  const handleResetTheme = useCallback(() => {
    if (!expanded) return;
    resetOverride(expanded);
    setExpanded(null);
    setDraft(null);
  }, [expanded, resetOverride]);

  const handleResetAll = useCallback(() => {
    resetAllOverrides();
    setExpanded(null);
    setDraft(null);
  }, [resetAllOverrides]);

  const hasAnyOverride = Object.keys(overrides).length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-6 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-dim)]">
              <Settings size={17} className="text-[var(--accent)]" />
            </span>
            设置
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          {/* ── Themes ── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 mb-1">
              <Palette size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-heading)]">主题</span>
            </div>

            {THEME_META.map((tm) => {
              const isActive = theme === tm.id;
              const isExpanded = expanded === tm.id;
              const cur = overrides[tm.id];
              const hasOverride = !!cur;

              return (
                <div key={tm.id} className="flex flex-col">
                  <button
                    onClick={() => {
                      if (!isActive) setTheme(tm.id);
                      openEditor(tm.id);
                    }}
                    className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left
                      ${isActive
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] ring-1 ring-[rgb(var(--accent-rgb)/0.20)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
                      }`}
                  >
                    <div className="flex rounded-md overflow-hidden border border-[var(--border-subtle)] shrink-0 shadow-sm">
                      {tm.colors.map((c, i) => (
                        <div key={i} className="w-5 h-7" style={{ background: c }} />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{tm.label}</span>
                        {hasOverride && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" title="已自定义" />
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{tm.desc}</div>
                    </div>
                    {isActive && <Check size={16} className="text-[var(--accent)] shrink-0" strokeWidth={2.5} />}
                    {isExpanded ? <ChevronUp size={14} className="text-[var(--text-muted)] shrink-0" /> : <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />}
                  </button>

                  {/* Expanded editor */}
                  {isExpanded && draft && (
                    <div className="ml-2 mt-1.5 px-3.5 py-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col gap-3">
                      <p className="text-xs text-[var(--text-muted)] mb-1">拖动滑块实时预览，满意后点保存</p>
                      {rangeSlider("Accent 色相", 0, 360, 1, draft.accentHue, (v) => updateDraft("accentHue", v), (v) => `${v}°`)}
                      <p className="text-[11px] text-[var(--text-muted)] -mt-1">→ 侧栏/标题栏/状态栏的高亮颜色</p>
                      {rangeSlider("面板透明度", 20, 95, 1, Math.round(draft.glassAlpha * 100), (v) => updateDraft("glassAlpha", v / 100), (v) => `${v}%`)}
                      <p className="text-[11px] text-[var(--text-muted)] -mt-1">→ 侧边栏、标题栏、状态栏的毛玻璃感</p>
                      {rangeSlider("边框可见度", 5, 30, 1, Math.round(draft.borderAlpha * 100), (v) => updateDraft("borderAlpha", v / 100), (v) => `${v}%`)}
                      <p className="text-[11px] text-[var(--text-muted)] -mt-1">→ 各区域分隔线的深浅</p>

                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={handleSave}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent)] text-white hover:brightness-110 transition-all"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancel}
                          className="flex-1 py-1.5 text-xs font-semibold rounded-md border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-all"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleResetTheme}
                          className="px-2 py-1.5 text-xs rounded-md text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all"
                          title="恢复此主题默认"
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <div className="h-px bg-[var(--border-subtle)]" />

          {/* ── Font size ── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <Type size={14} className="text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--text-heading)]">字号</span>
              <span className="text-sm font-bold text-[var(--accent)] ml-auto tabular-nums">{fontSize}px</span>
            </div>
            <input
              type="range"
              min="10"
              max="28"
              step="1"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[var(--border-strong)]
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] px-1">
              <span>10</span><span>14</span><span>28</span>
            </div>
          </section>

          {/* ── Reset all ── */}
          <div className="h-px bg-[var(--border-subtle)]" />
          <button
            onClick={handleResetAll}
            disabled={!hasAnyOverride}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all
              ${hasAnyOverride
                ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/25"
                : "text-[var(--text-muted)] border border-[var(--border-subtle)] cursor-not-allowed"
              }`}
          >
            <RotateCcw size={14} />
            全部恢复默认
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
