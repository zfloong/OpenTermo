import { create } from "zustand";
import {
  type CommandEntry,
  listCommands,
  saveCommand,
  deleteCommand,
} from "@/lib/tauriCommands";

const LS_EMPTY_FOLDERS = "meatshell-empty-folders";
const LS_USAGE_COUNTS = "meatshell-cmd-usage";

function loadEmptyFolders(): string[] {
  try {
    const raw = localStorage.getItem(LS_EMPTY_FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEmptyFolders(paths: string[]) {
  localStorage.setItem(LS_EMPTY_FOLDERS, JSON.stringify(paths));
}

function loadUsageCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_USAGE_COUNTS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUsageCounts(counts: Record<string, number>) {
  localStorage.setItem(LS_USAGE_COUNTS, JSON.stringify(counts));
}

interface CommandState {
  entries: CommandEntry[];
  emptyFolders: string[];
  usageCounts: Record<string, number>;
  loading: boolean;

  load: () => Promise<void>;
  upsert: (entry: CommandEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addEmptyFolder: (path: string) => void;
  removeEmptyFolder: (path: string) => void;
  renameFolder: (oldPath: string, newPath: string) => Promise<void>;

  // Usage tracking
  recordUsage: (id: string) => void;

  // Import / Export
  exportAll: () => string;
  exportFolder: (folderPath: string) => string;
  importCommands: (json: string) => Promise<{ imported: number; skipped: number }>;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  entries: [],
  emptyFolders: loadEmptyFolders(),
  usageCounts: loadUsageCounts(),
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const entries = await listCommands();
      set({ entries, emptyFolders: loadEmptyFolders(), usageCounts: loadUsageCounts() });
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
      const copy = idx >= 0
        ? s.entries.map((e, i) => (i === idx ? saved : e))
        : [...s.entries, saved];

      const cat = (saved.category || "").trim();
      let folders = [...s.emptyFolders];
      if (cat) {
        folders = folders.filter((p) => !isPathUnderOrEqual(p, cat));
      }

      return { entries: copy, emptyFolders: folders };
    });
    const cat = (saved.category || "").trim();
    if (cat) {
      const folders = get().emptyFolders.filter((p) => !isPathUnderOrEqual(p, cat));
      saveEmptyFolders(folders);
    }
  },

  async remove(id) {
    await deleteCommand(id);
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
    }));
  },

  addEmptyFolder(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    set((s) => {
      if (s.emptyFolders.includes(trimmed)) return s;
      const folders = [...s.emptyFolders, trimmed];
      saveEmptyFolders(folders);
      return { emptyFolders: folders };
    });
  },

  removeEmptyFolder(path: string) {
    set((s) => {
      const folders = s.emptyFolders.filter((p) => p !== path && !p.startsWith(path + "/"));
      saveEmptyFolders(folders);
      return { emptyFolders: folders };
    });
  },

  async renameFolder(oldPath: string, newPath: string) {
    const s = get();
    const toUpdate = s.entries.filter(
      (e) => {
        const cat = e.category.trim();
        return cat === oldPath || cat.startsWith(oldPath + "/");
      },
    );

    for (const e of toUpdate) {
      const newCat = newPath + e.category.trim().slice(oldPath.length);
      await saveCommand({ ...e, category: newCat });
    }

    const newEntries = s.entries.map((e) => {
      const cat = e.category.trim();
      if (cat === oldPath || cat.startsWith(oldPath + "/")) {
        return { ...e, category: newPath + cat.slice(oldPath.length) };
      }
      return e;
    });

    const newFolders = s.emptyFolders.map((p) => {
      if (p === oldPath || p.startsWith(oldPath + "/")) {
        return newPath + p.slice(oldPath.length);
      }
      return p;
    });
    saveEmptyFolders(newFolders);

    set({ entries: newEntries, emptyFolders: newFolders });
  },

  // ── Usage tracking ──
  recordUsage(id: string) {
    set((s) => {
      const counts = { ...s.usageCounts, [id]: (s.usageCounts[id] || 0) + 1 };
      saveUsageCounts(counts);
      return { usageCounts: counts };
    });
  },

  // ── Import / Export ──
  exportAll(): string {
    const entries = get().entries.map(({ id, ...rest }) => rest);
    return JSON.stringify(entries, null, 2);
  },

  exportFolder(folderPath: string): string {
    const entries = get().entries
      .filter((e) => e.category.trim() === folderPath || e.category.trim().startsWith(folderPath + "/"))
      .map(({ id, ...rest }) => rest);
    return JSON.stringify(entries, null, 2);
  },

  async importCommands(json: string): Promise<{ imported: number; skipped: number }> {
    let parsed: Array<Partial<CommandEntry>>;
    try {
      parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error("Not an array");
    } catch {
      throw new Error("Invalid JSON: expected an array of command objects");
    }

    let imported = 0;
    let skipped = 0;

    for (const item of parsed) {
      if (!item.command) { skipped++; continue; }
      const entry: CommandEntry = {
        id: crypto.randomUUID(),
        label: item.label || item.command,
        command: item.command,
        category: item.category || "",
        pinned: item.pinned ?? false,
        last_used: item.last_used || null,
        icon: item.icon || null,
        description: item.description || null,
        order: item.order || null,
      };
      await saveCommand(entry);
      imported++;
    }

    // Reload fresh list
    const entries = await listCommands();
    set({ entries, emptyFolders: loadEmptyFolders() });
    return { imported, skipped };
  },
}));

function isPathUnderOrEqual(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + "/");
}
