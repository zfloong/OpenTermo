import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  { id: "system",   label: "跟随系统", desc: "自动切换深色/浅色", colors: ["#090909", "#b5c7ef", "#f8f9fb"] },
];

const DEFAULT_OVERRIDES: Record<string, ThemeOverride> = {
  "deep-blue": { accentHue: 210, glassAlpha: 0.88, borderAlpha: 0.13 },
  "light":     { accentHue: 217, glassAlpha: 0.82, borderAlpha: 0.14 },
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
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled);
  const scheduleDarkStart = useSettingsStore((s) => s.scheduleDarkStart);
  const scheduleDarkEnd = useSettingsStore((s) => s.scheduleDarkEnd);
  // 浅色 = 深色的补集
  const scheduleLightStart = scheduleDarkEnd;
  const scheduleLightEnd = scheduleDarkStart;
  const overrides = useSettingsStore((s) => s.overrides);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setScheduleEnabled = useSettingsStore((s) => s.setScheduleEnabled);
  const setScheduleDarkStart = useSettingsStore((s) => s.setScheduleDarkStart);
  const setScheduleDarkEnd = useSettingsStore((s) => s.setScheduleDarkEnd);
  const setScheduleLightStart = (v: string) => setScheduleDarkEnd(v);
  const setScheduleLightEnd = (v: string) => setScheduleDarkStart(v);
  const saveOverride = useSettingsStore((s) => s.saveOverride);
  const resetOverride = useSettingsStore((s) => s.resetOverride);
  const resetAllOverrides = useSettingsStore((s) => s.resetAllOverrides);

  const [activeTab, setActiveTab] = useState<"appearance" | "keyboard" | "about">("appearance");
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
    { id: "about", label: "关于", icon: "info" },
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

        <main className="flex-1 overflow-y-auto h-[500px]" style={{ background: "var(--surface-container-lowest)" }}>
          {activeTab === "appearance" && (
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
                      onClick={() => !scheduleEnabled && setTheme(tm.id)}
                      className={`relative group p-2 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? "border-secondary"
                          : "border-transparent hover:border-outline/50"
                      } ${scheduleEnabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
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
              <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">定时切换</h3>
              <div className="bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/20 space-y-3">
                <ToggleRow title="启用定时切换" desc="按时间段自动切换深色/浅色，开启后主题选择将被锁定"
                  defaultChecked={scheduleEnabled}
                  onChange={(v) => setScheduleEnabled(v)} />
                {scheduleEnabled && (
                  <div className="space-y-3 pt-1">
                    {/* 浅色时间段 */}
                    <div>
                      <label className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-[#f8f9fb] border border-outline-variant/30 inline-block" />
                        浅色时段
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <input type="time" value={scheduleLightStart}
                            onChange={(e) => setScheduleLightStart(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-outline-variant/30 text-xs text-on-surface font-terminal-mono outline-none focus:border-secondary/50" />
                        </div>
                        <span className="text-outline/40">→</span>
                        <div className="flex-1">
                          <input type="time" value={scheduleLightEnd}
                            onChange={(e) => setScheduleLightEnd(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-outline-variant/30 text-xs text-on-surface font-terminal-mono outline-none focus:border-secondary/50" />
                        </div>
                      </div>
                    </div>
                    {/* 深色时间段 */}
                    <div>
                      <label className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-[#131313] inline-block" />
                        深色时段
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <input type="time" value={scheduleDarkStart}
                            onChange={(e) => setScheduleDarkStart(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-outline-variant/30 text-xs text-on-surface font-terminal-mono outline-none focus:border-secondary/50" />
                        </div>
                        <span className="text-outline/40">→</span>
                        <div className="flex-1">
                          <input type="time" value={scheduleDarkEnd}
                            onChange={(e) => setScheduleDarkEnd(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-surface border border-outline-variant/30 text-xs text-on-surface font-terminal-mono outline-none focus:border-secondary/50" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">排版</h3>
              <div className="bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/20 space-y-4">
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-on-surface-variant">字体大小</label>
                    <span className="text-terminal-mono font-terminal-mono text-secondary text-[11px]">{fontSize}px</span>
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
                <div className="mt-3 p-3 bg-surface-dim rounded border border-outline-variant/30" style={{ fontFamily: `'${fontFamily}', monospace`, fontSize: `${fontSize}px` }}>
                  <div className="text-secondary mb-1">user@opentermo:~$ <span className="text-on-surface">ls -la</span></div>
                  <div className="text-on-surface-variant opacity-80">drwxr-xr-x 2 user root  4096 Oct 12 10:00 configs</div>
                  <div className="text-primary">.rw-r--r-- 1 user root   234 Oct 12 10:05 .zshrc</div>
                </div>
              </div>
            </div>

            </div>
          )}

          {/* 键盘设置 */}
          {activeTab === "keyboard" && (
            <div className="p-5 space-y-6 min-h-[400px]">
              <div>
                <h3 className="text-[14px] font-semibold text-on-surface mb-2.5 border-b border-outline-variant/20 pb-1.5">快捷键 <span className="text-[11px] font-normal text-outline/50 ml-2">点击快捷键可修改</span></h3>
                <KeyboardShortcuts />
              </div>
            </div>
          )}

          {/* 终端设置 */}
          {/* 关于 */}
          {activeTab === "about" && (
            <div className="p-5 space-y-6 min-h-[400px]">
              {/* Logo + Version */}
              <div className="flex items-center gap-4 pb-4 border-b border-outline-variant/10">
                <div className="w-14 h-14 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[28px] text-secondary">terminal</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-on-surface">OpenTermo</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-secondary bg-secondary/10 px-1.5 py-0.5 rounded font-terminal-mono">v1.1.1</span>
                    <span className="text-[10px] text-outline/40">Tauri 2 · Rust</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">现代化 SSH 终端客户端，支持集群管理和文件传输</p>
                </div>
              </div>

              {/* Update log */}
              <div>
                <h3 className="text-[12px] font-semibold text-outline/60 uppercase tracking-wider mb-2">更新日志</h3>
                <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                  {[
                    { ver: "v1.1.1", date: "2026-06-30", items: [
                      "定时主题切换：设置面板同时显示浅色/深色时段，精确 setTimeout 零轮询",
                      "跟随系统主题：自动监听系统深浅色偏好",
                      "文件传输对话框：本地/远程双栏文件浏览器",
                      "快捷键自定义：支持编辑快捷键组合，命令面板/终端搜索均可配置",
                      "终端 Ctrl+0 重置字号、Ctrl+滚轮缩放",
                      "关于页面：版本信息与更新日志",
                      "挂载按钮图标化，帮助按钮跳转 GitHub",
                      "侧边栏搜索增强：保持分区展开、脚本命令过滤",
                      "错误提示 6 秒自动清除",
                      "rclone 错误信息增加安装指引",
                    ] },
                    { ver: "v1.1.0", date: "2026-06-30", items: ["全新集群管理功能", "文件传输分栏界面", "批量命令 + 实时终端输出", "SSH exec 通道支持 PTY"] },
                    { ver: "v1.0.9", date: "2026-06-29", items: ["IP 归属地自动显示国家旗帜", "修复日志时间戳重复"] },
                    { ver: "v1.0.8", date: "2026-06-28", items: ["侧边栏 UI 重构", "搜索框移到终端列表上方", "分组名视觉层级优化", "脚本命令支持分组显示"] },
                    { ver: "v1.0.7", date: "2026-06-28", items: ["rclone 密码加密", "残留进程清理", "智能 Tab 切换"] },
                  ].map((rel) => (
                    <div key={rel.ver} className="bg-surface-container-high/50 rounded-lg p-3 border border-outline-variant/10">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-bold text-secondary font-terminal-mono">{rel.ver}</span>
                        <span className="text-[9px] text-outline/40">{rel.date}</span>
                      </div>
                      <ul className="space-y-0.5">
                        {rel.items.map((item, j) => (
                          <li key={j} className="text-[11px] text-on-surface-variant flex items-start gap-1.5">
                            <span className="text-secondary/60 mt-0.5">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={() => invoke("open_url", { url: "https://github.com/zfloong/OpenTermo" })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-all text-xs">
                  <span className="material-symbols-outlined text-[14px]">code</span>
                  GitHub
                </button>
                <button onClick={() => invoke("open_url", { url: "https://github.com/zfloong/OpenTermo/releases/latest" })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-all text-xs">
                  <span className="material-symbols-outlined text-[14px]">update</span>
                  检查更新
                </button>
              </div>
            </div>
          )}
        </main>
      </DialogContent>
    </Dialog>
  );
}

/* ── Editable keyboard shortcuts ── */
function KeyboardShortcuts() {
  const shortcuts = useSettingsStore((s) => s.keyboardShortcuts);
  const updateShortcut = useSettingsStore((s) => s.updateShortcut);
  const [editing, setEditing] = useState<string | null>(null);

  const startEdit = (id: string) => setEditing(id);

  const handleKeyCapture = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    if (e.metaKey) parts.push("Cmd");
    if (e.key && !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      const key = e.key === "+" ? "+/-" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      updateShortcut(id, parts.join(" + "));
      setEditing(null);
    }
  };

  return (
    <div className="space-y-2" onKeyDown={(e) => editing && handleKeyCapture(e, editing)}>
      {shortcuts.map((s) => (
        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-high/50 border border-outline-variant/10 hover:bg-surface-variant/20 hover:border-outline-variant/30 transition-all duration-150 group">
          <span className="text-xs text-on-surface-variant group-hover:text-on-surface transition-colors duration-150">{s.action}</span>
          {s.id === "zoom-in" ? (
            <span
              className="text-[10px] font-terminal-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20 cursor-pointer relative group-hover:bg-secondary/20 group-hover:shadow-[0_0_8px_rgba(77,224,130,0.2)] transition-all duration-150"
              onClick={() => {
                const tip = document.getElementById("zoom-tip");
                if (tip) { tip.classList.remove("opacity-0"); setTimeout(() => tip.classList.add("opacity-0"), 2000); }
              }}
            >
              {s.keys}
              <span id="zoom-tip" className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] bg-surface-container-high text-on-surface-variant px-2 py-1 rounded shadow-lg border border-outline-variant/20 opacity-0 transition-opacity pointer-events-none">
                该快捷键不支持修改
              </span>
            </span>
          ) : editing === s.id ? (
            <input
              autoFocus
              className="w-36 px-2 py-0.5 rounded text-[10px] font-terminal-mono text-secondary bg-secondary/10 border border-secondary/30 outline-none text-center focus:ring-1 focus:ring-secondary/40 focus:shadow-[0_0_8px_rgba(77,224,130,0.15)] transition-all duration-150"
              placeholder="按下新快捷键..."
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => handleKeyCapture(e, s.id)}
            />
          ) : (
            <button
              onClick={() => startEdit(s.id)}
              className="text-[10px] font-terminal-mono text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20 hover:bg-secondary/20 hover:shadow-[0_0_8px_rgba(77,224,130,0.2)] active:scale-95 transition-all duration-150 cursor-pointer"
            >
              {s.keys}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ToggleRow({ title, desc, defaultChecked = false, onChange }: { title: string; desc: string; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
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
          onChange={(e) => { setChecked(e.target.checked); onChange?.(e.target.checked); }}
          className="sr-only peer"
          type="checkbox"
        />
        <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-surface after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary" />
      </div>
    </label>
  );
}