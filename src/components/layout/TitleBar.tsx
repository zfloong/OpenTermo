import { useCallback, useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Cable, HardDrive, HardDriveUpload, Settings } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { rclone_mount, rclone_unmount, rclone_list } from "@/lib/tauriCommands";

interface TitleBarProps {
  onConnect: () => void;
  onSettings: () => void;
}

export default function TitleBar({ onConnect, onSettings }: TitleBarProps) {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const disconnect = useSessionStore((s) => s.disconnect);
  const setError = useSessionStore((s) => s.setError);
  const clearError = useSessionStore((s) => s.clearError);
  // tabId -> drive letter (e.g. "M:")
  const [mounts, setMounts] = useState<Record<string, string>>({});

  // Poll mounts from backend
  useEffect(() => {
    const poll = async () => {
      try {
        const list = await rclone_list();
        const map: Record<string, string> = {};
        for (const m of list) map[m.tabId] = m.drive;
        setMounts(map);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isSSH = activeTab?.session?.kind === "ssh" && activeTab?.status === "connected";

  const minimize = useCallback(() => getCurrentWindow().minimize(), []);
  const toggleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), []);
  const close = useCallback(() => getCurrentWindow().close(), []);

  const currentDrive = activeTabId ? mounts[activeTabId] : null;

  const handleMount = useCallback(async () => {
    if (!activeTabId) return;
    clearError();
    try {
      await rclone_mount(activeTabId);
    } catch (e: any) {
      setError("[SSHFS 挂载] " + (e?.toString?.() || String(e)));
    }
  }, [activeTabId, clearError, setError]);

  const handleUnmount = useCallback(async () => {
    if (!activeTabId) return;
    clearError();
    try {
      await rclone_unmount(activeTabId);
    } catch (e: any) {
      setError("[SSHFS 卸载] " + (e?.toString?.() || String(e)));
    }
  }, [activeTabId, clearError, setError]);

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 items-center bg-[var(--bg-glass)] backdrop-blur-[var(--glass-blur,18px)] border-b border-[var(--border-subtle)] select-none flex-shrink-0"
    >
      {/* Logo + app name */}
      <div className="flex items-center gap-2.5 pl-4 pr-3 flex-shrink-0">
        <svg viewBox="0 0 64 64" className="w-7 h-7 rounded-lg flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1a1a1a"/>
              <stop offset="100%" stopColor="#0a0a0a"/>
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="url(#logo-bg)"/>
          <text x="8" y="45" fontFamily="Arial Black, system-ui, sans-serif" fontSize="36" fontWeight="900" fill="#fff">&gt;_</text>
          <rect x="47" y="17" width="4" height="24" rx="2" fill="#4ade80">
            <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/>
          </rect>
        </svg>
        <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wide">
          OpenTermo
        </span>
      </div>

      {/* Tabs — pill style */}
      <div className="flex items-center flex-1 overflow-hidden h-full gap-1.5 px-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`no-drag group relative flex items-center gap-1.5 h-8 px-3 text-xs cursor-pointer rounded-md transition-all duration-200 ${
                tab.status === "connecting"
                  ? "bg-[var(--color-warning)]/8 border border-[var(--color-warning)]/30 text-[var(--color-warning)]"
                  : isActive
                    ? "bg-[var(--surface-selected)] border border-[var(--color-success)] text-[var(--color-success)] font-semibold shadow-[0_0_6px_var(--color-success)]/20"
                    : "border border-[var(--accent-border)]/40 bg-[var(--accent-dim)]/40 text-[var(--accent)]"
              }`}
            >
              {/* Status dot */}
              {tab.status === "connecting" ? (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] flex-shrink-0 shadow-[0_0_6px_var(--color-warning)] animate-pulse" />
              ) : isActive ? (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] flex-shrink-0 shadow-[0_0_6px_var(--color-success)]" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0 shadow-[0_0_4px_var(--accent)]" />
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
                className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full transition-all hover:!opacity-100 hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15 ${
                  isActive
                    ? "opacity-40 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-50"
                }`}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Connect button — green pill style */}
        <button
          onClick={onConnect}
          onMouseDown={(e) => e.stopPropagation()}
          className="no-drag flex items-center gap-1.5 px-3 h-8 text-sm text-[var(--text-muted)] bg-[var(--color-success)]/8 hover:text-[var(--color-success)] hover:bg-[var(--color-success)]/18 rounded-md transition-all duration-150 active:scale-95 ml-0.5 flex-shrink-0"
        >
          <Cable size={17} />
          <span className="hidden sm:inline font-semibold">连接</span>
        </button>
      </div>

      {/* SSHFS mount button — per session */}
      {isSSH && (
        <div className="no-drag flex items-center flex-shrink-0 ml-2">
          {currentDrive ? (
            <button
              onClick={handleUnmount}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-2.5 h-8 text-xs text-[var(--color-success)] hover:bg-[var(--color-success)]/10 rounded-md transition-all"
            >
              <HardDriveUpload size={14} />
              <span className="hidden sm:inline">卸载 {currentDrive}</span>
              <span className="sm:hidden">{currentDrive}</span>
            </button>
          ) : (
            <button
              onClick={handleMount}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-2.5 h-8 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] rounded-md transition-all"
            >
              <HardDrive size={14} />
              <span className="hidden sm:inline">挂载</span>
            </button>
          )}
        </div>
      )}

      {/* Settings */}
      <button
        onClick={onSettings}
        onMouseDown={(e) => e.stopPropagation()}
        className="no-drag flex items-center justify-center w-9 h-8 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors flex-shrink-0 ml-1"
        aria-label="Settings"
      >
        <Settings size={15} />
      </button>

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
