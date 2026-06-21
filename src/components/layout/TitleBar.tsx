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
      className="flex h-11 items-center bg-[var(--bg-glass)] backdrop-blur-lg border-b border-[var(--border-subtle)] select-none flex-shrink-0"
    >
      {/* Logo + app name */}
      <div className="flex items-center gap-2.5 pl-4 pr-3 flex-shrink-0">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-soft)] flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-[var(--accent)]/20">
          M
        </div>
        <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wide">
          肉壳
        </span>
      </div>

      {/* Tabs — pill style */}
      <div className="flex items-center flex-1 overflow-hidden h-full gap-1 px-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`no-drag group relative flex items-center gap-1.5 h-8 px-3 text-xs cursor-pointer rounded-md transition-all duration-150
                ${isActive
                  ? "bg-[var(--surface-selected)] text-[var(--text-primary)] font-medium shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                }`}
            >
              {/* Active indicator dot */}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0 shadow-[0_0_6px_var(--accent)]" />
              )}
              <span className="truncate max-w-[130px]">
                {tab.session.name || tab.session.host}
              </span>

              {/* Close button — visible on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  disconnect(tab.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15 transition-all"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Connect button — pill style */}
        <button
          onClick={onConnect}
          onMouseDown={(e) => e.stopPropagation()}
          className="no-drag flex items-center gap-1.5 px-3 h-8 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] rounded-md transition-all duration-150 ml-0.5 flex-shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline font-medium">连接</span>
        </button>
      </div>

      {/* Window controls */}
      <div className="no-drag flex h-full flex-shrink-0 ml-1">
        <button
          onClick={minimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-12 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={toggleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-12 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Maximize"
        >
          <Square size={13} />
        </button>
        <button
          onClick={close}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-12 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--color-danger)] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
