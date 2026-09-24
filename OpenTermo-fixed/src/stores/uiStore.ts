import { create } from "zustand";

/**
 * Central UI state store.
 *
 * - `sidebarWidth` controls the sidebar's draggable width (0 = collapsed).
 */
interface UIState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  sidebarWidth: number;
  savedSidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  /** Session launcher overlay (opened from the title-bar `+` / Ctrl+Shift+T). */
  isLauncherOpen: boolean;
  openLauncher: () => void;
  closeLauncher: () => void;
}

export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 260;

const LS_SIDEBAR_OPEN = "opentermo-sidebar-open";
const LS_SIDEBAR_WIDTH = "opentermo-sidebar-width";

function loadBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v !== null ? v === "true" : fallback; } catch { return fallback; }
}

/** Clamped so a hand-edited (or from an older MAX) value can't break the layout. */
function loadSidebarWidth(): number {
  try {
    const v = localStorage.getItem(LS_SIDEBAR_WIDTH);
    if (v === null) return DEFAULT_SIDEBAR_WIDTH;
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_SIDEBAR_WIDTH;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(n)));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

const initialSidebarOpen = loadBool(LS_SIDEBAR_OPEN, true);
const initialSidebarWidth = loadSidebarWidth();

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: initialSidebarOpen,

  toggleSidebar: () =>
    set((s) => {
      if (s.isSidebarOpen) {
        localStorage.setItem(LS_SIDEBAR_OPEN, "false");
        return { isSidebarOpen: false, sidebarWidth: 0 };
      }
      const w = s.savedSidebarWidth || DEFAULT_SIDEBAR_WIDTH;
      localStorage.setItem(LS_SIDEBAR_OPEN, "true");
      return { isSidebarOpen: true, sidebarWidth: w };
    }),

  // `sidebarWidth` is 0 when collapsed — the Sidebar renders its width straight
  // from it — so restoring a closed sidebar has to restore the 0 as well, with
  // the remembered width kept separately for the next expand.
  sidebarWidth: initialSidebarOpen ? initialSidebarWidth : 0,
  savedSidebarWidth: initialSidebarWidth,

  setSidebarWidth: (width) =>
    set((s) => {
      if (width < 60) {
        // snap close
        localStorage.setItem(LS_SIDEBAR_OPEN, "false");
        return { sidebarWidth: 0, isSidebarOpen: false };
      }
      const clamped = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)),
      );
      localStorage.setItem(LS_SIDEBAR_WIDTH, String(clamped));
      localStorage.setItem(LS_SIDEBAR_OPEN, "true");
      return {
        sidebarWidth: clamped,
        savedSidebarWidth: clamped,
        isSidebarOpen: true,
      };
    }),

  isLauncherOpen: false,
  openLauncher: () => set({ isLauncherOpen: true }),
  closeLauncher: () => set({ isLauncherOpen: false }),

}));
