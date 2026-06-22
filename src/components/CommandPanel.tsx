import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Send,
  Plus,
  FolderOpen,
  FolderClosed,
  Edit3,
  Copy,
  Pin,
  PinOff,
  Star,
  Trash2,
  FolderPlus,
  ClipboardPaste,
  ArrowDownAZ,
  Clock,
  ArrowRightLeft,
  Download,
  Upload,
  CheckSquare,
  Square,
} from "lucide-react";
import { useCommandStore } from "@/stores/commandStore";
import { useSessionStore } from "@/stores/sessionStore";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { CommandEntry } from "@/lib/tauriCommands";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveCommandTemplate } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

type SortMode = "name" | "recent";

interface CtxState {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
}

// ── Tree types ──────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  depth: number;
  commands: CommandEntry[];
  children: TreeNode[];
  isEmpty: boolean;
}

export default function CommandPanel() {
  const entries = useCommandStore((s) => s.entries);
  const emptyFolders = useCommandStore((s) => s.emptyFolders);
  const usageCounts = useCommandStore((s) => s.usageCounts);
  const load = useCommandStore((s) => s.load);
  const upsert = useCommandStore((s) => s.upsert);
  const remove = useCommandStore((s) => s.remove);
  const addEmptyFolder = useCommandStore((s) => s.addEmptyFolder);
  const removeEmptyFolder = useCommandStore((s) => s.removeEmptyFolder);
  const renameFolder = useCommandStore((s) => s.renameFolder);
  const recordUsage = useCommandStore((s) => s.recordUsage);
  const exportAll = useCommandStore((s) => s.exportAll);
  const exportFolder = useCommandStore((s) => s.exportFolder);
  const importCommands = useCommandStore((s) => s.importCommands);

  const [sortMode, setSortMode] = useState<SortMode>(() =>
    localStorage.getItem("cmd-sort") === "recent" ? "recent" : "name",
  );

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sendInput = useSessionStore((s) => s.sendInput);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CommandEntry | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedInit, setExpandedInit] = useState(false);
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ ids: string[] } | null>(null);
  const [newFolderPrompt, setNewFolderPrompt] = useState<{ parentPath: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Click-delay discrimination: single-click = send, double-click = send+execute
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCmdRef = useRef<CommandEntry | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  // ── All known folder paths ─────────────────────────────────────────────

  const allFolderPaths = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      const cat = e.category.trim();
      if (cat) {
        const parts = cat.split("/");
        for (let i = 0; i < parts.length; i++) {
          set.add(parts.slice(0, i + 1).join("/"));
        }
      }
    }
    for (const p of emptyFolders) {
      set.add(p);
      const parts = p.split("/");
      for (let i = 0; i < parts.length; i++) {
        set.add(parts.slice(0, i + 1).join("/"));
      }
    }
    return [...set].sort();
  }, [entries, emptyFolders]);

  // ── Sort commands within a group ──────────────────────────────────────

  // ═══ Import handler ══════════════════════════════════════════════════════════

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const result = await importCommands(text);
        setImportMsg("已导入 " + result.imported + " 条命令" + (result.skipped > 0 ? "（" + result.skipped + " 条跳过）" : ""));
        setTimeout(() => setImportMsg(null), 3000);
      } catch (e: any) {
        setImportMsg(e.message || "导入失败");
        setTimeout(() => setImportMsg(null), 4000);
      }
    },
    [importCommands],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverFolder(null);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".json")) {
        handleImport(file);
      }
    },
    [handleImport],
  );

  // ═══ Batch execute ═══════════════════════════════════════════════════════════

  const batchExecute = useCallback(() => {
    if (!activeTabId || selectedIds.size === 0) return;
    const selected = entries.filter((e) => selectedIds.has(e.id));
    const commands = selected.map((e) => resolveCommandTemplate(e.command, activeTab?.session ?? null)).join("\n");
    sendInput(activeTabId, commands);
    selected.forEach((e) => recordUsage(e.id));
    setSelectedIds(new Set());
  }, [activeTabId, activeTab, selectedIds, entries, sendInput, recordUsage]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const visible = entries.filter((e) => {
      const lower = search.toLowerCase();
      if (!lower) return true;
      return (e.label || "").toLowerCase().includes(lower) || e.command.toLowerCase().includes(lower) || (e.category || "").toLowerCase().includes(lower);
    });
    if (visible.every((e) => selectedIds.has(e.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((e) => e.id)));
    }
  }, [entries, search, selectedIds]);

  // ═══ Sort commands within a group ════════════════════════════════════════════

  const sortCommands = useCallback(
    (cmds: CommandEntry[]) => {
      const copy = [...cmds];
      copy.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sortMode === "recent") {
          const ta = a.last_used ? new Date(a.last_used).getTime() : 0;
          const tb = b.last_used ? new Date(b.last_used).getTime() : 0;
          return tb - ta;
        }
        return (a.label || a.command).localeCompare(b.label || b.command);
      });
      return copy;
    },
    [sortMode],
  );

  // ── Build tree ────────────────────────────────────────────────────────

  const tree = useMemo(() => {
    const lower = search.toLowerCase();

    // Group commands by category path
    const cmdByPath = new Map<string, CommandEntry[]>();
    for (const e of entries) {
      if (lower) {
        const match =
          e.label.toLowerCase().includes(lower) ||
          e.command.toLowerCase().includes(lower) ||
          (e.description ?? "").toLowerCase().includes(lower);
        if (!match) continue;
      }
      const cat = e.category.trim() || "未分类";
      if (!cmdByPath.has(cat)) cmdByPath.set(cat, []);
      cmdByPath.get(cat)!.push(e);
    }

    // Collect folder paths from commands + empty folders
    const folderPaths = new Set<string>();
    for (const cat of cmdByPath.keys()) {
      if (cat === "未分类") continue;
      const parts = cat.split("/");
      for (let i = 0; i < parts.length; i++) {
        folderPaths.add(parts.slice(0, i + 1).join("/"));
      }
    }
    for (const p of emptyFolders) {
      if (!lower) folderPaths.add(p);
    }

    // Top-level entries: ??? + root folders
    const rootNodes: TreeNode[] = [];

    // ???
    const uncategorized = cmdByPath.get("未分类");
    if (uncategorized && uncategorized.length > 0) {
      rootNodes.push({
        name: "未分类",
        path: "未分类",
        depth: 0,
        commands: sortCommands(uncategorized),
        children: [],
        isEmpty: false,
      });
    }

    // Build tree from folder paths (depth 0–2)
    const buildChildren = (parent: string, depth: number): TreeNode[] => {
      const prefix = parent ? parent + "/" : "";
      const children: TreeNode[] = [];
      const seen = new Set<string>();

      for (const fullPath of folderPaths) {
        if (!fullPath.startsWith(prefix)) continue;
        const rest = fullPath.slice(prefix.length);
        const slashIdx = rest.indexOf("/");
        const childName = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
        if (seen.has(childName)) continue;
        seen.add(childName);

        const childPath = prefix + childName;
        const cmds = cmdByPath.get(childPath) || [];
        const isExplicitEmpty = emptyFolders.includes(childPath);
        const isEmpty = cmds.length === 0 && isExplicitEmpty;

        if (cmds.length === 0 && !isExplicitEmpty && !lower) continue;
        // In search mode, show folders that have matching commands (even if indirect)
        if (lower && cmds.length === 0 && !isExplicitEmpty) {
          // Check if any descendant has matching commands
          let hasMatchingDescendant = false;
          for (const [cat, ccmds] of cmdByPath) {
            if (cat.startsWith(childPath + "/") && ccmds.length > 0) {
              hasMatchingDescendant = true;
              break;
            }
          }
          if (!hasMatchingDescendant) continue;
        }

        const subChildren = depth < 2 ? buildChildren(childPath, depth + 1) : [];
        children.push({
          name: childName,
          path: childPath,
          depth,
          commands: isEmpty ? [] : sortCommands(cmds),
          children: subChildren,
          isEmpty,
        });
      }

      children.sort((a, b) => {
        if (a.isEmpty !== b.isEmpty) return a.isEmpty ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
      return children;
    };

    // In search mode, only show ??? if it has matches
    if (!lower || uncategorized?.length) {
      const roots = buildChildren("", 0);
      rootNodes.push(...roots);
    }

    return rootNodes;
  }, [entries, emptyFolders, search, sortCommands]);

  // Auto-expand all cards on first load
  useEffect(() => {
    if (!expandedInit && tree.length > 0) {
      setExpandedCards(new Set(tree.map((n) => n.path)));
      setExpandedInit(true);
    }
  }, [tree, expandedInit]);

  // ── Actions ───────────────────────────────────────────────────────────


  const handleSend = useCallback(
    async (cmd: CommandEntry) => {
      if (!activeTabId) return;
      const resolved = resolveCommandTemplate(cmd.command, activeTab?.session ?? null);
      const updated = { ...cmd, last_used: new Date().toISOString() };
      await upsert(updated);
      await sendInput(activeTabId, resolved);
      recordUsage(cmd.id);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
      }, 50);
    },
    [activeTabId, activeTab, upsert, sendInput, recordUsage],
  );

  const handleExecute = useCallback(
    async (cmd: CommandEntry) => {
      if (!activeTabId) return;
      const resolved = resolveCommandTemplate(cmd.command, activeTab?.session ?? null);
      const updated = { ...cmd, last_used: new Date().toISOString() };
      await upsert(updated);
      // Send command + Enter to execute immediately
      await sendInput(activeTabId, resolved + "\r");
      recordUsage(cmd.id);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
      }, 50);
    },
    [activeTabId, activeTab, upsert, sendInput, recordUsage],
  );

  const handleCmdClick = useCallback(
    (cmd: CommandEntry) => {
      if (clickTimerRef.current) {
        // Second click within 300ms -> double-click: execute immediately
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        pendingCmdRef.current = null;
        handleExecute(cmd);
      } else {
        // First click -> wait 300ms for possible second click
        pendingCmdRef.current = cmd;
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          const pending = pendingCmdRef.current;
          pendingCmdRef.current = null;
          if (pending) handleSend(pending);
        }, 300);
      }
    },
    [activeTabId, activeTab, handleSend, handleExecute],
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

  const openNewCommandDialog = useCallback(
    (category: string, command: string = "") => {
      setEditing({
        id: "",
        label: "",
        command,
        category,
        pinned: false,
        last_used: null,
        icon: null,
        description: null,
      });
      setEditingNew(true);
    },
    [],
  );

  const handleMoveTo = useCallback(
    async (ids: string[], targetCategory: string) => {
      for (const id of ids) {
        const entry = entries.find((e) => e.id === id);
        if (entry) {
          await upsert({ ...entry, category: targetCategory });
        }
      }
      setMoveTarget(null);
    },
    [entries, upsert],
  );

  // ── Context menu builders ─────────────────────────────────────────────

  const showCtx = useCallback(
    (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
      e.preventDefault();
      e.stopPropagation();
      setCtx({ items, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const cmdCtx = useCallback(
    (cmd: CommandEntry): (ContextMenuItem | null)[] => [
      {
        label: "发送",
        icon: <Send size={12} />,
        onClick: () => handleSend(cmd),
        disabled: !activeTabId,
      },
      {
        label: "编辑",
        icon: <Edit3 size={12} />,
        onClick: () => {
          setEditing(cmd);
          setEditingNew(false);
        },
      },
      {
        label: "复制命令",
        icon: <Copy size={12} />,
        onClick: () => handleDuplicate(cmd),
      },
      {
        label: "移动到文件夹",
        icon: <ArrowRightLeft size={12} />,
        onClick: () => setMoveTarget({ ids: [cmd.id] }),
      },
      cmd.pinned
        ? {
            label: "取消置顶",
            icon: <PinOff size={12} />,
            onClick: () => handleTogglePin(cmd),
          }
        : {
            label: "置顶",
            icon: <Pin size={12} />,
            onClick: () => handleTogglePin(cmd),
          },
      null,
      {
        label: "删除",
        icon: <Trash2 size={12} />,
        onClick: () => handleDelete(cmd.id),
        danger: true,
      },
    ],
    [handleSend, handleTogglePin, handleDelete, handleDuplicate, activeTabId],
  );

  const folderCtx = useCallback(
    (node: TreeNode): (ContextMenuItem | null)[] => {
      const items: (ContextMenuItem | null)[] = [
        {
          label: "新建命令",
          icon: <Plus size={12} />,
          onClick: () => openNewCommandDialog(node.path),
        },
      ];

      if (node.depth < 2) {
        items.push({
          label: "新建子文件夹",
          icon: <FolderPlus size={12} />,
          onClick: () => setNewFolderPrompt({ parentPath: node.path }),
        });
      }

      items.push(
        {
          label: "重命名",
          icon: <Edit3 size={12} />,
          onClick: () => {
            const newName = prompt("Rename folder:", node.name);
            if (newName?.trim() && newName.trim() !== node.name) {
              const parts = node.path.split("/");
              parts[parts.length - 1] = newName.trim();
              renameFolder(node.path, parts.join("/"));
            }
          },
        },
        null,
        {
          label: "导出文件夹",
          icon: <Download size={12} />,
          onClick: () => {
            const json = exportFolder(node.path);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = node.path.replace(/\//g, "-") + ".json"; a.click();
            URL.revokeObjectURL(url);
          },
        },
        null,
        {
          label: "删除文件夹",
          icon: <Trash2 size={12} />,
          onClick: () => {
            const msg = node.isEmpty
              ? `删除文件夹 "${node.path}"?`
              : `删除文件夹 "${node.path}" 及其所有命令？`;
            if (confirm(msg)) {
              const collectIds = (n: TreeNode): string[] => [
                ...n.commands.map((c) => c.id),
                ...n.children.flatMap(collectIds),
              ];
              collectIds(node).forEach((id) => remove(id));
              removeEmptyFolder(node.path);
            }
          },
          danger: true,
        },
      );

      return items;
    },
    [openNewCommandDialog, renameFolder, remove, removeEmptyFolder],
  );

  const emptyCtx = useCallback(
    (): (ContextMenuItem | null)[] => [
      {
        label: "新建命令",
        icon: <Plus size={12} />,
        onClick: () => openNewCommandDialog(""),
      },
      {
        label: "新建文件夹",
        icon: <FolderPlus size={12} />,
        onClick: () => setNewFolderPrompt({ parentPath: "" }),
      },
      {
        label: "??",
        icon: <ClipboardPaste size={12} />,
        onClick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text.trim()) openNewCommandDialog("", text.trim());
          } catch {
            // clipboard not available
          }
        },
      },
      null,
      {
        label: sortMode === "name" ? "Sort: Name ?" : "??: ??",
        icon: <ArrowDownAZ size={12} />,
        onClick: () => {
          localStorage.setItem("cmd-sort", "name");
          setSortMode("name");
        },
      },
      {
        label: sortMode === "recent" ? "Sort: Last Used ?" : "??: ????",
        icon: <Clock size={12} />,
        onClick: () => {
          localStorage.setItem("cmd-sort", "recent");
          setSortMode("recent");
        },
      },
    ],
    [sortMode, openNewCommandDialog],
  );

  // ── Collect folder paths for move-to dropdown ─────────────────────────

  const folderPathsForMove = useMemo(() => {
    const paths: string[] = [""]; // ???
    for (const p of allFolderPaths) {
      if (p !== "未分类") paths.push(p);
    }
    return paths;
  }, [allFolderPaths]);

  // ── Render helpers ────────────────────────────────────────────────────

      const renderCmd = useCallback(
    (cmd: CommandEntry, leftPad: number) => (
      <div key={cmd.id}
        onClick={() => handleCmdClick(cmd)}
        onContextMenu={(e) => showCtx(e, cmdCtx(cmd))}
        className={`group flex items-center gap-2 pr-3 py-1.5 hover:bg-[var(--surface-hover)]/50 transition-colors cursor-pointer ${
          cmd.pinned ? "bg-[var(--color-warning)]/[0.04]" : ""
        }`}
        style={{ paddingLeft: leftPad }}
      >
        {/* Checkbox */}
        <button
          onClick={(e2) => { e2.stopPropagation(); toggleSelect(cmd.id); }}
          className={`shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-[3px] border transition-all ${
            selectedIds.has(cmd.id)
              ? "bg-[var(--accent)] border-[var(--accent)] text-white"
              : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
          }`}
        >
          {selectedIds.has(cmd.id) && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          )}
        </button>

        {/* Icon */}
        {cmd.icon && (
          <span className="shrink-0 w-4 text-center text-xs leading-none">{cmd.icon}</span>
        )}

        {/* Label */}
        <span className="flex-1 text-[12px] text-[var(--text-primary)] truncate">{cmd.label || cmd.command}</span>

        {/* Pinned star */}
        {cmd.pinned && <Star size={10} className="text-[var(--color-warning)] shrink-0" />}

        {/* Usage count */}
        {usageCounts[cmd.id] > 0 && (
          <span className="text-[10px] text-[var(--text-muted)]/40 tabular-nums shrink-0">{usageCounts[cmd.id]}x</span>
        )}
      </div>
    ),
    [activeTabId, selectedIds, usageCounts, handleSend, toggleSelect, showCtx, cmdCtx]
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" onContextMenu={(e) => { e.preventDefault(); showCtx(e, emptyCtx()); }}>
      {/* Search */}
      <div className="relative px-2 pb-1">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="筛选命令..."
          className="w-full h-8 pl-8 pr-2 text-sm bg-[var(--bg-surface)] border-2 border-transparent rounded-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-focus)] transition-[border-color,background]"
        />
      </div>

      {/* Toolbar: batch select + import/export */}
      <div className="flex items-center gap-1 px-2 pb-1">
        {selectedIds.size > 0 ? (
          <>
            <button
              onClick={batchExecute}
              disabled={!activeTabId}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors disabled:opacity-40"
            >
              <Send size={14} />
              执行 {selectedIds.size} 条
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 text-sm rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
                            取消
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              title="全选可见"
            >
              <CheckSquare size={15} />
            </button>
            <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
            <button
              onClick={async () => {
                const filePath = await save({
                  filters: [{ name: "JSON", extensions: ["json"] }],
                  defaultPath: "meatshell-commands.json",
                });
                if (filePath) {
                  await invoke("write_text_file", { path: filePath, content: exportAll() });
                }
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              title="导出全部命令"
            >
              <Download size={15} />
            </button>
            <label
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              title="从 JSON 导入命令"
            >
              <Upload size={15} />
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
              />
            </label>
          </>
        )}
      </div>

      {importMsg && (
        <div className='text-xs px-2 py-1.5 rounded mx-2 mb-1 text-[var(--color-success)] bg-[var(--color-success)]/10'>
          {importMsg}
        </div>
      )}

      {/* Command cards */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1.5 space-y-1.5">
        {tree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-[var(--text-muted)]">
            {search ? "无匹配命令" : "暂无保存的命令"}
          </div>
        ) : (
          tree.map((node) => {
            const isExpanded = expandedCards.has(node.path);
            return (
              <div key={node.path} className="mb-2">
                <button
                  onClick={() => setExpandedCards((prev) => { const n = new Set(prev); if (n.has(node.path)) n.delete(node.path); else n.add(node.path); return n; })}
                  onContextMenu={(e) => showCtx(e, folderCtx(node))}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${
                    isExpanded ? "rounded-t-lg" : "rounded-lg"
                  } hover:bg-[var(--surface-hover)]/50`}
                >
                  <ChevronDown size={14} className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} />
                  {isExpanded
                    ? <FolderOpen size={15} className="shrink-0 text-[var(--color-warning)]" />
                    : <FolderClosed size={15} className="shrink-0 text-[var(--color-warning)]" />
                  }
                  <span className="text-sm font-medium text-[var(--text-primary)]">{node.name}</span>
                  <span className="text-[10px] tabular-nums text-[var(--text-muted)]/50 ml-auto bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded-full">{node.commands.length + node.children.reduce((acc, c) => acc + c.commands.length, 0)}</span>
                </button>
                {isExpanded && (
                  <div className="border-l border-r border-b border-[var(--border-subtle)] rounded-b-lg overflow-hidden">
                    {node.commands.map((cmd) => renderCmd(cmd, 24))}
                    {node.children.map((child) => (
                      <div key={child.path}>
                        <div className="pl-8 pr-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]/60">
                          <FolderClosed size={11} className="shrink-0 text-[var(--color-warning)]/60" />
                          {child.name}
                        </div>
                        {child.commands.map((cmd) => renderCmd(cmd, 44))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          items={ctx.items}
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
        />
      )}

      {/* Edit dialog */}
      <CommandEditDialog
        entry={editing}
        isNew={editingNew}
        open={editing !== null}
        folderPaths={allFolderPaths}
        onClose={() => {
          setEditing(null);
          setEditingNew(false);
        }}
        onSave={(e) => {
          upsert(e);
          setEditing(null);
          setEditingNew(false);
        }}
      />

      {/* Move-to dialog */}
      {moveTarget && (
        <MoveDialog
          ids={moveTarget.ids}
          folderPaths={folderPathsForMove}
          onMove={handleMoveTo}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {/* New-folder prompt */}
      {newFolderPrompt && (
        <NewFolderDialog
          parentPath={newFolderPrompt.parentPath}
          onConfirm={(name) => {
            const fullPath = newFolderPrompt.parentPath
              ? newFolderPrompt.parentPath + "/" + name
              : name;
            addEmptyFolder(fullPath);
            setNewFolderPrompt(null);
          }}
          onClose={() => setNewFolderPrompt(null)}
        />
      )}
    </div>
  );
}

// ── Edit dialog ────────────────────────────────────────────────────────────

function CommandEditDialog({
  entry,
  isNew,
  open,
  folderPaths,
  onClose,
  onSave,
}: {
  entry: CommandEntry | null;
  isNew: boolean;
  open: boolean;
  folderPaths: string[];
  onClose: () => void;
  onSave: (e: CommandEntry) => void;
}) {
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [category, setCategory] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (entry) {
      setLabel(entry.label);
      setCommand(entry.command);
      setCategory(entry.category);
      setIcon(entry.icon ?? "");
      setDescription(entry.description ?? "");
      setPinned(entry.pinned);
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
      pinned,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "新建命令" : "编辑命令"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">图标</label>
            <Input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 2))} placeholder="e.g. :)" className="h-8 text-sm text-center w-14" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">标签</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} placeholder="显示名称" className="h-8 text-sm" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">命令</label>
            <Input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} placeholder="例如: docker compose up -d" className="h-8 text-sm font-mono" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选描述" rows={2} className="w-full rounded-sm border-2 border-transparent bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-focus)] resize-none transition-[border-color]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">分类</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} placeholder="文件夹/子文件夹（如 数据库/MySQL）" className="h-8 text-sm" list="cmd-categories" />
            <datalist id="cmd-categories">{folderPaths.filter((c) => c !== "未分类").map((c) => (<option key={c} value={c} />))}</datalist>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="rounded accent-[var(--accent)]" />固定到顶部
          </label>
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-sm h-7">取消</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!isValid} className="text-sm h-7">保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function MoveDialog({
  ids,
  folderPaths,
  onMove,
  onClose,
}: {
  ids: string[];
  folderPaths: string[];
  onMove: (ids: string[], target: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState("");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xs p-4">
        <DialogHeader>
          <DialogTitle>移动到文件夹</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-8 rounded-sm border-2 border-transparent bg-[var(--bg-surface)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
          >
            <option value="">-- 选择文件夹 --</option>
            <option value="">???</option>
            {folderPaths
              .filter((p) => p && p !== "未分类")
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-sm h-7">
              ??
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onMove(ids, selected)}
              className="text-sm h-7"
            >
              ??
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── New-folder dialog ──────────────────────────────────────────────────────

function NewFolderDialog({
  parentPath,
  onConfirm,
  onClose,
}: {
  parentPath: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xs p-4">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          {parentPath && (
            <p className="text-sm text-[var(--text-muted)]">
              父级：{parentPath}
            </p>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            placeholder="文件夹名称"
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-sm h-7">
              ??
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={!name.trim()}
              className="text-sm h-7"
            >
              ??
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
