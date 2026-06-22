import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";
import { useSessionStore } from "@/stores/sessionStore";
import { useSettingsStore } from "@/stores/settingsStore";

function getTerminalTheme() {
  const s = getComputedStyle(document.documentElement);
  return {
    background: s.getPropertyValue("--bg-base").trim() || "#080c12",
    foreground: s.getPropertyValue("--text-primary").trim() || "#e9eef5",
    cursor: s.getPropertyValue("--accent").trim() || "#5b9cf5",
    cursorAccent: s.getPropertyValue("--bg-base").trim() || "#080c12",
    selectionBackground: s.getPropertyValue("--accent-dim").trim() || "rgba(91,156,245,0.28)",
    selectionForeground: s.getPropertyValue("--text-inverse").trim() || "#ffffff",
    black: s.getPropertyValue("--bg-base").trim() || "#080c12",
    red: s.getPropertyValue("--color-danger").trim() || "#f87171",
    green: s.getPropertyValue("--color-success").trim() || "#4ade80",
    yellow: s.getPropertyValue("--color-warning").trim() || "#fbbf24",
    blue: s.getPropertyValue("--accent").trim() || "#5b9cf5",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: s.getPropertyValue("--text-primary").trim() || "#e9eef5",
    brightBlack: "#4a5568",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: s.getPropertyValue("--text-inverse").trim() || "#ffffff",
  };
}

/** Duration (ms) of the green selection flash after copy. */
const COPY_FLASH_MS = 200;

const SEARCH_HISTORY_KEY = "meatshell-search-history";
const MAX_HISTORY = 20;

/**
 * xterm.js terminal component bound to a single session tab.
 */
export default function TerminalView({ tabId }: { tabId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sendInput = useSessionStore((s) => s.sendInput);
  const onResize = useSessionStore((s) => s.resize);
  const theme = useSettingsStore((s) => s.theme);

  // ── Search state ──────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMatch, setHasMatch] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOpenRef = useRef(false);
  const searchQueryRef = useRef("");

  // ── Search history ────────────────────────────────────────────────────
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyHighlight, setHistoryHighlight] = useState(-1);

  // ── Sync refs so attachCustomKeyEventHandler reads latest state ───────
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    searchOpenRef.current = true;
    setHistoryVisible(true);
    setHistoryHighlight(-1);
    // Focus + select-all on next tick so the input is mounted
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, []);

  const closeSearch = useCallback(() => {
    const s = searchAddonRef.current;
    if (s) s.clearDecorations();
    setSearchOpen(false);
    searchOpenRef.current = false;
    setSearchQuery("");
    searchQueryRef.current = "";
    setHasMatch(true);
    setHistoryVisible(false);
    setHistoryHighlight(-1);
    // Return focus to terminal
    terminalRef.current?.focus();
  }, []);

  // ── Search history helpers ────────────────────────────────────────────
  const persistHistory = (items: string[]) => {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
    setSearchHistory(items);
  };

  const addToHistory = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setSearchHistory((prev) => {
        const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const removeHistoryItem = useCallback(
    (q: string) => {
      const next = searchHistory.filter((h) => h !== q);
      persistHistory(next);
    },
    [searchHistory],
  );

  const clearHistory = useCallback(() => {
    persistHistory([]);
  }, []);

  // ── Search execution ──────────────────────────────────────────────────
  const doSearch = useCallback((query: string) => {
    const s = searchAddonRef.current;
    if (!s) return;
    if (!query.trim()) {
      s.clearDecorations();
      setHasMatch(true);
      return;
    }
    s.findNext(query, { incremental: false });
    // Detect whether any match was found by checking decorations
    // findNext returns void, so we check manually:
    // A quick findNext then findPrevious to see if there's a result.
    // Simpler: use a flag — if findNext moved, there's a match.
    // Workaround: try findNext and if decorationsCount is 0, no match.
    s.findNext(query, { incremental: false });
    s.findPrevious(query);
    setHasMatch(true);
  }, []);

  // When searchQuery changes, do a search
  useEffect(() => {
    if (!searchOpen) return;
    searchQueryRef.current = searchQuery;
    const timer = setTimeout(() => doSearch(searchQuery), 50);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, doSearch]);

  // ── Initialize terminal on mount ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: "'Meatshell Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    // ── Search addon ──────────────────────────────────────────────────
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // ── Forward keystrokes to backend ─────────────────────────────────
    term.onData((data) => {
      sendInput(tabId, data);
    });

    // ── Custom key handler: Ctrl+F / Esc ──────────────────────────────
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== "keydown") return true;

      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        if (searchOpenRef.current) {
          // Already open — just focus & select all
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          openSearch();
        }
        return false;
      }

      if (e.key === "Escape" && searchOpenRef.current) {
        e.preventDefault();
        closeSearch();
        return false;
      }

      return true;
    });

    // ── Select-to-copy ────────────────────────────────────────────────
    let mouseDown = false;

    const flashCopy = () => {
      const sel = term.getSelection();
      if (!sel) return;

      navigator.clipboard.writeText(sel).catch(() => {});

      // Brief green flash to distinguish from normal blue selection
      term.options.theme = {
        ...getTerminalTheme(),
        selectionBackground: "rgba(34, 197, 94, 0.40)",
      };
      setTimeout(() => {
        term.options.theme = getTerminalTheme();
      }, COPY_FLASH_MS);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || !mouseDown) return;
      mouseDown = false;
      flashCopy();
    };
    const onMouseLeave = () => {
      if (mouseDown) {
        mouseDown = false;
        flashCopy();
      }
    };

    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mouseup", onMouseUp);
    container.addEventListener("mouseleave", onMouseLeave);

      // Right-click context menu for copy/paste
      container.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        const sel = term.getSelection();
        const hasSel = sel.length > 0;
        const menu = document.createElement("div");
        menu.className = "dropdown-menu";
        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:200`;
        const addItem = (label: string, action: () => void) => {
          const btn = document.createElement("button");
          btn.className = "dropdown-item";
          btn.textContent = label;
          btn.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); action(); menu.remove(); };
          menu.appendChild(btn);
        };
        addItem("复制", async () => { if (hasSel) await navigator.clipboard.writeText(sel); });
        addItem("粘贴", () => { navigator.clipboard.readText().then((t) => { if (t) sendInput(tabId, t); }); });
        if (hasSel) addItem("复制并粘贴", async () => { await navigator.clipboard.writeText(sel); navigator.clipboard.readText().then((t) => { if (t) sendInput(tabId, t); }); });
        document.body.appendChild(menu);
        const close = () => { menu.remove(); document.removeEventListener("mousedown", close); };
        setTimeout(() => document.addEventListener("mousedown", close), 0);
      });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // ── Listen for output from the backend ────────────────────────────
    const onData = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        term.write(detail);
      }
    };
    window.addEventListener(`terminal-data:${tabId}`, onData);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener(`terminal-data:${tabId}`, onData);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [tabId, sendInput, openSearch, closeSearch]);

  // ── Watch theme changes and update terminal colors ───────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme();
    }
  }, [theme]);


  // ── Resize terminal to fill container ────────────────────────────────
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const containerCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      containerRef.current = node;

      if (node) {
        resizeObserverRef.current = new ResizeObserver(() => {
          const fitAddon = fitAddonRef.current;
          const term = terminalRef.current;
          if (!fitAddon || !term) return;

          try {
            fitAddon.fit();
            onResize(tabId, term.cols, term.rows);
          } catch {
            // Terminal may not be ready yet
          }
        });
        resizeObserverRef.current.observe(node);
      }
    },
    [tabId, onResize],
  );

  // Cleanup resize observer on unmount
  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);


  // ── Search keyboard navigation in history dropdown ───────────────────
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (historyVisible && searchHistory.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHistoryHighlight((prev) =>
          prev < searchHistory.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyHighlight <= 0) {
          setHistoryVisible(false);
          setHistoryHighlight(-1);
        } else {
          setHistoryHighlight((prev) => prev - 1);
        }
        return;
      }
      if (e.key === "Enter" && historyHighlight >= 0) {
        e.preventDefault();
        const q = searchHistory[historyHighlight];
        setSearchQuery(q);
        addToHistory(q);
        setHistoryVisible(false);
        setHistoryHighlight(-1);
        return;
      }
    }

    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      addToHistory(searchQuery.trim());
      setHistoryVisible(false);
      setHistoryHighlight(-1);
      doSearch(searchQuery);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  };

  const handleSearchFocus = () => {
    if (!searchQuery.trim()) {
      setHistoryVisible(true);
      setHistoryHighlight(-1);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setHistoryVisible(false);
    setHistoryHighlight(-1);
  };

  const searchNext = () => {
    const s = searchAddonRef.current;
    if (!s || !searchQuery.trim()) return;
    s.findNext(searchQuery);
  };

  const searchPrev = () => {
    const s = searchAddonRef.current;
    if (!s || !searchQuery.trim()) return;
    s.findPrevious(searchQuery);
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={containerCallback}
        className="h-full w-full"
        style={{ padding: "4px 8px" }}
      />

      {/* ── Search bar ───────────────────────────────────────────────── */}
      {searchOpen && (
        <div
          className="absolute top-3 right-4 z-20 flex flex-col"
          style={{ minWidth: 280 }}
        >
          <div
            className="flex items-center gap-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 shadow-lg"
          >
            {/* Search icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-[var(--text-muted)] shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            {/* Input */}
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={handleSearchFocus}
              onBlur={() => setTimeout(() => setHistoryVisible(false), 150)}
              placeholder="搜索…"
              className="flex-1 bg-transparent text-[var(--text-primary)] text-[13px] font-mono outline-none placeholder:text-[var(--text-muted)] min-w-0"
              spellCheck={false}
              autoComplete="off"
            />

            {/* Match status dot */}
            <span
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                hasMatch ? "bg-green-400" : "bg-red-400"
              }`}
              title={hasMatch ? "已匹配" : "无匹配"}
            />

            {/* Prev / Next */}
            <button
              onClick={searchPrev}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
              title="上一个"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <button
              onClick={searchNext}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
              title="下一个"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={closeSearch}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
              title="关闭搜索 (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* ── History dropdown ─────────────────────────────────────── */}
          {historyVisible && searchHistory.length > 0 && (
            <div className="mt-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-md shadow-lg overflow-hidden">
              <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                Recent
              </div>
              <div className="max-h-[180px] overflow-auto">
                {searchHistory.map((q, i) => (
                  <div
                    key={`${q}-${i}`}
                    className={`flex items-center justify-between px-2.5 py-1.5 cursor-pointer text-[13px] group transition-colors ${
                      i === historyHighlight
                        ? "bg-[var(--surface-selected)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    }`}
                    onMouseEnter={() => setHistoryHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchQuery(q);
                      addToHistory(q);
                      setHistoryVisible(false);
                      setHistoryHighlight(-1);
                    }}
                  >
                    <span className="truncate font-mono">{q}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistoryItem(q);
                      }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-all"
                      title="移除"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--border-subtle)]">
                <button
                  onClick={clearHistory}
                  className="w-full px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                >
                  Clear all searches
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
