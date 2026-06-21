import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import FileExplorer from "./FileExplorer";
import PortForwardPanel from "./PortForwardPanel";

type BottomTab = "files" | "ports";

/**
 * Bottom panel with a draggable split bar at the top.
 * Height is controlled via `uiStore.bottomPanelHeight`.
 * Contains tabs: 文件浏览 | 端口转发.
 */
export default function ResizablePanel() {
  const height = useUIStore((s) => s.bottomPanelHeight);
  const setBottomPanelHeight = useUIStore((s) => s.setBottomPanelHeight);
  const [tab, setTab] = useState<BottomTab>("files");
  const tabs = useSessionStore((s) => s.tabs);
  const hasConnected = tabs.some((t) => t.status === "connected");

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
      const newHeight = startHeight.current + delta;
      const maxHeight = window.innerHeight - 200; // leave 200px for terminal
      setBottomPanelHeight(Math.min(newHeight, maxHeight));
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
      className="flex flex-col min-h-0 overflow-hidden"
    >
      {/* Draggable split bar 鈥?4px, accent on hover */}
      <div
        onMouseDown={onMouseDown}
        className="h-1.5 bg-[var(--border-strong)] hover:bg-[var(--accent)]/50 cursor-row-resize transition-colors flex-shrink-0 rounded-t"
      />

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-shrink-0">
        <button
          onClick={() => setTab("files")}
          className={`px-4 py-2 text-sm font-semibold tracking-wide transition-colors border-b-2 -mb-[1px] ${
            tab === "files"
              ? "text-[var(--accent)] border-[var(--accent)]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
          }`}
        >
          文件浏览
        </button>
        <button
          onClick={() => setTab("ports")}
          className={`px-4 py-2 text-sm font-semibold tracking-wide transition-colors border-b-2 -mb-[1px] ${
            tab === "ports"
              ? "text-[var(--accent)] border-[var(--accent)]"
              : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]"
          }`}
        >
          端口转发
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 bg-[var(--bg-surface)] overflow-hidden">
        {!hasConnected ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-[var(--text-muted)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="opacity-25">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>连接会话后浏览文件</span>
          </div>
        ) : tab === "files" ? <FileExplorer /> : <PortForwardPanel />}
      </div>
    </div>
  );
}

