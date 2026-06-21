import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Send,
  Plus,
  FolderOpen,
  Edit3,
  Copy,
  Pin,
  PinOff,
  Trash2,
  FolderPlus,
  ClipboardPaste,
  GripVertical,
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
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

// ── Context menu position state ────────────────────────────────────────────

interface CtxState {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
}

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
  const [ctx, setCtx] = useState<CtxState | null>(null);

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
            e.command.toLowerCase().includes(lower) ||
            (e.description ?? "").toLowerCase().includes(lower),
        )
      : [...entries];

    filtered.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const la = a.last_used ?? "";
      const lb = b.last_used ?? "";
      return lb.localeCompare(la);
    });

    const groups = new Map<string, CommandEntry[]>();
    for (const e of filtered) {
      const cat = e.category.trim() || "Uncategorized";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(e);
    }

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

  const handleDuplicate = useCallback(
    async (cmd: CommandEntry) => {
      await upsert({
        ...cmd,
        id: crypto.randomUUID(),
        label: `${cmd.label} (copy)`,
        last_used: null,
      });
    },
    [upsert],
  );

  // ── Context menu builders ──────────────────────────────────────────────

  const showCtx = useCallback(
    (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
      e.preventDefault();
      e.stopPropagation();
      setCtx({ items, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const cmdCtx = useCallback(
    (cmd: CommandEntry) =>
      [
        {
          label: "Send",
          icon: <Send size={12} />,
          onClick: () => handleSend(cmd),
          disabled: !activeTabId,
        },
        {
          label: "Edit",
          icon: <Edit3 size={12} />,
          onClick: () => {
            setEditing(cmd);
            setEditingNew(false);
          },
        },
        {
          label: "Duplicate",
          icon: <Copy size={12} />,
          onClick: () => handleDuplicate(cmd),
        },
        cmd.pinned
          ? {
              label: "Unpin",
              icon: <PinOff size={12} />,
              onClick: () => handleTogglePin(cmd),
            }
          : {
              label: "Pin",
              icon: <Pin size={12} />,
              onClick: () => handleTogglePin(cmd),
            },
        null, // separator
        {
          label: "Delete",
          icon: <Trash2 size={12} />,
          onClick: () => handleDelete(cmd.id),
          danger: true,
        },
      ],
    [handleSend, handleTogglePin, handleDelete, handleDuplicate, activeTabId],
  );

  const categoryCtx = useCallback(
    (cat: string): (ContextMenuItem | null)[] => [
      {
        label: "New Command",
        icon: <Plus size={12} />,
        onClick: () => {
          setEditing({
            id: "",
            label: "",
            command: "",
            category: cat,
            pinned: false,
            last_used: null,
            icon: null,
            description: null,
          });
          setEditingNew(true);
        },
      },
      {
        label: "Rename Group",
        icon: <Edit3 size={12} />,
        onClick: () => {
          const newName = prompt("Rename group:", cat);
          if (newName && newName.trim() && newName.trim() !== cat) {
            // Rename: update all commands in this category
            entries
              .filter((e) => (e.category.trim() || "Uncategorized") === cat)
              .forEach((e) => upsert({ ...e, category: newName.trim() }));
          }
        },
      },
      null,
      {
        label: "Delete Group",
        icon: <Trash2 size={12} />,
        onClick: () => {
          if (confirm(`Delete group "${cat}" and all its commands?`)) {
            entries
              .filter((e) => (e.category.trim() || "Uncategorized") === cat)
              .forEach((e) => remove(e.id));
          }
        },
        danger: true,
      },
    ],
    [entries, upsert, remove],
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
          className="w-full h-7 pl-8 pr-2 text-[11px] bg-[var(--bg-surface)] border-2 border-transparent rounded-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-focus)] transition-[border-color,background]"
        />
      </div>

      {/* Command groups */}
      <div
        className="flex-1 overflow-y-auto px-1"
        onContextMenu={(e) =>
          showCtx(e, [
            {
              label: "New Command",
              icon: <Plus size={12} />,
              onClick: () => {
                setEditing({
                  id: "",
                  label: "",
                  command: "",
                  category: "",
                  pinned: false,
                  last_used: null,
                  icon: null,
                  description: null,
                });
                setEditingNew(true);
              },
            },
            {
              label: "New Group",
              icon: <FolderPlus size={12} />,
              onClick: () => {
                const name = prompt("Group name:");
                if (name?.trim()) {
                  upsert({
                    id: crypto.randomUUID(),
                    label: "",
                    command: "# placeholder",
                    category: name.trim(),
                    pinned: false,
                    last_used: null,
                    icon: null,
                    description: null,
                  });
                }
              },
            },
            {
              label: "Paste",
              icon: <ClipboardPaste size={12} />,
              onClick: async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text.trim()) {
                    setEditing({
                      id: "",
                      label: "",
                      command: text.trim(),
                      category: "",
                      pinned: false,
                      last_used: null,
                      icon: null,
                      description: null,
                    });
                    setEditingNew(true);
                  }
                } catch {
                  // clipboard not available
                }
              },
            },
          ])
        }
      >
        {grouped.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-[var(--text-muted)]">
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
                onContextMenu={(e) => showCtx(e, categoryCtx(cat))}
                className="flex items-center gap-1 w-full px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-sm transition-colors"
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
                    onContextMenu={(e) => showCtx(e, cmdCtx(cmd))}
                    className={`group flex items-center gap-1.5 pl-5 pr-1.5 py-1 cursor-pointer rounded-sm transition-colors
                      ${cmd.pinned ? "border-l-2 border-[var(--accent)] pl-[18px]" : ""}
                      hover:bg-[var(--surface-hover)]`}
                  >
                    {/* Icon */}
                    <span className="flex-shrink-0 text-xs leading-none w-4 text-center select-none">
                      {cmd.icon || <GripVertical size={10} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-30 transition-opacity" />}
                    </span>

                    {/* Label + description */}
                    <div
                      className="flex-1 min-w-0"
                      onDoubleClick={() => handleSend(cmd)}
                    >
                      <span className="text-[11px] text-[var(--text-primary)] leading-tight truncate block">
                        {cmd.label || cmd.command}
                      </span>
                      {cmd.description && (
                        <span className="text-[10px] text-[var(--text-muted)] leading-tight truncate block">
                          {cmd.description}
                        </span>
                      )}
                    </div>

                    {/* Send — always visible */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSend(cmd);
                      }}
                      disabled={!activeTabId}
                      className="flex-shrink-0 p-0.5 text-[var(--color-success)] hover:bg-[var(--surface-hover)] rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Send to terminal"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* New Command button */}
      <div className="px-2 py-1.5 border-t border-[var(--border-subtle)]">
        <button
          onClick={() => {
            setEditing({
              id: "",
              label: "",
              command: "",
              category: "",
              pinned: false,
              last_used: null,
              icon: null,
              description: null,
            });
            setEditingNew(true);
          }}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-sm transition-colors"
        >
          <Plus size={13} />
          <span>New Command</span>
        </button>
      </div>

      {/* Context menu portal */}
      {ctx && (
        <ContextMenu
          items={ctx.items}
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
        />
      )}

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
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (entry) {
      setLabel(entry.label);
      setCommand(entry.command);
      setCategory(entry.category);
      setIcon(entry.icon ?? "");
      setDescription(entry.description ?? "");
    }
  }, [entry?.id]);

  const isValid = (label || command).trim().length > 0;

  const handleSave = () => {
    if (!entry || !isValid) return;
    onSave({
      ...entry,
      id: entry.id || crypto.randomUUID(),
      label: label.trim(),
      command: command.trim(),
      category: category.trim(),
      icon: icon.trim() || null,
      description: description.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "New Command" : "Edit Command"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          {/* Icon */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">
              Icon (emoji)
            </label>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 2))}
              placeholder="e.g. 🐳"
              className="h-8 text-sm text-center w-14"
            />
          </div>

          {/* Label */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Friendly name"
              className="h-8 text-[12px]"
              autoFocus
            />
          </div>

          {/* Command */}
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

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--text-secondary)]">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this command do?"
              rows={2}
              className="w-full rounded-sm border-2 border-transparent bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-focus)] resize-none transition-[border-color]"
            />
          </div>

          {/* Category */}
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
              variant="primary"
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
