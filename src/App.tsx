import { useEffect } from "react";
import TitleBar from "@/components/layout/TitleBar";
import Sidebar from "@/components/layout/Sidebar";
import TerminalView from "@/components/layout/TerminalView";
import StatusBar from "@/components/layout/StatusBar";
import ConnectDialog from "@/components/ConnectDialog";
import HostKeyDialog from "@/components/HostKeyDialog";
import CredentialDialog from "@/components/CredentialDialog";
import CommandPalette from "@/components/CommandPalette";
import { useSessionStore } from "@/stores/sessionStore";

export default function App() {
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sessions = useSessionStore((s) => s.sessions);
  const connectDialogOpen = useSessionStore((s) => s.connectDialogOpen);
  const hostKeyPrompt = useSessionStore((s) => s.hostKeyPrompt);
  const credentialPrompt = useSessionStore((s) => s.credentialPrompt);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const connect = useSessionStore((s) => s.connect);
  const save = useSessionStore((s) => s.save);
  const remove = useSessionStore((s) => s.remove);
  const openConnect = useSessionStore((s) => s.openConnectDialog);
  const closeConnect = useSessionStore((s) => s.closeConnectDialog);
  const dismissHostKey = useSessionStore((s) => s.dismissHostKey);
  const dismissCredential = useSessionStore((s) => s.dismissCredential);
  const setupGlobal = useSessionStore((s) => s._setupGlobalListeners);

  useEffect(() => {
    loadSessions();
    setupGlobal();
  }, [loadSessions, setupGlobal]);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-base)]">
      <TitleBar onConnect={openConnect} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 bg-[var(--bg-base)] overflow-hidden relative">
            {tabs.length > 0 ? (
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="absolute inset-0"
                  style={{ display: tab.id === activeTabId ? "flex" : "none" }}
                >
                  <TerminalView tabId={tab.id} />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-2xl opacity-20">{'\u2328'}</span>
                <span className="text-sm text-[var(--text-muted)] select-none">
                  按 <kbd className="px-1.5 py-0.5 text-[11px] bg-[var(--surface-hover)] rounded font-mono">Ctrl+K</kbd> 搜索命令
                </span>
              </div>
            )}
          </main>

        </div>
      </div>

      <StatusBar />

      {connectDialogOpen && (
        <ConnectDialog
          sessions={sessions}
          onClose={closeConnect}
          onConnect={(s) => connect(s.id, s)}
          onSave={save}
          onDelete={remove}
        />
      )}

      {hostKeyPrompt && (
        <HostKeyDialog prompt={hostKeyPrompt} onClose={dismissHostKey} />
      )}

      {credentialPrompt && (
        <CredentialDialog prompt={credentialPrompt} onClose={dismissCredential} />
      )}

      <CommandPalette />
    </div>
  );
}