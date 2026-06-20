import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  type SessionConfig,
  listSessions,
  saveSession,
  deleteSession,
  connectSession,
  sendInput,
  resizeTerminal,
  disconnectSession,
} from "@/lib/tauriCommands";

/** Per-tab connection state. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface ActiveTab {
  id: string;
  session: SessionConfig;
  status: ConnectionStatus;
  statusText: string;
}

interface SessionState {
  /** Saved sessions (loaded from config store). */
  sessions: SessionConfig[];
  /** Currently open terminal tabs. */
  tabs: ActiveTab[];
  /** The focused tab id. */
  activeTabId: string | null;

  // Actions
  loadSessions: () => Promise<void>;
  save: (session: SessionConfig) => Promise<void>;
  remove: (id: string) => Promise<void>;
  connect: (tabId: string, session: SessionConfig) => Promise<void>;
  disconnect: (tabId: string) => Promise<void>;
  sendInput: (tabId: string, data: string) => Promise<void>;
  resize: (tabId: string, cols: number, rows: number) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateTabStatus: (tabId: string, status: ConnectionStatus, text: string) => void;
  removeTab: (tabId: string) => void;

  /** Event unlisteners to clean up on close. */
  _unlisteners: Map<string, UnlistenFn>;
  _setupListener: (tabId: string) => Promise<void>;
  _teardownListener: (tabId: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  tabs: [],
  activeTabId: null,
  _unlisteners: new Map(),

  async loadSessions() {
    const sessions = await listSessions();
    set({ sessions });
  },

  async save(session) {
    await saveSession(session);
    await get().loadSessions();
  },

  async remove(id) {
    await deleteSession(id);
    await get().loadSessions();
  },

  async connect(tabId, session) {
    const existing = get().tabs.find((t) => t.id === tabId);
    if (existing) return;

    // Add tab in "connecting" state
    set((s) => ({
      tabs: [
        ...s.tabs,
        { id: tabId, session, status: "connecting" as const, statusText: "Connecting..." },
      ],
      activeTabId: tabId,
    }));

    // Start listening for events from this tab BEFORE we call connect
    await get()._setupListener(tabId);

    try {
      await connectSession(tabId, session);
    } catch (err) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? { ...t, status: "disconnected" as const, statusText: String(err) }
            : t,
        ),
      }));
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

  updateTabStatus(tabId, status, statusText) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, status, statusText } : t,
      ),
    }));
  },

  removeTab(tabId) {
    set((s) => ({
      tabs: s.tabs.filter((t) => t.id !== tabId),
      activeTabId: s.activeTabId === tabId ? null : s.activeTabId,
    }));
  },

  async _setupListener(tabId) {
    // Already listening
    if (get()._unlisteners.has(tabId)) return;

    const unlistenOutput = await listen<string>(
      `terminal-output:${tabId}`,
      (event) => {
        // Terminal output data — forwarded to the TerminalView component
        // We dispatch a custom DOM event so the terminal component can pick it up.
        window.dispatchEvent(
          new CustomEvent(`terminal-data:${tabId}`, { detail: event.payload }),
        );
      },
    );

    const unlistenConnected = await listen<boolean>(
      `terminal-connected:${tabId}`,
      () => {
        get().updateTabStatus(tabId, "connected", "Connected");
      },
    );

    const unlistenClosed = await listen<string>(
      `terminal-closed:${tabId}`,
      (event) => {
        get().updateTabStatus(tabId, "disconnected", event.payload);
        get().removeTab(tabId);
      },
    );

    const unlistenStatus = await listen<string>(
      `terminal-status:${tabId}`,
      (event) => {
        get().updateTabStatus(tabId, "connected", event.payload);
      },
    );

    const ul = get()._unlisteners;
    ul.set(`${tabId}-output`, unlistenOutput);
    ul.set(`${tabId}-connected`, unlistenConnected);
    ul.set(`${tabId}-closed`, unlistenClosed);
    ul.set(`${tabId}-status`, unlistenStatus);
  },

  async _teardownListener(tabId) {
    const ul = get()._unlisteners;
    for (const suffix of ["output", "connected", "closed", "status"]) {
      const key = `${tabId}-${suffix}`;
      const fn = ul.get(key);
      if (fn) {
        fn();
        ul.delete(key);
      }
    }
  },
}));
