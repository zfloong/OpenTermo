import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Plus } from "lucide-react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { useSessionStore } from "@/stores/sessionStore";

interface TitleBarProps {
  onConnect: () => void;
}

export default function TitleBar({ onConnect }: TitleBarProps) {
  const startDrag = useWindowDrag();
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const disconnect = useSessionStore((s) => s.disconnect);

  const minimize = useCallback(() => getCurrentWindow().minimize(), []);
  const toggleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), []);
  const close = useCallback(() => getCurrentWindow().close(), []);

  return (
    <header
      data-tauri-drag-region
      onMouseDown={startDrag}
      className="flex h-9 items-center bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] select-none flex-shrink-0"
    >
      {/* Logo + app name */}
      <div className="flex items-center gap-2 pl-3 pr-2 flex-shrink-0">
        <span className="text-xs font-medium text-[var(--text-secondary)] tracking-wide">
          🥩 meatshell
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center flex-1 overflow-hidden h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`no-drag group relative flex items-center gap-1.5 h-full px-3 text-xs cursor-pointer transition-colors
                ${isActive
                  ? "text-[var(--text-inverse)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--accent)]"
                  : "text-[var(--text-muted)]"
                }
                hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]`}
            >
              <span className="truncate max-w-[120px]">
                {tab.session.name || tab.session.host}
              </span>

              {/* Close button — visible on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  disconnect(tab.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--surface-active)] transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Connect button — always visible */}
        <button
          onClick={onConnect}
          onMouseDown={(e) => e.stopPropagation()}
          className="no-drag flex items-center gap-1.5 px-2.5 h-7 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-sm transition-colors ml-1 flex-shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Connect</span>
        </button>
      </div>

      {/* Window controls */}
      <div className="no-drag flex h-full flex-shrink-0">
        <button
          onClick={minimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={toggleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Maximize"
        >
          <Square size={14} />
        </button>
        <button
          onClick={close}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--color-danger)] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
