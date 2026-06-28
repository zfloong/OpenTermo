import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { useUIStore, MIN_SIDEBAR_WIDTH } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import { invoke } from "@tauri-apps/api/core";

export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [userInfo, setUserInfo] = useState({ username: "...", computer: "..." });
  const [scriptsOpen, setScriptsOpen] = useState(true);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragging.current = true; startX.current = e.clientX;
    startWidth.current = sidebarWidth || MIN_SIDEBAR_WIDTH;
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const mm = (e: MouseEvent) => { if (!dragging.current) return; setSidebarWidth(startWidth.current + e.clientX - startX.current); };
    const mu = () => { if (!dragging.current) return; dragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
    return () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); };
  }, [setSidebarWidth]);

  useEffect(() => {
    invoke<{ username: string; computer: string }>("get_local_user_info").then(setUserInfo).catch(() => {});
  }, []);

  return (<>
    {!isOpen && (
      <button onClick={toggleSidebar} title="展开侧栏" className="absolute left-3 top-12 z-50 w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 backdrop-blur-sm transition-all">
        <PanelLeftOpen size={16} />
      </button>
    )}

    <aside
      className="flex flex-col flex-shrink-0 overflow-hidden relative"
      style={{
        width: sidebarWidth,
        background: "rgba(28, 27, 27, 0.90)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderRight: "1px solid rgba(68, 71, 78, 0.20)",
      }}
    >
      <div className="flex items-center gap-2 px-2 h-10 flex-shrink-0 cursor-pointer group" data-tauri-drag-region>
        <div className="rounded bg-surface-variant border border-outline-variant/30 flex items-center justify-center overflow-hidden relative w-5 h-5">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "14px" }}>shield_person</span>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-primary leading-tight text-[10px]">Root Node</span>
          <span className="text-[9px] font-terminal-mono text-on-surface-variant leading-tight">{userInfo.username}@{userInfo.computer}</span>
        </div>
      </div>

      {/* 终端列表 - 当前打开的会话 */}
      <div className="px-2 border-t border-outline-variant/10 mt-1 pt-2 flex-1 overflow-y-auto">
        <TerminalList />
      </div>

      {/* 脚本命令 - 可折叠 */}
      <div className="px-2 border-t border-outline-variant/10 mt-1 pt-2">
        <div className="px-3 mb-2 flex items-center justify-between group cursor-pointer" onClick={() => setScriptsOpen(!scriptsOpen)}>
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[16px] text-outline transition-transform group-hover:text-on-surface ${scriptsOpen ? "" : "-rotate-90"}`}>expand_more</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-outline">脚本命令</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-outline hover:text-secondary cursor-pointer" onClick={(e) => { e.stopPropagation(); }}>search</span>
            <span className="material-symbols-outlined text-[16px] text-outline hover:text-secondary cursor-pointer" onClick={(e) => { e.stopPropagation(); }}>add</span>
          </div>
        </div>

        {scriptsOpen && (
          <>
            <div className="px-3 mb-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[14px]">search</span>
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 text-terminal-mono font-terminal-mono text-on-surface rounded py-1 pl-7 pr-2 text-[11px] focus:outline-none focus:border-primary/50 placeholder:text-outline/30"
                  placeholder="搜索脚本..."
                  type="text"
                />
              </div>
            </div>

            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 px-3 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all group border-l-2 border-transparent py-1">
                <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-secondary">system_update</span>
                <span className="text-label-sm font-label-sm">Update System</span>
              </button>
              <button className="w-full flex items-center gap-3 px-3 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all group border-l-2 border-transparent py-1">
                <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-secondary">backup</span>
                <span className="text-label-sm font-label-sm">Backup Database</span>
              </button>
              <button className="w-full flex items-center gap-3 px-3 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all group border-l-2 border-transparent py-1">
                <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-secondary">description</span>
                <span className="text-label-sm font-label-sm">Check Logs</span>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="px-2 mt-auto border-t border-outline-variant/10 pt-4 space-y-1">
        <a className="flex items-center gap-3 px-3 py-2 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all border-l-4 border-transparent active:translate-x-1 duration-200 cursor-pointer" href="#">
          <span className="material-symbols-outlined text-[20px]">monitoring</span>
          <span className="text-label-sm font-label-sm">运行健康</span>
        </a>
        <a className="flex items-center gap-3 px-3 py-2 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all border-l-4 border-transparent active:translate-x-1 duration-200 cursor-pointer" href="#">
          <span className="material-symbols-outlined text-[20px]">list_alt</span>
          <span className="text-label-sm font-label-sm">日志</span>
        </a>
      </div>

      <div
        onMouseDown={onDragStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
      />
    </aside>
  </>);
}

/** 终端列表子组件 - 显示当前打开的会话标签 */
function TerminalList() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const disconnect = useSessionStore((s) => s.disconnect);

  if (tabs.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="text-[10px] text-outline/50">暂无打开的终端</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const statusColor =
          tab.status === "connected" ? "text-secondary" :
          tab.status === "connecting" ? "text-warning" :
          "text-on-surface-variant";
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all group ${
              isActive
                ? "bg-surface-variant/40 text-on-surface border-l-2 border-secondary"
                : "text-on-surface-variant hover:bg-surface-variant/20 hover:text-on-surface border-l-2 border-transparent"
            }`}
          >
            <span className={`material-symbols-outlined text-[14px] ${statusColor}`}>
              {tab.status === "connected" ? "terminal" : tab.status === "connecting" ? "hourglass_top" : "close"}
            </span>
            <span className="text-[12px] truncate flex-1">{tab.session.name || tab.session.host}</span>
            <button
              onClick={(e) => { e.stopPropagation(); disconnect(tab.id); }}
              className="opacity-0 group-hover:opacity-100 text-outline hover:text-error transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
