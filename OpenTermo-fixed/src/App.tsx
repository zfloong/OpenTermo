import { useEffect, useState, useCallback, useLayoutEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { applyTheme, applyBackgroundImage, DEFAULT_BACKGROUND, effectivePreset } from "@/lib/themeUtils";
import TitleBar from "@/components/layout/TitleBar";
import Sidebar from "@/components/layout/Sidebar";
import TerminalView from "@/components/layout/TerminalView";
import StatusBar from "@/components/layout/StatusBar";
import NotificationLayer from "@/components/layout/NotificationLayer";
import ConnectDialog from "@/components/ConnectDialog";
import EditSessionDialog from "@/components/EditSessionDialog";
import HostKeyDialog from "@/components/HostKeyDialog";
import CredentialDialog from "@/components/CredentialDialog";
import CommandPalette from "@/components/CommandPalette";
import SessionLauncher from "@/components/SessionLauncher";
import SettingsPanel from "@/components/SettingsPanel";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { useSessionStore } from "@/stores/sessionStore";
import { useUIStore } from "@/stores/uiStore";
import { getBackgroundImage } from "@/lib/tauriCommands";
import { Plus } from "lucide-react";



export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const glassAlpha = useSettingsStore((s) => s.glassAlpha);
  const blurStrength = useSettingsStore((s) => s.blurStrength);
  const borderAlpha = useSettingsStore((s) => s.borderAlpha);
  const terminalAlpha = useSettingsStore((s) => s.terminalAlpha);
  const hasWallpaper = useSettingsStore((s) => s.hasWallpaper);
  const customBase = useSettingsStore((s) => s.customBase);
  const customAccent = useSettingsStore((s) => s.customAccent);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sessions = useSessionStore((s) => s.sessions);
  const connectDialogOpen = useSessionStore((s) => s.connectDialogOpen);
  const connectDialogGroup = useSessionStore((s) => s.connectDialogGroup);
  const editingSessionId = useSessionStore((s) => s.editingSessionId);
  const hostKeyPrompts = useSessionStore((s) => s.hostKeyPrompts);
  const credentialPrompts = useSessionStore((s) => s.credentialPrompts);

  const loadSessions = useSessionStore((s) => s.loadSessions);
  const connect = useSessionStore((s) => s.connect);
  const save = useSessionStore((s) => s.save);
  const closeConnect = useSessionStore((s) => s.closeConnectDialog);
  const openLauncher = useUIStore((s) => s.openLauncher);
  const closeEdit = useSessionStore((s) => s.closeEditDialog);
  const dismissHostKey = useSessionStore((s) => s.dismissHostKey);
  const dismissCredential = useSessionStore((s) => s.dismissCredential);
  const setupGlobal = useSessionStore((s) => s._setupGlobalListeners);

  useEffect(() => {
    loadSessions();
    setupGlobal();
  }, [loadSessions, setupGlobal]);

  // Apply theme + overrides — JS is always the single source of truth.
  // Layout effect so the first paint already carries the theme tokens.
  const applyAll = useCallback(() => {
    document.documentElement.setAttribute("data-theme", effectivePreset(theme, customBase));
    applyTheme({
      theme,
      customBase,
      customAccent,
      glassAlpha,
      blurPx: blurStrength,
      borderAlpha,
      terminalAlpha,
      hasWallpaper,
    });
  }, [theme, customBase, customAccent, glassAlpha, blurStrength, borderAlpha, terminalAlpha, hasWallpaper]);

  useLayoutEffect(() => { applyAll(); }, [applyAll]);

  // A user-picked image wins; otherwise the bundled wallpaper is the default.
  useEffect(() => {
    if (!hasWallpaper) {
      applyBackgroundImage(null);
      return;
    }
    let cancelled = false;
    getBackgroundImage()
      .then((url) => { if (!cancelled) applyBackgroundImage(url || DEFAULT_BACKGROUND); })
      .catch(() => { if (!cancelled) applyBackgroundImage(DEFAULT_BACKGROUND); });
    return () => { cancelled = true; };
  }, [hasWallpaper]);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-base)]">
      <TitleBar onSettings={() => setSettingsOpen(true)} />

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
                  <TerminalView tabId={tab.id} active={tab.id === activeTabId} />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span className="text-2xl opacity-20">{String.fromCharCode(0x2328)}</span>
                <button
                  onClick={openLauncher}
                  className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-semibold text-[var(--accent)] bg-[var(--accent-dim)] border border-[var(--accent-border)] hover:bg-accent/25 transition-colors"
                >
                  <Plus size={15} />
                  新建会话
                </button>
                <span className="text-sm text-[var(--text-muted)] select-none">
                  或按 <kbd className="px-1.5 py-0.5 text-[11px] bg-[var(--surface-hover)] rounded font-mono">Ctrl+T</kbd> 打开启动台，<kbd className="px-1.5 py-0.5 text-[11px] bg-[var(--surface-hover)] rounded font-mono">Ctrl+K</kbd> 搜索命令
                </span>
              </div>
            )}
            <NotificationLayer />
        </div>
      </div>

      <StatusBar />

      {connectDialogOpen && (
        <ConnectDialog
          sessions={sessions}
          defaultGroup={connectDialogGroup}
          onClose={closeConnect}
          onConnect={(s) => connect(s.id, s)}
          onSave={save}
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

      {hostKeyPrompts.length > 0 && (
        <HostKeyDialog
          key={hostKeyPrompts[0].prompt_id}
          prompt={hostKeyPrompts[0]}
          onClose={dismissHostKey}
        />
      )}

      {credentialPrompts.length > 0 && (
        <CredentialDialog
          key={credentialPrompts[0].prompt_id}
          prompt={credentialPrompts[0]}
          onClose={dismissCredential}
        />
      )}

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CommandPalette />
      <SessionLauncher />
      <ConfirmDialogHost />
    </div>
  );
}


