import { useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { applyOverride } from "@/lib/themeUtils";
import TitleBar from "@/components/layout/TitleBar";
import Sidebar from "@/components/layout/Sidebar";
import TerminalView from "@/components/layout/TerminalView";
import StatusBar from "@/components/layout/StatusBar";
import ConnectDialog from "@/components/ConnectDialog";
import EditSessionDialog from "@/components/EditSessionDialog";
import HostKeyDialog from "@/components/HostKeyDialog";
import CredentialDialog from "@/components/CredentialDialog";
import CommandPalette from "@/components/CommandPalette";
import SettingsPanel from "@/components/SettingsPanel";
import { useSessionStore } from "@/stores/sessionStore";



export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const overrides = useSettingsStore((s) => s.overrides);
  const getEffectiveOverride = useSettingsStore((s) => s.getEffectiveOverride);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sessions = useSessionStore((s) => s.sessions);
  const connectDialogOpen = useSessionStore((s) => s.connectDialogOpen);
  const editingSessionId = useSessionStore((s) => s.editingSessionId);
  const hostKeyPrompt = useSessionStore((s) => s.hostKeyPrompt);
  const credentialPrompt = useSessionStore((s) => s.credentialPrompt);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const connect = useSessionStore((s) => s.connect);
  const save = useSessionStore((s) => s.save);
  const remove = useSessionStore((s) => s.remove);
  const openConnect = useSessionStore((s) => s.openConnectDialog);
  const closeConnect = useSessionStore((s) => s.closeConnectDialog);
  const closeEdit = useSessionStore((s) => s.closeEditDialog);
  const dismissHostKey = useSessionStore((s) => s.dismissHostKey);
  const dismissCredential = useSessionStore((s) => s.dismissCredential);
  const setupGlobal = useSessionStore((s) => s._setupGlobalListeners);

  useEffect(() => {
    loadSessions();
    setupGlobal();
  }, [loadSessions, setupGlobal]);

  // Apply theme + overrides — JS is always the single source of truth
  const applyAll = useCallback(() => {
    document.documentElement.setAttribute("data-theme", theme);
    applyOverride(theme, getEffectiveOverride(theme));
  }, [theme, getEffectiveOverride]);

  useEffect(() => { applyAll(); }, [applyAll]);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-base)]">
      <TitleBar onConnect={openConnect} onSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div id="terminal-area" className="flex-1 overflow-hidden relative">
            {tabs.length > 0 ? (
              tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="absolute inset-0"
                  style={{ display: tab.id === activeTabId ? "block" : "none" }}
                >
                  <TerminalView tabId={tab.id} />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-2xl opacity-20">{String.fromCharCode(0x2328)}</span>
                <span className="text-sm text-[var(--text-muted)] select-none">
                  按 <kbd className="px-1.5 py-0.5 text-[11px] bg-[var(--surface-hover)] rounded font-mono">Ctrl+K</kbd> 搜索命令
                </span>
              </div>
            )}
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

      {editingSessionId && (() => {
        const session = sessions.find((s) => s.id === editingSessionId);
        return session ? (
          <EditSessionDialog
            session={session}
            onClose={closeEdit}
          />
        ) : null;
      })()}

      {hostKeyPrompt && (
        <HostKeyDialog prompt={hostKeyPrompt} onClose={dismissHostKey} />
      )}

      {credentialPrompt && (
        <CredentialDialog prompt={credentialPrompt} onClose={dismissCredential} />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette />
    </div>
  );
}


