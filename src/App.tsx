import { useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { applyOverride } from "@/lib/themeUtils";
import TitleBar from "@/components/layout/TitleBar";
import Sidebar from "@/components/layout/Sidebar";
import TerminalView from "@/components/layout/TerminalView";
import ClusterPanel from "@/components/ClusterPanel";
import StatusBar from "@/components/layout/StatusBar";
import ConnectDialog from "@/components/ConnectDialog";
import EditSessionDialog from "@/components/EditSessionDialog";
import HostKeyDialog from "@/components/HostKeyDialog";
import CredentialDialog from "@/components/CredentialDialog";
import CommandPalette from "@/components/CommandPalette";
import SettingsPanel from "@/components/SettingsPanel";
import { useSessionStore } from "@/stores/sessionStore";

function ErrorToast() {
  const lastError = useSessionStore((s) => s.lastError);
  const clearError = useSessionStore((s) => s.clearError);
  if (!lastError) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4" style={{ width: "auto", maxWidth: "90vw" }}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-error/10 border border-error/20 backdrop-blur-xl shadow-lg whitespace-nowrap">
        <span className="material-symbols-outlined text-[18px] text-error flex-shrink-0">error_outline</span>
        <span className="text-xs text-error font-medium">{lastError}</span>
        <button onClick={clearError} className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-error/50 hover:text-error hover:bg-error/10 transition-all">
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const overrides = useSettingsStore((s) => s.overrides);
  const scheduleEnabled = useSettingsStore((s) => s.scheduleEnabled);
  const scheduleDarkStart = useSettingsStore((s) => s.scheduleDarkStart);
  const scheduleDarkEnd = useSettingsStore((s) => s.scheduleDarkEnd);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<"terminal" | "cluster">("terminal");

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
    setupGlobal().catch((e) => console.error("setupGlobal failed:", e));
  }, [loadSessions, setupGlobal]);

  const applyAll = useCallback(() => {
    const effective = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "deep-blue" : "light")
      : theme;
    document.documentElement.setAttribute("data-theme", effective);
    const saved = overrides[effective];
    if (saved) {
      applyOverride(effective, saved);
    } else {
      clearOverrideStyles();
    }
  }, [theme, overrides]);

  const clearOverrideStyles = useCallback(() => {
    const KEYS = [
      "--accent","--accent-soft","--accent-dim","--accent-border","--color-info",
      "--bg-glass","--glass-blur",
      "--border-subtle","--border-default","--border-strong",
      "--scrollbar-thumb","--scrollbar-thumb-hover",
    ];
    for (const k of KEYS) document.documentElement.style.removeProperty(k);
  }, []);

  useEffect(() => { applyAll(); }, [applyAll]);

  // Listen for system color scheme changes (for "system" theme)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const t = useSettingsStore.getState().theme;
      if (t === "system") applyAll();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyAll]);

  // Scheduled theme switch (精确 setTimeout，零轮询)
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const applyThemeWithOverrides = (effective: "deep-blue" | "light") => {
      document.documentElement.setAttribute("data-theme", effective);
      const saved = useSettingsStore.getState().overrides[effective];
      if (saved) {
        applyOverride(effective, saved);
      } else {
        clearOverrideStyles();
      }
    };

    const scheduleNext = () => {
      const s = useSettingsStore.getState();
      if (!s.scheduleEnabled) return;

      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      const start = parseTime(s.scheduleDarkStart);
      const end = parseTime(s.scheduleDarkEnd);

      // 判断当前时段
      const isDark = start <= end
        ? (cur >= start && cur < end)
        : (cur >= start || cur < end);
      const effective = isDark ? "deep-blue" : "light";

      // 如果跟当前 data-theme 不同则切换
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme !== effective) {
        applyThemeWithOverrides(effective);
      }

      // 计算下一次切换的分钟数（从午夜算起）
      // 非跨越 midnight：事件顺序为 start(→深色), end(→浅色)
      // 跨越 midnight：事件顺序为 end(→浅色), start(→深色)
      let nextMin: number;
      if (start <= end) {
        if (cur < start) nextMin = start;           // → 深色
        else if (cur < end) nextMin = end;           // → 浅色
        else nextMin = start + 24 * 60;              // → 深色（次日）
      } else {
        if (cur < end) nextMin = end;                // → 浅色
        else if (cur < start) nextMin = start;       // → 深色
        else nextMin = end + 24 * 60;                // → 浅色（次日）
      }

      // 转换为 Date
      const nextDate = new Date(now);
      nextDate.setHours(Math.floor(nextMin / 60) % 24);
      nextDate.setMinutes(nextMin % 60);
      nextDate.setSeconds(0);
      nextDate.setMilliseconds(0);
      if (nextDate.getTime() <= now.getTime()) {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      timerId = setTimeout(scheduleNext, nextDate.getTime() - now.getTime());
    };

    if (useSettingsStore.getState().scheduleEnabled) {
      scheduleNext();
    }

    return () => {
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [scheduleEnabled, scheduleDarkStart, scheduleDarkEnd]);

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <ErrorToast />
      <TitleBar onConnect={openConnect} onSettings={() => setSettingsOpen(true)} view={view} onViewChange={setView} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {view === "cluster" ? (
          <div className="flex-1 overflow-hidden relative bg-[#090909]">
            <ClusterPanel onViewChange={setView} />
          </div>
        ) : (
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
        )}
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

/** Parse "HH:MM" to minutes since midnight */
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
