import { create } from "zustand";
import {
  type CommandEntry,
  listCommands,
  saveCommand,
  deleteCommand,
  reorderCommands,
} from "@/lib/tauriCommands";

interface CommandState {
  entries: CommandEntry[];
  loading: boolean;

  load: () => Promise<void>;
  upsert: (entry: CommandEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => void;
}

export const useCommandStore = create<CommandState>((set) => ({
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

  reorder(ids) {
    // Optimistic UI update: set order fields so grouped() uses manual sort
    set((s) => {
      const map = new Map(s.entries.map((e) => [e.id, { ...e }]));
      const reordered = ids
        .map((id, xi) => {
          const e = map.get(id);
          if (e) e.order = xi; // order → preserve manual sort
          return e;
        })
        .filter((e): e is CommandEntry => !!e);
      // Append any not in the ids list (clear their order)
      const idSet = new Set(ids);
      for (const e of s.entries) {
        if (!idSet.has(e.id)) {
          const copy = { ...e };
          copy.order = null;
          reordered.push(copy);
        }
      }
      return { entries: reordered };
    });
    reorderCommands(ids).catch(console.error);
  },
}));
