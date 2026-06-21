import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { useUIStore, MIN_SIDEBAR_WIDTH } from "@/stores/uiStore";
import CommandPanel from "@/components/CommandPanel";
import SessionManager from "@/components/SessionManager";

type SidebarTab = "sessions" | "commands";

export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [tab, setTab] = useState<SidebarTab>("sessions");
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

  return (<>
    {!isOpen && (<button onClick={toggleSidebar} title="展开侧栏" className="absolute left-3 top-12 z-50 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] backdrop-blur-sm transition-all"><PanelLeftOpen size={16} /></button>)}
    <aside className="sidebar-glass flex flex-col flex-shrink-0 overflow-hidden relative" style={{ width: sidebarWidth }}>
      <div className="flex items-center justify-between gap-2 px-4 h-10 flex-shrink-0 select-none border-b border-[var(--border-strong)]" data-tauri-drag-region>
        <span className="text-base font-bold text-[var(--text-heading)] tracking-wide no-drag">{tab === "sessions" ? "会话" : "命令"}</span>
        <button onClick={toggleSidebar} title="收起侧栏" className="no-drag w-7 h-8 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all"><PanelLeftClose size={14} /></button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border-strong)] flex-shrink-0">
        <button onClick={() => setTab("sessions")} className={"flex-1 py-2 text-base font-semibold rounded-md transition-all " + (tab === "sessions" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]")}>会话</button>
        <button onClick={() => setTab("commands")} className={"flex-1 py-2 text-base font-semibold rounded-md transition-all " + (tab === "commands" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]")}>命令</button>
      </div>
      <div className="flex-1 overflow-y-auto">{tab === "sessions" ? <SessionManager /> : <div className="h-full flex flex-col px-2"><CommandPanel /></div>}</div>
      <div onMouseDown={onDragStart} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--accent)]/40 transition-colors z-10" />
    </aside>
  </>);
}
