import { useCallback, useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Cable } from "lucide-react";
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
  const [mounts, setMounts] = useState<Record<string, string>>({});

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
    try { await rclone_mount(activeTabId); } catch (e: any) {
      setError("[SSHFS 挂载] " + (e?.toString?.() || String(e)));
    }
  }, [activeTabId, clearError, setError]);

  const handleUnmount = useCallback(async () => {
    if (!activeTabId) return;
    clearError();
    try { await rclone_unmount(activeTabId); } catch (e: any) {
      setError("[SSHFS 卸载] " + (e?.toString?.() || String(e)));
    }
  }, [activeTabId, clearError, setError]);

  return (
    <header
      data-tauri-drag-region
      className="flex h-header_height items-center header-glass pl-[9px] pr-container_padding select-none flex-shrink-0 w-full z-50 gap-1"
    >
      {/* Logo + app name */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-5 h-5 rounded bg-surface-variant border border-outline-variant/30 flex items-center justify-center overflow-hidden">
          <span className="material-symbols-outlined text-secondary" style={{ fontSize: "13px", fontVariationSettings: "'FILL' 1" }}>terminal</span>
        </div>
        <span className="text-[14px] font-bold text-secondary tracking-tight">
          OpenTermo
        </span>
      </div>

      {/* Nav spacer */}
      <div className="w-6" />

      <nav className="hidden md:flex h-full items-center gap-0">
        <a className="h-full flex items-center px-2.5 text-[11px] text-secondary border-b-2 border-secondary hover:bg-surface-variant/30 transition-colors tracking-wide" href="#">会话</a>
        <a className="h-full flex items-center px-2.5 text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors tracking-wide" href="#">集群</a>
        <a className="h-full flex items-center px-2.5 text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors tracking-wide" href="#">保险箱</a>
        <a className="h-full flex items-center px-2.5 text-[11px] text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors tracking-wide" href="#">脚本</a>
      </nav>

      <div className="flex items-center gap-4 ml-auto">
        <div className="relative hidden sm:block w-48 focus-glow rounded transition-all duration-200">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[14px]">search</span>
          <input
            className="w-full bg-[#0d0d0d] border border-outline-variant/30 text-terminal-mono font-terminal-mono text-on-surface rounded py-0.5 pl-7 pr-2.5 text-[11px] focus:outline-none focus:border-primary placeholder:text-outline/50"
            placeholder="搜索会话 (Ctrl+K)"
            type="text"
          />
        </div>

        <div className="flex items-center gap-1">
          {tabs.length === 0 && (
            <button
              onClick={onConnect}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-3 h-6 rounded bg-secondary/10 border border-secondary/20 text-secondary hover:bg-secondary/20 hover:shadow-[0_0_15px_rgba(77,224,130,0.3)] transition-all duration-200 font-terminal-mono text-terminal-mono text-[11px]"
            >
              <span className="material-symbols-outlined text-[16px]">cable</span>
              <span>连接</span>
            </button>
          )}

          {isSSH && (
            <button
              onClick={currentDrive ? handleUnmount : handleMount}
              onMouseDown={(e) => e.stopPropagation()}
              className={`flex items-center gap-1 px-2 h-6 rounded text-terminal-mono text-terminal-mono text-[11px] transition-colors ${
                currentDrive
                  ? "text-secondary hover:bg-secondary/10"
                  : "text-on-surface-variant hover:text-primary hover:bg-primary/10"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">storage</span>
              <span>{currentDrive ? `卸载 ${currentDrive}` : "挂载"}</span>
            </button>
          )}

          <button
            onClick={onSettings}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors"
            aria-label="设置"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>settings</span>
          </button>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors"
            aria-label="帮助"
          >
            <span className="material-symbols-outlined text-[20px]">help</span>
          </button>
        </div>
      </div>

      <div className="no-drag flex h-full flex-shrink-0 ml-1">
        <button
          onClick={minimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-10 items-center justify-center text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface transition-colors"
          aria-label="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={toggleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-10 items-center justify-center text-on-surface-variant hover:bg-surface-variant/50 hover:text-on-surface transition-colors"
          aria-label="最大化"
        >
          <Square size={11} />
        </button>
        <button
          onClick={close}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-10 items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-error transition-colors"
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
