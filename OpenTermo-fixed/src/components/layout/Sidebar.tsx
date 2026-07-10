import { useCallback, useEffect, useRef, useState } from "react";
import { List, ChevronRight } from "lucide-react";
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

    <aside className="sidebar-glass flex flex-col flex-shrink-0 overflow-hidden relative" style={{ width: sidebarWidth }}>
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0 select-none border-b border-[var(--border-strong)]" data-tauri-drag-region>
        <button onClick={() => setTab("sessions")} className={"flex-1 py-2 flex items-center justify-center gap-1.5 text-sm font-semibold rounded-md transition-all no-drag " + (tab === "sessions" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]")}><List size={14} />会话</button>
        <button onClick={() => setTab("commands")} className={"flex-1 py-2 flex items-center justify-center gap-1.5 text-sm font-semibold rounded-md transition-all no-drag " + (tab === "commands" ? "bg-[var(--surface-selected)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]")}><ChevronRight size={14} />命令</button>

      </div>
      <div className="flex-1 overflow-y-auto">{tab === "sessions" ? <SessionManager /> : <div className="h-full flex flex-col px-2"><CommandPanel /></div>}</div>
      <div onMouseDown={onDragStart} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[rgb(var(--accent-rgb)/0.40)] transition-colors z-10" />
    </aside>
  </>);
}
