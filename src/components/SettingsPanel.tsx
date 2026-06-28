import { useState, useCallback } from "react";
import { useSettingsStore, type ThemeId, type ThemeOverride } from "@/stores/settingsStore";
import { applyOverride } from "@/lib/themeUtils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEME_META: { id: ThemeId; label: string; desc: string; colors: string[] }[] = [
  { id: "deep-blue", label: "深色 (默认)", desc: "纯黑白灰层次 · Steel Lavender", colors: ["#131313", "#b5c7ef", "#4de082"] },
  { id: "light",     label: "浅色", desc: "明亮清爽 · Classic Blue", colors: ["#f8f9fb", "#3b82f6", "#22c55e"] },
  { id: "tabby",     label: "Tabby", desc: "蓝紫深灰风 · Neon Violet", colors: ["#13171d", "#7b68ee", "#50d890"] },
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
        <span className="text-on-surface-variant">{label}</span>
        <span className="text-secondary tabular-nums font-medium font-terminal-mono">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: "var(--surface-variant)",
        }}
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

  const [activeTab, setActiveTab] = useState<"appearance" | "keyboard" | "terminal" | "security">("appearance");
  const [expanded, setExpanded] = useState<ThemeId | null>(null);
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

  const tabs = [
    { id: "appearance", label: "外观", icon: "palette" },
    { id: "keyboard", label: "键盘", icon: "keyboard" },
    { id: "terminal", label: "终端", icon: "terminal" },
    { id: "security", label: "安全", icon: "shield_person" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[75vh] p-0 overflow-hidden rounded-xl flex flex-row" style={{
        background: "var(--surface-container-low)",
        border: "1px solid var(--outline-variant)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        <aside className="w-36 flex-shrink-0 flex flex-col p-2.5 border-r border-outline-variant/20" style={{ background: "var(--surface-container)" }}>
          <div className="mb-3 px-2">
            <h2 className="text-[13px] font-semibold text-on-surface">设置</h2>
          </div>
          <nav className="flex flex-col gap-1">
            {tabs.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all border-l-2 ${
                    isActive
                      ? "border-l-secondary bg-secondary/10 text-secondary"
                      : "border-l-transparent text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
                  <span className="text-label-sm font-label-sm">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto" style={{ background: "var(--surface-container-lowest)" }}>
          <div className="p-5 space-y-6">
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">主题</h3>
              <div className="grid grid-cols-3 gap-2.5">
                {THEME_META.map((tm) => {
                  const isActive = theme === tm.id;
                  const cur = overrides[tm.id];
                  const hasOverride = !!cur;

                  return (
                    <button
                      key={tm.id}
                      onClick={() => setTheme(tm.id)}
                      className={`relative group p-2 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? "border-secondary"
                          : "border-transparent hover:border-outline/50"
                      }`}
                      style={{ background: "var(--surface-container)" }}
                    >
                      <div className="bg-surface rounded h-[68px] mb-1.5 overflow-hidden flex flex-col">
                        <div className="h-3 bg-surface-container-high border-b border-outline-variant/30 flex items-center px-2 gap-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-error"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary-container"></div>
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary"></div>
                        </div>
                        <div className="flex-1 p-1.5 bg-surface-dim">
                          <div className="text-secondary text-[9px] font-terminal-mono">&gt; _</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[11px] text-on-surface truncate">{tm.label}</span>
                          {hasOverride && (
                            <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" title="已自定义" />
                          )}
                        </div>
                        {isActive && (
                          <span className="material-symbols-outlined text-secondary text-[14px]">check_circle</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">排版</h3>
              <div className="bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/20 space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-on-surface-variant">字体族</label>
                  <div className="relative focus-glow rounded transition-shadow">
                    <select className="w-full bg-surface text-on-surface border border-outline-variant/50 rounded p-2 appearance-none font-terminal-mono text-terminal-mono text-[12px] outline-none">
                      <option>JetBrains Mono</option>
                      <option>Fira Code</option>
                      <option>Hack</option>
                      <option>Source Code Pro</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">expand_more</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-on-surface-variant">字体大小</label>
                    <span className="text-terminal-mono font-terminal-mono text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-on-surface-variant text-[12px] font-terminal-mono">A</span>
                    <input
                      type="range"
                      min="10"
                      max="24"
                      step="1"
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-on-surface-variant text-[18px] font-terminal-mono">A</span>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-surface-dim rounded border border-outline-variant/30 font-terminal-mono text-terminal-mono text-[11px]">
                  <div className="text-secondary mb-1">user@opentermo:~$ <span className="text-on-surface">ls -la</span></div>
                  <div className="text-on-surface-variant opacity-80">drwxr-xr-x 2 user root  4096 Oct 12 10:00 configs</div>
                  <div className="text-primary">.rw-r--r-- 1 user root   234 Oct 12 10:05 .zshrc</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">窗口与渲染</h3>
              <div className="space-y-4">
                <div className="bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/20">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <label className="text-[12px] text-on-surface">背景不透明度</label>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">调整亚克力模糊效果强度。</p>
                    </div>
                    <span className="text-terminal-mono font-terminal-mono text-primary font-medium bg-primary/10 px-2 py-0.5 rounded text-sm">90%</span>
                  </div>
                  <input className="w-full" max="100" min="0" type="range" value="90" />
                </div>
                <div className="space-y-3">
                  <ToggleRow title="GPU 加速" desc="使用硬件渲染以获得更好性能" defaultChecked />
                  <ToggleRow title="连字" desc="在终端输出中启用字体连字" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-outline-variant/20 flex justify-end gap-2">
              <button
              onClick={handleResetAll}
              disabled={!hasAnyOverride}
              className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-variant/40 hover:text-on-surface transition-colors text-[12px]"
            >
              恢复默认
            </button>
              <button
                className="px-4 py-1.5 rounded-lg bg-secondary/20 text-secondary hover:bg-secondary/30 transition-colors text-[12px] font-medium"
                onClick={onClose}
              >
                应用更改
              </button>
            </div>
          </div>

          {/* 空标签页占位 */}
          {activeTab !== "appearance" && (
            <div className="flex flex-col items-center justify-center h-full text-center p-12">
              <span className="material-symbols-outlined text-[48px] text-outline/30 mb-4">
                {activeTab === "keyboard" ? "keyboard" : activeTab === "terminal" ? "terminal" : "shield_person"}
              </span>
              <p className="text-on-surface-variant text-sm">
                {activeTab === "keyboard" ? "键盘快捷键设置开发中" :
                 activeTab === "terminal" ? "终端高级设置开发中" :
                 "安全与隐私设置开发中"}
              </p>
              <p className="text-outline text-xs mt-1">即将推出</p>
            </div>
          )}
        </main>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ title, desc, defaultChecked = false }: { title: string; desc: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-variant/30 transition-colors cursor-pointer border border-transparent hover:border-outline/20" style={{ background: "var(--surface-container)" }}>
      <div>
        <div className="text-[12px] text-on-surface font-medium">{title}</div>
        <div className="text-[10px] text-on-surface-variant mt-0.5">{desc}</div>
      </div>
      <div className="relative inline-flex items-center cursor-pointer">
        <input
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="sr-only peer"
          type="checkbox"
        />
        <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary" />
      </div>
    </label>
  );
}