import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/stores/uiStore";
import FileExplorer from "./FileExplorer";
import PortForwardPanel from "./PortForwardPanel";

type BottomTab = "files" | "ports";

/**
 * Bottom panel with a draggable split bar at the top.
 * Height is controlled via `uiStore.bottomPanelHeight`.
 * Contains tabs: File Explorer | Port Forwarding.
 */
export default function ResizablePanel() {
  const height = useUIStore((s) => s.bottomPanelHeight);
  const setBottomPanelHeight = useUIStore((s) => s.setBottomPanelHeight);
  const [tab, setTab] = useState<BottomTab>("files");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [height],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setBottomPanelHeight(startHeight.current + delta);
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
  }, [setBottomPanelHeight]);

  return (
    <div
      ref={panelRef}
      className="flex flex-col flex-shrink-0"
      style={{ height }}
    >
      {/* Draggable split bar — 4px, accent on hover */}
      <div
        onMouseDown={onMouseDown}
        className="h-1 bg-transparent hover:bg-[var(--accent)] cursor-row-resize transition-colors flex-shrink-0"
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
        <button
          onClick={() => setTab("files")}
          className={`px-3 py-1 text-[11px] transition-colors border-b-2 -mb-[1px] ${
            tab === "files"
              ? "text-[var(--accent)] border-[var(--accent)]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
          }`}
        >
          File Explorer
        </button>
        <button
          onClick={() => setTab("ports")}
          className={`px-3 py-1 text-[11px] transition-colors border-b-2 -mb-[1px] ${
            tab === "ports"
              ? "text-[var(--accent)] border-[var(--accent)]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
          }`}
        >
          Port Forward
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 bg-[var(--bg-surface)] overflow-hidden">
        {tab === "files" ? <FileExplorer /> : <PortForwardPanel />}
      </div>
    </div>
  );
}
