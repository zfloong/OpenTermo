import { useEffect } from "react";
import TitleBar from "@/components/layout/TitleBar";
import Sidebar from "@/components/layout/Sidebar";
import TerminalView from "@/components/layout/TerminalView";
import ResizablePanel from "@/components/layout/ResizablePanel";
import StatusBar from "@/components/layout/StatusBar";
import { useSessionStore } from "@/stores/sessionStore";

export default function App() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const loadSessions = useSessionStore((s) => s.loadSessions);

  // Load saved sessions on startup
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--background)]">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Terminal area */}
          <main className="flex-1 bg-[var(--background)] overflow-hidden relative">
            {activeTabId ? (
              <TerminalView key={activeTabId} tabId={activeTabId} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-lg text-[var(--text-secondary)] select-none">
                  Terminal Area
                </span>
              </div>
            )}
          </main>

          <ResizablePanel />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
