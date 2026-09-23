import { useCallback, useEffect, useRef } from "react";
import { useUIStore, MIN_SIDEBAR_WIDTH } from "@/stores/uiStore";
import CommandPanel from "@/components/CommandPanel";

export default function Sidebar() {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
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

  return (
    <aside className="sidebar-glass flex flex-col flex-shrink-0 overflow-hidden relative" style={{ width: sidebarWidth }}>
      {/* 只有一条极简标题栏，窗口拖拽区仍然连得上 */}
      <div
        className="flex items-center px-3 h-8 flex-shrink-0 select-none border-b border-[var(--border-strong)]"
        data-tauri-drag-region
      >
        <span className="text-xs font-semibold text-[var(--text-muted)] tracking-wide">命令</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-2 py-1.5">
        <CommandPanel />
      </div>

      <div onMouseDown={onDragStart} className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[rgb(var(--accent-rgb)/0.40)] transition-colors z-10" />
    </aside>
  );
}
