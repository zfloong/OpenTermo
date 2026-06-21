import { useCallback, useEffect, useRef } from "react";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { useUIStore, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from "@/stores/uiStore";
import CommandPanel from "@/components/CommandPanel";

/**
 * Sidebar with proportional resize and collapse/expand support.
 * One-line Tauri drag region header + embedded CommandPanel.
 */
export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth || MIN_SIDEBAR_WIDTH;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setSidebarWidth(startWidth.current + delta);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setSidebarWidth]);

  return (
    <>
      {/* Expand toggle — visible when sidebar is collapsed */}
      {!isOpen && (
        <button
          onClick={toggleSidebar}
          title="Expand sidebar"
          className="absolute left-2 top-11 z-50 w-7 h-7 flex items-center justify-center
                     rounded-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                     hover:bg-[var(--surface-hover)] transition-colors"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* Sidebar body — width from store */}
      <aside
        className="sidebar-glass flex flex-col flex-shrink-0 overflow-hidden relative"
        style={{ width: sidebarWidth }}
      >
        {/* Header row */}
        <div
          className="flex items-center justify-between gap-2 px-3 h-8 flex-shrink-0 select-none"
          data-tauri-drag-region
        >
          <span className="text-xs font-semibold text-[var(--text-secondary)] tracking-wide no-drag">
            Commands
          </span>
          <button
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="no-drag w-6 h-6 flex items-center justify-center rounded-sm
                       text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                       hover:bg-[var(--surface-hover)] transition-colors"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* Command panel fills remaining height */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <CommandPanel />
        </div>

        {/* Resize handle — right edge, 4px wide */}
        <div
          onMouseDown={onDragStart}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize
                     hover:bg-[var(--accent)] transition-colors z-10"
        />
      </aside>
    </>
  );
}
