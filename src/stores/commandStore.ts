import { create } from "zustand";
import {
  type CommandEntry,
  listCommands,
  saveCommand,
  deleteCommand,
} from "@/lib/tauriCommands";

interface CommandState {
  entries: CommandEntry[];
  loading: boolean;

  load: () => Promise<void>;
  upsert: (entry: CommandEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  entries: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const entries = await listCommands();
      set({ entries });
    } catch {
      // Backend not ready; keep previous state
    } finally {
      set({ loading: false });
    }
  },

  async upsert(entry) {
    const saved = await saveCommand(entry);
    set((s) => {
      const idx = s.entries.findIndex((e) => e.id === saved.id);
      if (idx >= 0) {
        const copy = [...s.entries];
        copy[idx] = saved;
        return { entries: copy };
      }
      return { entries: [...s.entries, saved] };
    });
  },

  async remove(id) {
    await deleteCommand(id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
}));
