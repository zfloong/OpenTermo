import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { useSessionStore } from "@/stores/sessionStore";

/**
 * xterm.js terminal component bound to a single session tab.
 *
 * - Receives output via custom DOM events dispatched by sessionStore.
 * - Sends keystrokes back via Tauri command.
 * - Automatically resizes to fill its container.
 */
export default function TerminalView({ tabId }: { tabId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sendInput = useSessionStore((s) => s.sendInput);
  const onResize = useSessionStore((s) => s.resize);

  // Initialize terminal on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#1E1E2E",
        foreground: "#CDD6F4",
        cursor: "#89B4FA",
        cursorAccent: "#1E1E2E",
        selectionBackground: "rgba(137, 180, 250, 0.3)",
        black: "#45475A",
        red: "#F38BA8",
        green: "#A6E3A1",
        yellow: "#F9E2AF",
        blue: "#89B4FA",
        magenta: "#F5C2E7",
        cyan: "#94E2D5",
        white: "#BAC2DE",
        brightBlack: "#585B70",
        brightRed: "#F38BA8",
        brightGreen: "#A6E3A1",
        brightYellow: "#F9E2AF",
        brightBlue: "#89B4FA",
        brightMagenta: "#F5C2E7",
        brightCyan: "#94E2D5",
        brightWhite: "#A6ADC8",
      },
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // Forward keystrokes to backend
    term.onData((data) => {
      sendInput(tabId, data);
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Listen for output from the backend (dispatched by sessionStore)
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
    };
  }, [tabId, sendInput]);

  // Resize terminal to fill container
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const containerCallback = useCallback(
    (node: HTMLDivElement | null) => {
      // Cleanup old observer
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

  return (
    <div
      ref={containerCallback}
      className="h-full w-full"
      style={{ padding: "4px 8px" }}
    />
  );
}
