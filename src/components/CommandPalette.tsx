import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useCommandStore } from "@/stores/commandStore";
import { useSessionStore } from "@/stores/sessionStore";
import { resolveCommandTemplate } from "@/lib/utils";
import type { CommandEntry } from "@/lib/tauriCommands";

import { useSettingsStore } from "@/stores/settingsStore";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchShortcut = useSettingsStore((s) => s.keyboardShortcuts.find((k) => k.id === "search-cmd")?.keys || "Ctrl + F");

  const entries = useCommandStore((s) => s.entries);
  const recordUsage = useCommandStore((s) => s.recordUsage);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sendInput = useSessionStore((s) => s.sendInput);
  const triggerScroll = useSessionStore((s) => s.triggerScroll);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const results = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 20);
    const lower = query.toLowerCase();
    return entries
      .filter(
        (e) =>
          (e.label || "").toLowerCase().includes(lower) ||
          e.command.toLowerCase().includes(lower) ||
          (e.description || "").toLowerCase().includes(lower) ||
          (e.category || "").toLowerCase().includes(lower),
      )
      .slice(0, 20);
  }, [entries, query]);

  useEffect(() => { setSelectedIdx(0); }, [results]);

  // Ctrl+K toggle
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, searchShortcut)) {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 0); }
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchShortcut]);

  const execute = useCallback(
    (entry: CommandEntry) => {
      if (!activeTabId) return;
      const resolved = resolveCommandTemplate(entry.command, activeTab?.session);
      sendInput(activeTabId, resolved + "\n");
      triggerScroll(activeTabId);
      recordUsage(entry.id);
      setOpen(false);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
      }, 50);
    },
    [activeTabId, activeTab, sendInput, recordUsage],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIdx]) execute(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-[#1a1a1a] border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-[18px] text-outline/50 shrink-0">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索脚本命令..."
            className="flex-1 bg-transparent text-on-surface text-sm outline-none placeholder:text-outline/40"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="text-[10px] text-outline/40 bg-surface-variant/20 px-1.5 py-0.5 rounded font-terminal-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-outline/40">
              {query ? "没有匹配的脚本命令" : "暂无脚本命令，在侧边栏添加"}
            </div>
          ) : (
            results.map((entry, i) => {
              const isSelected = i === selectedIdx;
              return (
                <button
                  key={entry.id}
                  onClick={() => execute(entry)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all border-l-2 ${
                    isSelected
                      ? "bg-secondary/10 border-l-secondary text-secondary"
                      : "border-l-transparent hover:bg-surface-variant/20 text-on-surface-variant"
                  }`}
                >
                  {/* Icon */}
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-variant/25 text-outline/60 flex-shrink-0">
                    <span className="material-symbols-outlined text-[16px]">terminal</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate font-medium">{entry.label || entry.command}</div>
                    <div className="text-[11px] text-outline/50 truncate font-terminal-mono">
                      {entry.category && <span className="text-secondary/70">{entry.category} · </span>}
                      {entry.command}
                    </div>
                  </div>

                  {/* Arrow hint on selected */}
                  {isSelected && (
                    <span className="material-symbols-outlined text-[14px] text-outline/50 shrink-0">arrow_forward</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-outline-variant/10 text-[10px] text-outline/40">
          <span>↑↓ 切换</span>
          <span>↵ 执行</span>
          <span>Esc 关闭</span>
          {!activeTabId && (
            <span className="text-yellow-400 ml-auto">无活跃会话</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Match keyboard event against a shortcut string like "Ctrl + F" */
function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split(" + ").map((p) => p.trim());
  const needsCtrl = parts.includes("Ctrl");
  const needsShift = parts.includes("Shift");
  const needsAlt = parts.includes("Alt");
  const needsCmd = parts.includes("Cmd");
  if (needsCtrl && !e.ctrlKey && !e.metaKey) return false;
  if (needsShift && !e.shiftKey) return false;
  if (needsAlt && !e.altKey) return false;
  if (needsCmd && !e.metaKey) return false;
  const keyPart = parts.find((p) => !["Ctrl", "Shift", "Alt", "Cmd"].includes(p));
  if (keyPart) {
    const targetKey = keyPart === "+/-" ? "+" : keyPart.toLowerCase();
    if (e.key.toLowerCase() !== targetKey) return false;
  }
  return true;
}
