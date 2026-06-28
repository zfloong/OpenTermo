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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
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

  const applyAll = useCallback(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const saved = overrides[theme];
    if (saved) {
      applyOverride(theme, saved);
    } else {
      const KEYS = [
        "--accent","--accent-soft","--accent-dim","--accent-border","--color-info",
        "--bg-glass","--glass-blur",
        "--border-subtle","--border-default","--border-strong",
        "--scrollbar-thumb","--scrollbar-thumb-hover",
      ];
      for (const k of KEYS) document.documentElement.style.removeProperty(k);
    }
  }, [theme, overrides]);

  useEffect(() => { applyAll(); }, [applyAll]);

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <TitleBar onConnect={openConnect} onSettings={() => setSettingsOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div id="terminal-area" className="flex-1 overflow-hidden relative bg-[#090909]">
          {/* Tab bar */}
          {tabs.length > 0 && (
            <div className="flex items-center bg-surface-container-low border-b border-outline-variant/20 h-10 px-2 overflow-x-auto">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-t cursor-pointer min-w-[150px] transition-colors ${
                      isActive
                        ? "bg-[#090909] border border-outline-variant/20 border-b-0 text-secondary"
                        : "text-on-surface-variant hover:bg-surface-variant/30"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">terminal</span>
                    <span className="font-terminal-mono text-terminal-mono text-sm truncate">
                      {tab.session.name || tab.session.host}
                    </span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        useSessionStore.getState().disconnect(tab.id);
                      }}
                      className="material-symbols-outlined text-[16px] ml-auto text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                    >
                      close
                    </span>
                  </div>
                );
              })}
              <button
                onClick={openConnect}
                className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors ml-1"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
              </button>
            </div>
          )}

          {/* Terminal content */}
          {tabs.length > 0 ? (
            tabs.map((tab) => (
              <div
                key={tab.id}
                className="absolute inset-0"
                style={{
                  display: tab.id === activeTabId ? "block" : "none",
                  top: 40,
                }}
              >
                <TerminalView tabId={tab.id} />
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20">keyboard</span>
              <span className="text-sm text-on-surface-variant select-none">
                按 <kbd className="px-1.5 py-0.5 text-[11px] bg-surface-variant rounded font-terminal-mono">Ctrl+K</kbd> 搜索命令
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
          <EditSessionDialog session={session} onClose={closeEdit} />
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
