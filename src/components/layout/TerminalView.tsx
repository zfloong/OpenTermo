﻿﻿﻿﻿﻿﻿import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";
import { useSessionStore } from "@/stores/sessionStore";
import { useSettingsStore } from "@/stores/settingsStore";

// ... (keep existing code)
const TERMINAL_THEMES: Record<string, Record<string, string>> = {
  "deep-blue": {
    background: "#090909",
    foreground: "#e5e2e1",
    cursor: "#b5c7ef",
    cursorAccent: "#090909",
    selectionBackground: "rgba(181,199,239,0.28)",
    selectionForeground: "#ffffff",
    black: "#090909",
    red: "#f87171",
    green: "#4de082",
    yellow: "#fbbf24",
    blue: "#b5c7ef",
    magenta: "#c8bfff",
    cyan: "#22d3ee",
    white: "#e5e2e1",
    brightBlack: "#353534",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#d7e2ff",
    brightMagenta: "#e5deff",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
  "light": {
    background: "#f8f9fb",
    foreground: "#1a1d23",
    cursor: "#1a1d23",
    cursorAccent: "#f8f9fb",
    selectionBackground: "rgba(59,130,246,0.22)",
    selectionForeground: "#ffffff",
    black: "#f8f9fb",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#f59e0b",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#1a1d23",
    brightBlack: "#9ca3af",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#b3c5e0",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#374151",
  },
  "tabby": {
    background: "#13171d",
    foreground: "#e2e6ed",
    cursor: "#e2e6ed",
    cursorAccent: "#13171d",
    selectionBackground: "rgba(123,104,238,0.28)",
    selectionForeground: "#ffffff",
    black: "#13171d",
    red: "#f06278",
    green: "#50d890",
    yellow: "#f0c060",
    blue: "#7b68ee",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e2e6ed",
    brightBlack: "#4a5568",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#9b8cf0",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
};

function getTerminalTheme(themeId: string) {
  return TERMINAL_THEMES[themeId] || TERMINAL_THEMES["deep-blue"];
}

const COPY_FLASH_MS = 200;
const SEARCH_HISTORY_KEY = "opentermo-search-history";
const MAX_HISTORY = 20;

export default function TerminalView({ tabId }: { tabId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sendInput = useSessionStore((s) => s.sendInput);
  const onResize = useSessionStore((s) => s.resize);
  const theme = useSettingsStore((s) => s.theme);
  const effectiveTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "deep-blue" : "light")
    : theme;
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const themeRef = useRef(effectiveTheme);
  themeRef.current = effectiveTheme;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMatch, setHasMatch] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOpenRef = useRef(false);
  const searchQueryRef = useRef("");

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

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    searchOpenRef.current = true;
    setHistoryVisible(true);
    setHistoryHighlight(-1);
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
    terminalRef.current?.focus();
  }, []);

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

  const doSearch = useCallback((query: string) => {
    const s = searchAddonRef.current;
    if (!s) return;
    if (!query.trim()) {
      s.clearDecorations();
      setHasMatch(true);
      return;
    }
    s.findNext(query, { incremental: false });
    s.findNext(query, { incremental: false });
    s.findPrevious(query);
    setHasMatch(true);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchQueryRef.current = searchQuery;
    const timer = setTimeout(() => doSearch(searchQuery), 50);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, doSearch]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const term = new Terminal({
      theme: getTerminalTheme(effectiveTheme),
      fontFamily: `'${fontFamily}', 'JetBrains Mono', 'Consolas', monospace`,
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    requestAnimationFrame(() => {
      term.focus();
      try { fitAddon.fit(); } catch {}
    });
    fitAddon.fit();

    const blockDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    container.addEventListener('dblclick', blockDblClick, true);
    document.fonts?.ready?.then(() => { try { fitAddon.fit(); } catch {} });

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    term.onData((data) => {
      sendInput(tabId, data);
    });

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== "keydown") return true;

      // Read shortcut from store via ref to avoid stale closure
      const shortcut = useSettingsStore.getState().keyboardShortcuts.find((k) => k.id === "search-term")?.keys || "Ctrl + Shift + F";
      if (matchesShortcut(e, shortcut)) {
        e.preventDefault();
        if (searchOpenRef.current) {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else {
          openSearch();
        }
        return false;
      }

      // Zoom in/out terminal font (Ctrl+Wheel)
      if (e.ctrlKey && e.key === "0") {
        e.preventDefault();
        useSettingsStore.getState().setFontSize(14);
        return false;
      }

      if (e.key === "Escape" && searchOpenRef.current) {
        e.preventDefault();
        closeSearch();
        return false;
      }

      if (e.ctrlKey && e.shiftKey && (e.key === "c" || e.key === "C")) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
        }
        return false;
      }

      return true;
    });

    // Ctrl+Wheel zoom
    term.element?.addEventListener("wheel", (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const current = useSettingsStore.getState().fontSize;
        if (e.deltaY < 0) {
          useSettingsStore.getState().setFontSize(current + 1);
        } else if (e.deltaY > 0) {
          useSettingsStore.getState().setFontSize(current - 1);
        }
      }
    }, { passive: false });

    let mouseDown = false;

    const flashCopy = () => {
      const sel = term.getSelection();
      if (!sel) return;

      navigator.clipboard.writeText(sel).catch(() => {});

      term.options.theme = {
        ...getTerminalTheme(themeRef.current),
        selectionBackground: "rgba(34, 197, 94, 0.40)",
      };
      setTimeout(() => {
        term.options.theme = getTerminalTheme(themeRef.current);
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

    container.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      const sel = term.getSelection();
      const hasSel = sel.length > 0;
      const menu = document.createElement("div");
      menu.className = "dropdown-menu";
      menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:200;min-width:160px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:8px;box-shadow:var(--shadow-lg);overflow:hidden`;
      const addItem = (label: string, action: () => void) => {
        const btn = document.createElement("button");
        btn.style.cssText = "width:100%;padding:8px 12px;text-align:left;font-size:12px;color:var(--text-primary);background:none;border:none;cursor:pointer;transition:background 0.15s";
        btn.textContent = label;
        btn.onmouseenter = () => btn.style.background = "var(--surface-hover)";
        btn.onmouseleave = () => btn.style.background = "none";
        btn.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); action(); menu.remove(); };
        menu.appendChild(btn);
      };
      addItem("复制", async () => { if (hasSel) await navigator.clipboard.writeText(sel); });
      addItem("粘贴", () => { navigator.clipboard.readText().then((t) => { if (t) sendInput(tabId, t); }); });
      if (hasSel) {
        const sep = document.createElement("div");
        sep.style.cssText = "height:1px;background:var(--border-strong)";
        menu.appendChild(sep);
        addItem("复制并粘贴", async () => { await navigator.clipboard.writeText(sel); navigator.clipboard.readText().then((t) => { if (t) sendInput(tabId, t); }); });
      }
      document.body.appendChild(menu);
      const close = () => { menu.remove(); document.removeEventListener("mousedown", close); };
      setTimeout(() => document.addEventListener("mousedown", close), 0);
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const onData = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        term.write(detail);
      }
    };
    window.addEventListener(`terminal-data:${tabId}`, onData);

    return () => {
      window.removeEventListener(`terminal-data:${tabId}`, onData);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [tabId, sendInput, openSearch, closeSearch]);

  useEffect(() => {
    if (terminalRef.current) {
      const t = theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "deep-blue" : "light")
        : theme;
      terminalRef.current.options.theme = getTerminalTheme(t);
    }
  }, [theme]);

  useEffect(() => {
    const term = terminalRef.current;
    if (term && term.options.fontSize !== fontSize) {
      term.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  useEffect(() => {
    const term = terminalRef.current;
    if (term && term.options.fontFamily !== fontFamily) {
      term.options.fontFamily = `'${fontFamily}', 'JetBrains Mono', 'Consolas', monospace`;
    }
  }, [fontFamily]);

  const triggerScroll = useSessionStore((s) => s.triggerScroll);
  const scrollTrigger = useSessionStore((s) => s.scrollTrigger[tabId] ?? 0);
  const scrollTriggerRef = useRef(scrollTrigger);
  useEffect(() => {
    if (scrollTrigger > scrollTriggerRef.current) {
      scrollTriggerRef.current = scrollTrigger;
      terminalRef.current?.scrollToBottom();
    }
  }, [scrollTrigger]);

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const containerCallback = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
    },
    [],
  );

  useEffect(() => {
    const area = document.getElementById("terminal-area");
    if (!area) return;
    const ro = new ResizeObserver(() => {
      const fitAddon = fitAddonRef.current;
      const term = terminalRef.current;
      if (!fitAddon || !term) return;
      try { fitAddon.fit(); } catch {}
      if (term.cols > 0 && term.rows > 0) {
        onResize(tabId, term.cols, term.rows);
      }
    });
    ro.observe(area);
    resizeObserverRef.current = ro;
    return () => ro.disconnect();
  }, [tabId, onResize]);

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
      <div ref={containerCallback} className="absolute inset-0" />

      {searchOpen && (
        <div className="absolute top-3 right-4 z-20 flex flex-col" style={{ minWidth: 280 }}>
          <div className="flex items-center gap-1.5 bg-surface-container-low border-outline-variant rounded-lg px-3 py-2 shadow-lg" style={{ backdropFilter: "blur(20px)" }}>
            <span className="material-symbols-outlined text-[16px] text-outline shrink-0">search</span>

            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={handleSearchFocus}
              onBlur={() => setTimeout(() => setHistoryVisible(false), 150)}
              placeholder="搜索…"
              className="flex-1 bg-transparent text-on-surface text-[13px] font-terminal-mono outline-none placeholder:text-on-surface-variant/60 min-w-0"
              spellCheck={false}
              autoComplete="off"
            />

            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${hasMatch ? "bg-green-400" : "bg-red-400"}`} title={hasMatch ? "已匹配" : "无匹配"} />

            <button onClick={searchPrev} className="p-1 text-on-surface-variant hover:text-on-surface rounded transition-colors" title="上一个">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <button onClick={searchNext} className="p-1 text-on-surface-variant hover:text-on-surface rounded transition-colors" title="下一个">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </button>

            <button onClick={closeSearch} className="p-1 text-on-surface-variant hover:text-on-surface rounded transition-colors" title="关闭搜索 (Esc)">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {historyVisible && searchHistory.length > 0 && (
            <div className="mt-2 bg-surface-container-low border-outline-variant rounded-lg shadow-lg overflow-hidden" style={{ backdropFilter: "blur(20px)" }}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant border-b border-outline-variant">
                搜索历史
              </div>
              <div className="max-h-[180px] overflow-auto">
                {searchHistory.map((q, i) => (
                  <div
                    key={`${q}-${i}`}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer text-[13px] group transition-colors ${
                      i === historyHighlight
                        ? "bg-secondary/10 text-secondary"
                        : "text-on-surface-variant hover:bg-surface-variant/30"
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
                    <span className="truncate font-terminal-mono">{q}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistoryItem(q);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error rounded transition-all"
                      title="移除"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-outline-variant">
                <button
                  onClick={clearHistory}
                  className="w-full px-3 py-2 text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors text-left"
                >
                  清除全部搜索记录
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Match keyboard event against a shortcut string like "Ctrl + Shift + F" */
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