import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { useUIStore, MIN_SIDEBAR_WIDTH } from "@/stores/uiStore";
import CommandPanel from "@/components/CommandPanel";
import SessionManager from "@/components/SessionManager";

type SidebarTab = "sessions" | "commands";

/**
 * Sidebar with proportional resize and collapse/expand support.
 * One-line Tauri drag region header + tabbed panels (Sessions / Commands).
 */
export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [tab, setTab] = useState<SidebarTab>("sessions");

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
            {tab === "sessions" ? "Sessions" : "Commands"}
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

        {/* Tab bar */}
        <div className="flex items-center border-b border-[var(--border-subtle)] flex-shrink-0">
          <button
            onClick={() => setTab("sessions")}
            className={`flex-1 py-1 text-[10px] font-medium transition-colors border-b-2 -mb-[1px] ${
              tab === "sessions"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
            }`}
          >
            Sessions
          </button>
          <button
            onClick={() => setTab("commands")}
            className={`flex-1 py-1 text-[10px] font-medium transition-colors border-b-2 -mb-[1px] ${
              tab === "commands"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
            }`}
          >
            Commands
          </button>
        </div>

        {/* Panel fills remaining height */}
        <div className="flex-1 overflow-y-auto">
          {tab === "sessions" ? <SessionManager /> : (
            <div className="px-2 pb-2">
              <CommandPanel />
            </div>
          )}
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
