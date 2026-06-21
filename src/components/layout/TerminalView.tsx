import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { useSessionStore } from "@/stores/sessionStore";

const terminalTheme = {
  background: "#0a0e14",
  foreground: "#d4d4d4",
  cursor: "#66b8ff",
  cursorAccent: "#0a0e14",
  selectionBackground: "rgba(102, 184, 255, 0.25)",
  selectionForeground: "#ffffff",
  black: "#0a0e14",
  red: "#d9534f",
  green: "#5cb85c",
  yellow: "#f0ad4e",
  blue: "#66b8ff",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#d4d4d4",
  brightBlack: "#555555",
  brightRed: "#ff6b6b",
  brightGreen: "#7ec699",
  brightYellow: "#f0ad4e",
  brightBlue: "#6dbdff",
  brightMagenta: "#d19a66",
  brightCyan: "#7ec699",
  brightWhite: "#ffffff",
};

/**
 * xterm.js terminal component bound to a single session tab.
 */
export default function TerminalView({ tabId }: { tabId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sendInput = useSessionStore((s) => s.sendInput);
  const onResize = useSessionStore((s) => s.resize);

  // Initialize terminal on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: terminalTheme,
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

    // Listen for output from the backend
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
