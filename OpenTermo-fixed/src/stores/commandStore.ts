import { create } from "zustand";
import {
  type CommandEntry,
  listCommands,
  saveCommand,
  deleteCommand,
} from "@/lib/tauriCommands";

const LS_EMPTY_FOLDERS = "opentermo-empty-folders";

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


interface CommandState {
  entries: CommandEntry[];
  emptyFolders: string[];
  loading: boolean;

  load: () => Promise<void>;
  upsert: (entry: CommandEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addEmptyFolder: (path: string) => void;
  removeEmptyFolder: (path: string) => void;
  renameFolder: (oldPath: string, newPath: string) => Promise<void>;


  // Import / Export
  exportAll: () => string;
  exportFolder: (folderPath: string) => string;
  importCommands: (json: string) => Promise<{ imported: number; skipped: number }>;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  entries: [],
  emptyFolders: loadEmptyFolders(),
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const entries = await listCommands();
      set({ entries, emptyFolders: loadEmptyFolders() });
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

  // ── Import / Export ──
  exportAll(): string {
    const { entries, emptyFolders } = get();
    return JSON.stringify(
      { commands: entries.map(({ id, ...rest }) => rest), emptyFolders },
      null,
      2,
    );
  },

  exportFolder(folderPath: string): string {
    const { entries, emptyFolders } = get();
    const commands = entries
      .filter((e) => e.category.trim() === folderPath || e.category.trim().startsWith(folderPath + "/"))
      .map(({ id, ...rest }) => rest);
    const folders = emptyFolders.filter((p) => isPathUnderOrEqual(folderPath, p));
    return JSON.stringify({ commands, emptyFolders: folders }, null, 2);
  },

  async importCommands(json: string): Promise<{ imported: number; skipped: number }> {
    let parsedCommands: Array<Partial<CommandEntry>>;
    let parsedFolders: string[] = [];
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        parsedCommands = parsed;
      } else if (parsed && Array.isArray(parsed.commands)) {
        parsedCommands = parsed.commands;
        if (Array.isArray(parsed.emptyFolders)) {
          parsedFolders = parsed.emptyFolders.filter(
            (p: unknown): p is string => typeof p === "string" && p.trim().length > 0,
          );
        }
      } else {
        throw new Error("Not a command export");
      }
    } catch {
      throw new Error("Invalid JSON: expected a command export (array, or { commands, emptyFolders })");
    }

    let imported = 0;
    let skipped = 0;
    const importedCats: string[] = [];

    // 导出文件不带 id（导入时重新生成），所以「同一份文件导入两次」不会被 id
    // 拦住 —— 必须在导入时按 label+command+category 去重，否则库会静默翻倍。
    const seen = new Set(
      get().entries.map((e) => `${e.label}\u0000${e.command}\u0000${e.category}`),
    );

    for (const item of parsedCommands) {
      // command 必须是非空字符串：数字/对象/空白都算无效数据，直接跳过
      if (typeof item.command !== "string" || !item.command.trim()) { skipped++; continue; }
      const label = typeof item.label === "string" && item.label.trim() ? item.label : item.command;
      const category = typeof item.category === "string" ? item.category : "";
      const key = `${label}\u0000${item.command}\u0000${category}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      const entry: CommandEntry = {
        id: crypto.randomUUID(),
        label,
        command: item.command,
        category,
        pinned: item.pinned ?? false,
        last_used: item.last_used || null,
        icon: item.icon || null,
        description: item.description || null,
        order: item.order || null,
      };
      await saveCommand(entry);
      if (entry.category.trim()) importedCats.push(entry.category.trim());
      imported++;
    }

    // Reload fresh list, then merge empty-folder markers (same invariant as upsert:
    // no marker at/above a category that now holds a command)
    const entries = await listCommands();
    let folders = [...new Set([...get().emptyFolders, ...parsedFolders])];
    for (const cat of importedCats) {
      folders = folders.filter((p) => !isPathUnderOrEqual(p, cat));
    }
    saveEmptyFolders(folders);
    set({ entries, emptyFolders: folders });
    return { imported, skipped };
  },
}));

function isPathUnderOrEqual(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent + "/");
}
