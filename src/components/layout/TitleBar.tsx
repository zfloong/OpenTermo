import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Plus } from "lucide-react";
import { useWindowDrag } from "@/hooks/useWindowDrag";

interface TitleBarProps {
  onConnect: () => void;
}

export default function TitleBar({ onConnect }: TitleBarProps) {
  const startDrag = useWindowDrag();

  const minimize = useCallback(() => getCurrentWindow().minimize(), []);
  const toggleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), []);
  const close = useCallback(() => getCurrentWindow().close(), []);

  return (
    <header
      data-tauri-drag-region
      onMouseDown={startDrag}
      className="flex h-10 items-center justify-between bg-[var(--surface-bright)] select-none flex-shrink-0"
    >
      <div className="flex items-center gap-2 px-3">
        <span className="text-sm font-medium text-[var(--text)] tracking-wide">
          Meatshell
        </span>
        <button
          onClick={onConnect}
          onMouseDown={(e) => e.stopPropagation()}
          className="no-drag flex items-center gap-1 px-2 py-0.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded transition-colors"
        >
          <Plus size={12} />
          Connect
        </button>
      </div>

      <div className="no-drag flex h-full">
        <button
          onClick={minimize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={toggleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
          aria-label="Maximize"
        >
          <Square size={14} />
        </button>
        <button
          onClick={close}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex h-full w-11 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--error)] hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
