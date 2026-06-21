import { PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import CommandPanel from "@/components/CommandPanel";

export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <>
      {/* Floating expand handle — visible only when sidebar is collapsed */}
      {!isOpen && (
        <div className="flex-shrink-0 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]">
          <button
            onClick={toggleSidebar}
            className="btn-icon h-10 w-7 rounded-none"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      <aside
        className="flex flex-col overflow-hidden flex-shrink-0 transition-[width] duration-200 ease-out bg-[var(--bg-surface)] border-r border-[var(--border-subtle)]"
        style={{ width: isOpen ? 260 : 0 }}
      >
        <div className="w-[260px] flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Commands
            </span>
            <button onClick={toggleSidebar} className="btn-icon h-7 w-7">
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Command panel — fills the rest */}
          <div className="flex-1 overflow-hidden">
            <CommandPanel />
          </div>
        </div>
      </aside>
    </>
  );
}
