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

}

export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 260;

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,

  toggleSidebar: () =>
    set((s) => {
      if (s.isSidebarOpen) {
        return { isSidebarOpen: false, sidebarWidth: 0 };
      }
      const w = s.savedSidebarWidth || DEFAULT_SIDEBAR_WIDTH;
      return { isSidebarOpen: true, sidebarWidth: w };
    }),

  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  savedSidebarWidth: DEFAULT_SIDEBAR_WIDTH,

  setSidebarWidth: (width) =>
    set((s) => {
      if (width < 60) {
        // snap close
        return { sidebarWidth: 0, isSidebarOpen: false };
      }
      const clamped = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)),
      );
      return {
        sidebarWidth: clamped,
        savedSidebarWidth: clamped,
        isSidebarOpen: true,
      };
    }),

}));
