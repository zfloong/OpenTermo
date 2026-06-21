import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { useCommandStore } from "@/stores/commandStore";
import { useSessionStore } from "@/stores/sessionStore";
import { resolveCommandTemplate } from "@/lib/utils";
import type { CommandEntry } from "@/lib/tauriCommands";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useCommandStore((s) => s.entries);
  const recordUsage = useCommandStore((s) => s.recordUsage);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sendInput = useSessionStore((s) => s.sendInput);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Filter commands by fuzzy search
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

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  // Global keyboard listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setQuery("");
            setTimeout(() => inputRef.current?.focus(), 0);
          }
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const execute = useCallback(
    (entry: CommandEntry) => {
      if (!activeTabId) return;
      const resolved = resolveCommandTemplate(entry.command, activeTab?.session);
      sendInput(activeTabId, resolved + "\n");
      recordUsage(entry.id);
      setOpen(false);
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
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)]">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands…"
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-muted)]"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-hover)] px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
              {query ? "No commands found" : "No commands yet. Add some in the sidebar!"}
            </div>
          ) : (
            results.map((entry, i) => {
              const isSelected = i === selectedIdx;
              return (
                <button
                  key={entry.id}
                  onClick={() => execute(entry)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "bg-[var(--surface-selected)]"
                      : "hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {/* Icon or category tag */}
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-[var(--accent-dim)] text-[var(--accent)] text-xs font-mono">
                    {entry.icon || (entry.command || "").slice(0, 2).toUpperCase()}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--text-primary)] truncate font-medium">
                      {entry.label || entry.command}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {entry.category && (
                        <span className="text-[var(--accent)]">{entry.category} · </span>
                      )}
                      {entry.command}
                    </div>
                  </div>

                  {isSelected && (
                    <CornerDownLeft
                      size={14}
                      className="text-[var(--text-muted)] shrink-0"
                    />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
          <span>↑↓ Navigate</span>
          <span>↵ Execute</span>
          <span>Esc Close</span>
          {!activeTabId && (
            <span className="text-[var(--color-warning)] ml-auto">No active session</span>
          )}
        </div>
      </div>
    </div>
  );
}
