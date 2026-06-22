import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type SessionConfig,
  type HostKeyPromptPayload,
  type CredentialPromptPayload,
  listSessions,
  saveSession,
  deleteSession,
  reorderSessions,
  connectSession,
  sendInput,
  resizeTerminal,
  disconnectSession,
} from "@/lib/tauriCommands";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

/** Remote resource stats pushed by the SSH session. */
interface RemoteStats {
  cpu_percent: number;
  mem_used_kib: number;
  mem_total_kib: number;
}

export interface ActiveTab {
  id: string;
  session: SessionConfig;
  status: ConnectionStatus;
  statusText: string;
  /** Remote monitoring data (SSH sessions only). */
  remoteStats: RemoteStats | null;
}


interface SessionState {
  /** Saved sessions (loaded from config store). */
  sessions: SessionConfig[];
  /** Currently open terminal tabs. */
  tabs: ActiveTab[];
  /** The focused tab id. */
  activeTabId: string | null;
  /** Whether the connect dialog is open. */
  connectDialogOpen: boolean;
  /** Pending host-key confirmation prompt. */
  hostKeyPrompt: HostKeyPromptPayload | null;
  /** Pending credential prompt. */
  credentialPrompt: CredentialPromptPayload | null;
  /** Last connection error message (auto-clears). */
  lastError: string | null;
  /** File explorer stats for status bar. */

  // Actions
  loadSessions: () => Promise<void>;
  /** Set a persistent error message (for mount errors etc). Call clearError to dismiss. */
  setError: (msg: string) => void;
  /** Copy the current error to clipboard. */
  copyError: () => void;
  save: (session: SessionConfig) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => void;
  connect: (tabId: string, session: SessionConfig) => Promise<void>;
  disconnect: (tabId: string) => Promise<void>;
  sendInput: (tabId: string, data: string) => Promise<void>;
  resize: (tabId: string, cols: number, rows: number) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  clearError: () => void;

  // Dialog controls
  openConnectDialog: () => void;
  closeConnectDialog: () => void;
  dismissHostKey: () => void;
  dismissCredential: () => void;

  // Internal event listener registry
  _unlisteners: Map<string, UnlistenFn>;
  _setupListener: (tabId: string) => Promise<void>;
  _teardownListener: (tabId: string) => Promise<void>;
  _setupGlobalListeners: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  tabs: [],
  activeTabId: null,
  connectDialogOpen: false,
  hostKeyPrompt: null,
  credentialPrompt: null,
  lastError: null,
  _unlisteners: new Map(),

  // ── Session CRUD ───────────────────────────────────────────────────────

  setError(msg: string) {
    set({ lastError: msg });
  },

  copyError() {
    const err = get().lastError;
    if (err) {
      navigator.clipboard.writeText(err).catch(console.error);
    }
  },

  async loadSessions() {
    const sessions = await listSessions();
    set({ sessions });
  },

  async save(session) {
    const saved = await saveSession(session);
    await get().loadSessions();
    return saved;
  },

  async remove(id) {
    await deleteSession(id);
    await get().loadSessions();
  },

  reorder(ids) {
    // Optimistic UI update
    set((s) => {
      const map = new Map(s.sessions.map((e) => [e.id, e]));
      const reordered = ids
        .map((id) => map.get(id))
        .filter((e): e is SessionConfig => !!e);
      const idSet = new Set(ids);
      for (const e of s.sessions) {
        if (!idSet.has(e.id)) reordered.push(e);
      }
      return { sessions: reordered };
    });
    reorderSessions(ids).catch(console.error);
  },

  async connect(tabId, session) {
    // Ensure the tab exists
    set((s) => {
      const exists = s.tabs.find((t) => t.id === tabId);
      if (exists) return s;
      return {
        tabs: [
          ...s.tabs,
          { id: tabId, session, status: "connecting", statusText: "连接中...", remoteStats: null },
        ],
        activeTabId: tabId,
      };
    });
    await get()._setupListener(tabId);
    try {
      await connectSession(tabId, session);
    } catch (err) {
      const msg = String(err);
      set({ lastError: msg });
      // Remove the tab that failed to start
      set((s) => ({
        tabs: s.tabs.filter((t) => t.id !== tabId),
        activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
      }));
      await get()._teardownListener(tabId);
      setTimeout(() => set({ lastError: null }), 6000);
    }
  },

  async disconnect(tabId) {
    await disconnectSession(tabId);
    await get()._teardownListener(tabId);
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id !== tabId),
      activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
    }));
  },

  async sendInput(tabId, data) {
    await sendInput(tabId, data);
  },

  async resize(tabId, cols, rows) {
    await resizeTerminal(tabId, cols, rows);
  },

  setActiveTab(tabId) {
    set({ activeTabId: tabId });
  },

  clearError() {
    set({ lastError: null });
  },

  // ── Dialog controls ────────────────────────────────────────────────────

  openConnectDialog: () => set({ connectDialogOpen: true }),
  closeConnectDialog: () => set({ connectDialogOpen: false }),
  dismissHostKey: () => set({ hostKeyPrompt: null }),
  dismissCredential: () => set({ credentialPrompt: null }),

  // ── Event listeners ───────────────────────────────────────────────────

  async _setupListener(tabId) {
    if (get()._unlisteners.has(tabId)) return;

    const unlistenOutput = await listen<string>(
      `terminal-output:${tabId}`,
      (event) => {
        window.dispatchEvent(
          new CustomEvent(`terminal-data:${tabId}`, { detail: event.payload }),
        );
      },
    );

    const unlistenConnected = await listen<boolean>(
      `terminal-connected:${tabId}`,
      () => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, status: "connected", statusText: "已连接" } : t,
          ),
        }));
      },
    );

    const unlistenClosed = await listen<string>(
      `terminal-closed:${tabId}`,
      (event) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        // If tab was still connecting, show error
        if (tab && tab.status === "connecting") {
          set({ lastError: `连接失败: ${event.payload}` });
          setTimeout(() => set({ lastError: null }), 6000);
        }
        set((s) => ({
          tabs: s.tabs.filter((t) => t.id !== tabId),
          activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
        }));
      },
    );

    const unlistenStatus = await listen<string>(
      `terminal-status:${tabId}`,
      (event) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, status: "connected", statusText: event.payload } : t,
          ),
        }));
      },
    );

    // ── Remote resource stats (SSH) ────────────────────────────────────
    const unlistenRemoteStats = await listen<RemoteStats>(
      `remote-stats:${tabId}`,
      (event) => {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === tabId ? { ...t, remoteStats: event.payload } : t,
          ),
        }));
      },
    );

    const ul = get()._unlisteners;
    ul.set(`${tabId}-output`, unlistenOutput);
    ul.set(`${tabId}-connected`, unlistenConnected);
    ul.set(`${tabId}-closed`, unlistenClosed);
    ul.set(`${tabId}-status`, unlistenStatus);
    ul.set(`${tabId}-remotestats`, unlistenRemoteStats);
  },

  async _teardownListener(tabId) {
    const ul = get()._unlisteners;
    for (const suffix of ["output", "connected", "closed", "status", "remotestats"]) {
      const key = `${tabId}-${suffix}`;
      const fn = ul.get(key);
      if (fn) {
        fn();
        ul.delete(key);
      }
    }
  },

  async _setupGlobalListeners() {
    // Only need to set up once
    const ul = get()._unlisteners;
    if (ul.has("global-host-key")) return;

    const unlistenHostKey = await listen<HostKeyPromptPayload>(
      "host-key-prompt",
      (event) => set({ hostKeyPrompt: event.payload }),
    );

    const unlistenCredential = await listen<CredentialPromptPayload>(
      "credential-prompt",
      (event) => set({ credentialPrompt: event.payload }),
    );

    ul.set("global-host-key", unlistenHostKey);
    ul.set("global-credential", unlistenCredential);
  },
}));
