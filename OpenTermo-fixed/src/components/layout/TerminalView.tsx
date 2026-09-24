import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";
import { useSessionStore } from "@/stores/sessionStore";
import { useSettingsStore, type PresetThemeId, type ThemeId } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { effectivePreset } from "@/lib/themeUtils";

// Terminal themes keyed by preset ThemeId — avoids getComputedStyle timing issues.
// The canvas background is transparent on purpose: the container paints it
// through --term-bg-rgb / --term-alpha so the wallpaper can read through.
const TERMINAL_THEMES: Record<PresetThemeId, Record<string, string>> = {
  "deep-blue": {
    background: "rgba(0,0,0,0)",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    cursorAccent: "#0e0f13",
    selectionBackground: "rgba(139,157,195,0.28)",
    selectionForeground: "#ffffff",
    black: "#000000",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#8b9dc3",
    magenta: "#c084fc",
    cyan: "#22d3ee",
    white: "#e4e4e4",
    brightBlack: "#4a5568",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#b3c5e0",
    brightMagenta: "#d8b4fe",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
  "light": {
    background: "rgba(0,0,0,0)",
    foreground: "#2d2d2f",
    cursor: "#2d2d2f",
    cursorAccent: "#fafafa",
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
};

function getTerminalTheme(theme: ThemeId, customBase: PresetThemeId) {
  return TERMINAL_THEMES[effectivePreset(theme, customBase)] || TERMINAL_THEMES["deep-blue"];
}

/** Duration (ms) of the green selection flash after copy. */
const COPY_FLASH_MS = 200;

/** Default font size, kept in step with settingsStore's loadNum() default. */
const DEFAULT_FONT_SIZE = 14;

const SEARCH_HISTORY_KEY = "opentermo-search-history";
const MAX_HISTORY = 20;

/**
 * xterm.js terminal component bound to a single session tab.
 */
export default function TerminalView({ tabId, active }: { tabId: string; active: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sendInput = useSessionStore((s) => s.sendInput);
  const onResize = useSessionStore((s) => s.resize);
  const disconnect = useSessionStore((s) => s.disconnect);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const theme = useSettingsStore((s) => s.theme);
  const customBase = useSettingsStore((s) => s.customBase);
  const tabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === tabId)?.status);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const cursorStyle = useSettingsStore((s) => s.cursorStyle);
  const cursorBlink = useSettingsStore((s) => s.cursorBlink);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const customBaseRef = useRef(customBase);
  customBaseRef.current = customBase;

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
    setHasMatch(s.findNext(query, { incremental: false }));
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
        scrollback: 25000,
      theme: getTerminalTheme(theme, customBase),
      allowTransparency: true,
      fontFamily: fontFamily || "'Meatshell Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize,
      lineHeight: 1.2,
      cursorBlink,
      cursorStyle,
      cursorWidth: 2,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    // Focus must be deferred — xterm textarea needs a tick to mount in DOM
    requestAnimationFrame(() => {
      term.focus();
      try { fitAddon.fit(); } catch {}
    });
    fitAddon.fit();

    // Report every grid change to the backend. `fit()` runs from several places
    // (initial layout, font load, settings changes, container resize) and each
    // one can change cols/rows. The remote PTY must track the *same* grid: if it
    // keeps wrapping at an older width while we render a wider one, readline's
    // cursor maths drift from the rendered cells, long lines land on the wrong
    // column and the prompt looks frozen until a history recall redraws it.
    const resizeSub = term.onResize(({ cols, rows }) => {
      // Fire-and-forget, but swallowed on failure: fit() also runs while a tab
      // is being torn down, and the backend then has no such session to resize.
      // Without the catch that expected race surfaced as an unhandled rejection.
      if (cols > 0 && rows > 0) onResize(tabId, cols, rows).catch(() => {});
    });

    document.fonts?.ready?.then(() => { try { fitAddon.fit(); } catch {} });


    // ── Search addon ──────────────────────────────────────────────────
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    // ── Forward keystrokes to backend ─────────────────────────────────
    term.onData((data) => {
      // Same race as the resize above: keystrokes typed after the session is
      // gone (disconnect, tab close) must not become unhandled rejections.
      sendInput(tabId, data).catch(() => {});
    });

    // ── Custom key handler (Linux terminal conventions) ───────────────
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== "keydown") return true;

      // Ctrl+Shift+F — search lives on Shift because plain Ctrl+F is readline's
      // forward-char, which the terminal must not take away from the shell.
      if (e.ctrlKey && e.shiftKey && (e.key === "f" || e.key === "F")) {
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

      // Ctrl+Shift+C / Ctrl+Insert: copy. Always swallowed, so the key never
      // reaches the shell (Ctrl+C stays reserved for the interrupt signal).
      if (
        (e.ctrlKey && e.shiftKey && (e.key === "c" || e.key === "C")) ||
        (e.ctrlKey && e.key === "Insert")
      ) {
        e.preventDefault();
        copySelection();
        return false;
      }

      // Ctrl+Shift+V / Shift+Insert: paste (only Shift keeps Ctrl+V free for
      // readline's quoted-insert).
      if (
        (e.ctrlKey && e.shiftKey && (e.key === "v" || e.key === "V")) ||
        (e.shiftKey && e.key === "Insert")
      ) {
        e.preventDefault();
        pasteClipboard();
        return false;
      }

      // Ctrl+plus / Ctrl+minus / Ctrl+0: font zoom, as in GNOME Terminal.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        setFontSize((term.options.fontSize ?? DEFAULT_FONT_SIZE) + 1);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setFontSize((term.options.fontSize ?? DEFAULT_FONT_SIZE) - 1);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "0") {
        e.preventDefault();
        setFontSize(DEFAULT_FONT_SIZE);
        return false;
      }

      // Ctrl+Shift+A: select the whole buffer, as in GNOME Terminal.
      if (e.ctrlKey && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        term.selectAll();
        return false;
      }

      // Ctrl+Shift+K / Ctrl+Shift+T belong to the app (palette / launcher), and so
      // do Ctrl+PageUp/PageDown (tab switch) and Ctrl+Shift+W (close tab). Let
      // xterm ignore them — but don't preventDefault, so the window-level
      // listeners still see the key and the shell never gets a stray escape
      // sequence (Ctrl+PageUp would otherwise forward ESC[5;5~ to the remote).
      if (e.ctrlKey && e.shiftKey && ["k", "K", "t", "T", "w", "W"].includes(e.key)) {
        return false;
      }
      if (e.ctrlKey && (e.key === "PageUp" || e.key === "PageDown")) {
        return false;
      }

      // Ctrl+C is never intercepted: it must always reach the shell as SIGINT.
      // Copying is Ctrl+Shift+C, and the right-click menu offers it too.
      return true;
    });

    // ── Copy / paste helpers ──────────────────────────────────────────
    /** Copy the current selection (if any) and flash it green for feedback.
     *  The selection is kept, as in every classic terminal — an explicit
     *  click elsewhere is what clears it. */
    const copySelection = () => {
      const sel = term.getSelection();
      if (!sel) return false;

      navigator.clipboard.writeText(sel).catch(() => {});

      // Brief green flash to confirm the copy
      term.options.theme = {
        ...getTerminalTheme(themeRef.current, customBaseRef.current),
        selectionBackground: "rgba(34, 197, 94, 0.40)",
      };
      setTimeout(() => {
        term.options.theme = getTerminalTheme(themeRef.current, customBaseRef.current);
      }, COPY_FLASH_MS);
      return true;
    };

    // Paste through xterm (`term.paste`) rather than raw sendInput: only that
    // path honours bracketed-paste mode, so a multi-line paste arrives as one
    // block instead of executing line by line.
    const pasteClipboard = () => {
      navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }).catch(() => {});
    };

    // ── Middle-click paste (X11/Ubuntu convention) ────────────────────
    // Capture phase + stopPropagation so xterm cannot also act on the button.
    const onMiddleDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      // A full-screen program that owns the mouse (vim, htop, mc) gets the
      // click instead — xterm has already forwarded it in that case.
      if (term.modes.mouseTrackingMode !== "none") return;
      e.preventDefault();
      e.stopPropagation();
      pasteClipboard();
    };
    container.addEventListener("mousedown", onMiddleDown, true);

      // ── Right-click menu ─────────────────────────────────────────────
    // Kept as a named handler so the cleanup below can detach it. An inline
    // arrow meant one listener piled up per mount — this effect re-runs on
    // every tab activation, so tabs accumulated handlers that each appended
    // their own menu (and left one on <body> for good).
    const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const hasSel = term.getSelection().length > 0;
        const menu = document.createElement("div");
        menu.className = "dropdown-menu";
        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:200`;
        const addItem = (
          label: string,
          shortcut: string | null,
          action: () => void,
          enabled = true,
        ) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dropdown-item";
          btn.style.display = "flex";
          btn.style.alignItems = "center";
          const text = document.createElement("span");
          text.textContent = label;
          btn.appendChild(text);
          if (shortcut) {
            const hint = document.createElement("span");
            hint.textContent = shortcut;
            hint.style.cssText = "margin-left:auto;padding-left:24px;font-size:11px;opacity:0.55";
            btn.appendChild(hint);
          }
          if (!enabled) {
            btn.disabled = true;
            btn.style.opacity = "0.45";
          }
          btn.onmousedown = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (!btn.disabled) action();
            menu.remove();
          };
          menu.appendChild(btn);
        };
        const separator = () => {
          const hr = document.createElement("div");
          hr.style.cssText = "height:1px;margin:4px 0;background:var(--border-subtle)";
          menu.appendChild(hr);
        };

        addItem("复制", "Ctrl+Shift+C", () => { copySelection(); }, hasSel);
        addItem("粘贴", "Ctrl+Shift+V", pasteClipboard);
        addItem("全选", "Ctrl+Shift+A", () => term.selectAll());
        addItem("查找…", "Ctrl+Shift+F", openSearch);
        separator();
        // Ctrl+L is sent to the shell rather than clearing our buffer locally:
        // bash repaints the prompt afterwards, whereas a local-only clear would
        // leave readline drawing on a screen it no longer owns (the same desync
        // that garbles long lines).
        addItem("清屏", "Ctrl+L", () => sendInput(tabId, "\x0c"));
        separator();
        addItem("放大字号", "Ctrl++", () =>
          setFontSize((term.options.fontSize ?? DEFAULT_FONT_SIZE) + 1));
        addItem("缩小字号", "Ctrl+-", () =>
          setFontSize((term.options.fontSize ?? DEFAULT_FONT_SIZE) - 1));
        addItem("重置字号", "Ctrl+0", () => setFontSize(DEFAULT_FONT_SIZE));
        separator();
        addItem("新建标签页", "Ctrl+Shift+T", () => useUIStore.getState().openLauncher());
        addItem("关闭标签页", "Ctrl+Shift+W", () => { void disconnect(tabId); });

        document.body.appendChild(menu);
        // Measured after mounting: getBoundingClientRect() is 0 until the node
        // is in the document. Keep the menu inside the viewport so a right-click
        // near the bottom-right corner doesn't clip it.
        const box = menu.getBoundingClientRect();
        const margin = 8;
        menu.style.left = `${Math.max(margin, Math.min(e.clientX, window.innerWidth - box.width - margin))}px`;
        menu.style.top = `${Math.max(margin, Math.min(e.clientY, window.innerHeight - box.height - margin))}px`;
        const onMenuKey = (ev: KeyboardEvent) => {
          if (ev.key === "Escape") {
            ev.preventDefault();
            close();
          }
        };
        const close = () => {
          menu.remove();
          document.removeEventListener("mousedown", close);
          document.removeEventListener("keydown", onMenuKey, true);
        };
        setTimeout(() => {
          document.addEventListener("mousedown", close);
          document.addEventListener("keydown", onMenuKey, true);
        }, 0);
    };
    container.addEventListener("contextmenu", onContextMenu);

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
      container.removeEventListener("mousedown", onMiddleDown, true);
      container.removeEventListener("contextmenu", onContextMenu);
      resizeSub.dispose();
      window.removeEventListener(`terminal-data:${tabId}`, onData);
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [tabId, sendInput, onResize, openSearch, closeSearch]);

  // ── Watch theme changes and update terminal colors ───────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme(theme, customBase);
    }
  }, [theme, customBase]);

  // ── Watch font size changes ──────────────────────────
  useEffect(() => {
    const term = terminalRef.current;
    if (term && term.options.fontSize !== fontSize) {
      term.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  // ── Watch fontFamily changes ─────────────────────────
  useEffect(() => {
    const term = terminalRef.current;
    if (term) {
      term.options.fontFamily = fontFamily || "'Meatshell Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace";
      // The new font has different metrics — recompute the grid so cols/rows
      // (and therefore the backend PTY size) match what is on screen.
      try { fitAddonRef.current?.fit(); } catch {}
    }
  }, [fontFamily]);

  // ── Watch cursorStyle changes ────────────────────────
  useEffect(() => {
    const term = terminalRef.current;
    if (term) {
      term.options.cursorStyle = cursorStyle;
    }
  }, [cursorStyle]);

  // ── Watch cursorBlink changes ────────────────────────
  useEffect(() => {
    const term = terminalRef.current;
    if (term) {
      term.options.cursorBlink = cursorBlink;
    }
  }, [cursorBlink]);

  // ── Scroll to bottom when command panel triggers ───────────
  const triggerScroll = useSessionStore((s) => s.triggerScroll);
  const scrollTrigger = useSessionStore((s) => s.scrollTrigger[tabId] ?? 0);
  const scrollTriggerRef = useRef(scrollTrigger);
  useEffect(() => {
    if (scrollTrigger > scrollTriggerRef.current) {
      scrollTriggerRef.current = scrollTrigger;
      terminalRef.current?.scrollToBottom();
    }
  }, [scrollTrigger]);


  // ── Resize terminal to fill container ───────────────────────
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const containerCallback = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
    },
    [],
  );

  // Observe the terminal-area (a non-absolute flex child) for reliable resize events
  useEffect(() => {
    const area = document.getElementById("terminal-area");
    if (!area) return;
    const ro = new ResizeObserver(() => {
      // fit() notifies the backend through the term.onResize subscription.
      try { fitAddonRef.current?.fit(); } catch {}
    });
    ro.observe(area);
    resizeObserverRef.current = ro;
    return () => ro.disconnect();
  }, []);

  // Refit when this tab becomes visible: a resize that happened while the tab
  // was hidden never reached this terminal (fit() is a no-op while hidden).
  useEffect(() => {
    if (!active) return;
    try { fitAddonRef.current?.fit(); } catch {}
  }, [active]);

  // The backend PTY starts at its default 80x24 and only learns our grid from a
  // resize command — which the very first fit() can easily fire before the SSH
  // session exists (the command is then dropped). Re-assert the grid once the
  // tab actually reports "connected" so the remote can never keep a stale width.
  useEffect(() => {
    if (tabStatus !== "connected") return;
    const term = terminalRef.current;
    if (!term) return;
    try { fitAddonRef.current?.fit(); } catch {}
    if (term.cols > 0 && term.rows > 0) onResize(tabId, term.cols, term.rows);
  }, [tabStatus, tabId, onResize]);

  // navigation in history dropdown ───────────────────
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
    setHasMatch(s.findNext(searchQuery));
  };

  const searchPrev = () => {
    const s = searchAddonRef.current;
    if (!s || !searchQuery.trim()) return;
    setHasMatch(s.findPrevious(searchQuery));
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={containerCallback}
        className="absolute inset-0 term-canvas"
      />

      {/* ── Search bar ───────────────────────────────────────────────── */}
      {searchOpen && (
        <div
          className="absolute top-3 right-4 z-20 flex flex-col"
          style={{ minWidth: 280 }}
        >
          <div
            className="flex items-center gap-1.5 bg-[var(--bg-elevated)] border border-[var(--frame-border)] rounded-md px-2.5 py-1.5 shadow-lg"
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
            <div className="mt-1 bg-[var(--bg-elevated)] border border-[var(--frame-border)] rounded-md shadow-lg overflow-hidden">
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

