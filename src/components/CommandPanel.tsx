import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Send,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  FolderOpen,
} from "lucide-react";
import { useCommandStore } from "@/stores/commandStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { CommandEntry } from "@/lib/tauriCommands";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CommandPanel() {
  const entries = useCommandStore((s) => s.entries);
  const load = useCommandStore((s) => s.load);
  const upsert = useCommandStore((s) => s.upsert);
  const remove = useCommandStore((s) => s.remove);

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const sendInput = useSessionStore((s) => s.sendInput);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CommandEntry | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  // ── Group & filter ──────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const lower = search.toLowerCase();
    const filtered = lower
      ? entries.filter(
          (e) =>
            e.label.toLowerCase().includes(lower) ||
            e.command.toLowerCase().includes(lower),
        )
      : [...entries];

    // Sort: pinned first, then by last_used desc
    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const la = a.last_used ?? "";
      const lb = b.last_used ?? "";
      return lb.localeCompare(la); // newest first
    });

    const groups = new Map<string, CommandEntry[]>();
    for (const e of filtered) {
      const cat = e.category.trim() || "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(e);
    }

    // Sort groups: Uncategorized last, others alphabetically
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [entries, search]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const toggleCollapse = useCallback((cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleSend = useCallback(
    async (cmd: CommandEntry) => {
      if (!activeTabId) return;
      // Update last_used
      const updated = { ...cmd, last_used: new Date().toISOString() };
      await upsert(updated);
      await sendInput(activeTabId, cmd.command + "\n");
    },
    [activeTabId, upsert, sendInput],
  );

  const handleTogglePin = useCallback(
    (cmd: CommandEntry) => {
      upsert({ ...cmd, pinned: !cmd.pinned });
    },
    [upsert],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
    },
    [remove],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative px-2 pb-1">
        <Search
          size={13}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter commands..."
          className="w-full h-7 pl-8 pr-2 text-[11px] bg-[var(--background)] border border-[var(--border)] rounded text-[var(--text)] placeholder:text-[var(--text-secondary)]/50 outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Command groups */}
      <div className="flex-1 overflow-y-auto px-1">
        {grouped.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-[var(--text-secondary)]">
            {search ? "No matches" : "No saved commands"}
          </div>
        )}

        {grouped.map(([cat, cmds]) => {
          const isCollapsed = collapsed.has(cat);
          return (
            <div key={cat} className="mb-0.5">
              {/* Category header */}
              <button
                onClick={() => toggleCollapse(cat)}
                className="flex items-center gap-1 w-full px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight size={11} />
                ) : (
                  <ChevronDown size={11} />
                )}
                <FolderOpen size={11} />
                <span className="flex-1 text-left truncate">{cat}</span>
                <span className="text-[10px] tabular-nums opacity-60">
                  {cmds.length}
                </span>
              </button>

              {/* Command items */}
              {!isCollapsed &&
                cmds.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="group flex items-center gap-0.5 pl-5 pr-1 py-0.5 hover:bg-[var(--hover)] rounded-sm transition-colors"
                  >
                    {/* Pin */}
                    <button
                      onClick={() => handleTogglePin(cmd)}
                      className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:text-[var(--warning)] transition-opacity"
                      title={cmd.pinned ? "Unpin" : "Pin to top"}
                    >
                      {cmd.pinned ? (
                        <PinOff size={10} className="text-[var(--warning)]" />
                      ) : (
                        <Pin size={10} className="text-[var(--text-secondary)]" />
                      )}
                    </button>

                    {/* Label + preview */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-[var(--text)] leading-tight truncate">
                          {cmd.label || cmd.command}
                        </span>
                        {cmd.label && cmd.command !== cmd.label && (
                          <span className="text-[10px] text-[var(--text-secondary)]/60 truncate leading-tight hidden group-hover:inline">
                            {cmd.command.length > 40
                              ? cmd.command.slice(0, 40) + "…"
                              : cmd.command}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Send — always visible */}
                    <button
                      onClick={() => handleSend(cmd)}
                      disabled={!activeTabId}
                      className="flex-shrink-0 p-0.5 text-[var(--secondary)] hover:text-[var(--secondary)] hover:bg-[var(--hover)] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Send to terminal"
                    >
                      <Send size={12} />
                    </button>

                    {/* Edit — visible on hover */}
                    <button
                      onClick={() => {
                        setEditing(cmd);
                        setEditingNew(false);
                      }}
                      className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-opacity"
                      title="Edit"
                    >
                      <Pencil size={10} />
                    </button>

                    {/* Delete — visible on hover */}
                    <button
                      onClick={() => handleDelete(cmd.id)}
                      className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--error)] transition-opacity"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* New Command button */}
      <div className="px-2 py-1.5 border-t border-[var(--border)]">
        <button
          onClick={() => {
            setEditing({
              id: "",
              label: "",
              command: "",
              category: "",
              pinned: false,
              last_used: null,
            });
            setEditingNew(true);
          }}
          className="flex items-center justify-center gap-1 w-full py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded transition-colors"
        >
          <Plus size={12} />
          <span>New Command</span>
        </button>
      </div>

      {/* Edit Dialog */}
      <CommandEditDialog
        entry={editing}
        isNew={editingNew}
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setEditingNew(false);
        }}
        onSave={(e) => {
          upsert(e);
          setEditing(null);
          setEditingNew(false);
        }}
        existingCategories={Object.keys(
          Object.fromEntries(
            entries.map((e) => [e.category.trim() || "Uncategorized", true]),
          ),
        ).filter((c) => c !== "Uncategorized")}
      />
    </div>
  );
}

// ── Edit dialog ────────────────────────────────────────────────────────────

function CommandEditDialog({
  entry,
  isNew,
  open,
  onClose,
  onSave,
  existingCategories,
}: {
  entry: CommandEntry | null;
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onSave: (e: CommandEntry) => void;
  existingCategories: string[];
}) {
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [category, setCategory] = useState("");

  // Sync form fields when entry changes
  const [lastId, setLastId] = useState<string | null>(null);
  if (entry && entry.id !== lastId) {
    setLastId(entry.id);
    setLabel(entry.label);
    setCommand(entry.command);
    setCategory(entry.category);
  }

  const isValid = (label || command).trim().length > 0;

  const handleSave = () => {
    if (!entry || !isValid) return;
    onSave({
      ...entry,
      id: entry.id || crypto.randomUUID(),
      label: label.trim(),
      command: command.trim(),
      category: category.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm text-[var(--text)]">
            {isNew ? "New Command" : "Edit Command"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Friendly name (optional)"
              className="h-8 text-[12px]"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">
              Command
            </label>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="e.g. docker compose up -d"
              className="h-8 text-[12px] font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">
              Category
              {existingCategories.length > 0 && (
                <span className="ml-1 opacity-60">
                  (existing: {existingCategories.join(", ")})
                </span>
              )}
            </label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Group name (optional)"
              className="h-8 text-[12px]"
              list="cmd-categories"
            />
            <datalist id="cmd-categories">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-[11px] h-7">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isValid}
              className="text-[11px] h-7"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
