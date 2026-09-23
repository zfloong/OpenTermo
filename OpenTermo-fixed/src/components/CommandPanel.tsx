import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  Search,
  X,
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
import { confirmAction, promptText } from "@/components/ui/confirm-dialog";

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
  commands: CommandEntry[];
  children: TreeNode[];
  isEmpty: boolean;
}

function countCommands(node: TreeNode): number {
  return node.commands.length + node.children.reduce((acc, c) => acc + countCommands(c), 0);
}

export default function CommandPanel() {
  const entries = useCommandStore((s) => s.entries);
  const emptyFolders = useCommandStore((s) => s.emptyFolders);
  const load = useCommandStore((s) => s.load);
  const upsert = useCommandStore((s) => s.upsert);
  const remove = useCommandStore((s) => s.remove);
  const addEmptyFolder = useCommandStore((s) => s.addEmptyFolder);
  const removeEmptyFolder = useCommandStore((s) => s.removeEmptyFolder);
  const renameFolder = useCommandStore((s) => s.renameFolder);
  const exportAll = useCommandStore((s) => s.exportAll);
  const exportFolder = useCommandStore((s) => s.exportFolder);
  const importCommands = useCommandStore((s) => s.importCommands);

  const [sortMode, setSortMode] = useState<SortMode>(() =>
    localStorage.getItem("cmd-sort") === "recent" ? "recent" : "name",
  );

  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sendInput = useSessionStore((s) => s.sendInput);
  const triggerScroll = useSessionStore((s) => s.triggerScroll);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [editing, setEditing] = useState<CommandEntry | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedInit, setExpandedInit] = useState(false);
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ ids: string[] } | null>(null);
  const [newFolderPrompt, setNewFolderPrompt] = useState<{ parentPath: string } | null>(null);
  const [dataMsg, setDataMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searching = query.trim().length > 0;

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

  /** 库级数据操作的统一反馈：一次只可能有一条消息，重复触发时重置计时器。 */
  const flashDataMsg = useCallback((text: string, ok: boolean) => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setDataMsg({ text, ok });
    msgTimerRef.current = setTimeout(() => setDataMsg(null), ok ? 3000 : 5000);
  }, []);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const result = await importCommands(text);
        flashDataMsg(
          `已导入 ${result.imported} 条命令${result.skipped > 0 ? `（跳过 ${result.skipped} 条：重复或无效）` : ""}`,
          true,
        );
      } catch (e: any) {
        flashDataMsg(e?.message || "导入失败", false);
      }
    },
    [importCommands, flashDataMsg],
  );

  /** 导出整个命令库。写盘失败必须让用户看到，不能只留一个未处理的 Promise。 */
  const handleExportAll = useCallback(async () => {
    try {
      const filePath = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "opentermo-commands.json",
      });
      if (!filePath) return; // 用户取消
      await invoke("write_text_file", { path: filePath, content: exportAll() });
      flashDataMsg(`已导出 ${entries.length} 条命令`, true);
    } catch (e: any) {
      flashDataMsg(`导出失败：${e?.message || e}`, false);
    }
  }, [exportAll, entries.length, flashDataMsg]);

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

  // ── Search filter ─────────────────────────────────────────────────────

  /** 命中 label / 命令本体 / 描述 / 分组名，任意一项包含即算命中。 */
  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.label} ${e.command} ${e.description ?? ""} ${e.category}`.toLowerCase().includes(q),
    );
  }, [entries, query]);

  /** 搜索时执行的第一条（回车用）。 */

  // ── Build tree ────────────────────────────────────────────────────────

  const tree = useMemo(() => {
    // 搜索态只按命中结果建树，空文件夹不参与（它没有可匹配的内容）
    const folderSource = searching ? [] : emptyFolders;
    // Group commands by category path
    const cmdByPath = new Map<string, CommandEntry[]>();
    for (const e of visibleEntries) {
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
    for (const p of folderSource) {
      folderPaths.add(p);
    }

    // Top-level entries: ??? + root folders
    const rootNodes: TreeNode[] = [];

    // ???
    const uncategorized = cmdByPath.get("未分类");
    if (uncategorized && uncategorized.length > 0) {
      rootNodes.push({
        name: "未分类",
        path: "未分类",
        commands: sortCommands(uncategorized),
        children: [],
        isEmpty: false,
      });
    }

    // Build tree from folder paths
    const buildChildren = (parent: string): TreeNode[] => {
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
        const isExplicitEmpty = folderSource.includes(childPath);
        const isEmpty = cmds.length === 0 && isExplicitEmpty;


        const subChildren = buildChildren(childPath);
        children.push({
          name: childName,
          path: childPath,
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

    {
      const roots = buildChildren("");
      rootNodes.push(...roots);
    }

    return rootNodes;
  }, [visibleEntries, emptyFolders, searching, sortCommands]);

  /** 搜索时回车执行的第一条命中。放在 tree 之后，否则会撞上 TDZ。 */
  const firstMatch = useMemo(() => {
    if (!searching) return null;
    for (const node of tree) {
      if (node.commands[0]) return node.commands[0];
      for (const child of node.children) if (child.commands[0]) return child.commands[0];
    }
    return null;
  }, [searching, tree]);

  // Auto-expand all cards on first load
  useEffect(() => {
    if (!expandedInit && tree.length > 0) {
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
      triggerScroll(activeTabId);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
      }, 50);
    },
    [activeTabId, activeTab, upsert, sendInput],
  );

  const handleExecute = useCallback(
    async (cmd: CommandEntry) => {
      if (!activeTabId) return;
      const resolved = resolveCommandTemplate(cmd.command, activeTab?.session ?? null);
      const updated = { ...cmd, last_used: new Date().toISOString() };
      await upsert(updated);
      // Send command + Enter to execute immediately
      await sendInput(activeTabId, resolved + "\r");
      triggerScroll(activeTabId);
      setTimeout(() => {
        document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
      }, 50);
    },
    [activeTabId, activeTab, upsert, sendInput],
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
    async (cmd: CommandEntry) => {
      const ok = await confirmAction({
        title: "删除命令",
        message: `确定删除「${cmd.label || cmd.command}」？此操作不可撤销。`,
        confirmText: "删除",
        danger: true,
      });
      if (ok) await remove(cmd.id);
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
        onClick: () => handleDelete(cmd),
        danger: true,
      },
    ],
    [handleSend, handleTogglePin, handleDelete, handleDuplicate, activeTabId],
  );

  const folderCtx = useCallback(
    (node: TreeNode): (ContextMenuItem | null)[] => {
      const canNest = node.path.split("/").length === 1 && node.path !== "未分类";
      const items: (ContextMenuItem | null)[] = [
        {
          label: "新建命令",
          icon: <Plus size={12} />,
          onClick: () => openNewCommandDialog(node.path),
        },
        ...(canNest
          ? [
              {
                label: "新建子文件夹",
                icon: <FolderPlus size={12} />,
                onClick: () => setNewFolderPrompt({ parentPath: node.path }),
              },
            ]
          : []),
      ];

      items.push(
        {
          label: "重命名",
          icon: <Edit3 size={12} />,
          onClick: async () => {
            const newName = await promptText({
              title: "重命名文件夹",
              input: { label: "文件夹名称", initial: node.name },
            });
            if (newName && newName !== node.name) {
              const parts = node.path.split("/");
              parts[parts.length - 1] = newName;
              renameFolder(node.path, parts.join("/"));
            }
          },
        },
        null,
        {
          label: "导出文件夹",
          icon: <Download size={12} />,
          onClick: async () => {
            const filePath = await save({
              filters: [{ name: "JSON", extensions: ["json"] }],
              defaultPath: node.path.replace(/\//g, "-") + ".json",
            });
            if (filePath) {
              await invoke("write_text_file", { path: filePath, content: exportFolder(node.path) });
            }
          },
        },
        null,
        {
          label: "删除文件夹",
          icon: <Trash2 size={12} />,
          onClick: async () => {
            const ok = await confirmAction({
              title: "删除文件夹",
              message: node.isEmpty
                ? `确定删除文件夹「${node.path}」？`
                : `确定删除文件夹「${node.path}」及其所有命令？此操作不可撤销。`,
              confirmText: "删除",
              danger: true,
            });
            if (ok) {
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
        label: "粘贴命令",
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
      // 库级数据操作：作用于整份命令库，所以放在面板空白处的右键菜单里，
      // 而不是命令或文件夹的菜单里。
      {
        label: "导出全部命令",
        icon: <Download size={12} />,
        onClick: () => void handleExportAll(),
      },
      {
        label: "导入全部命令",
        icon: <Upload size={12} />,
        onClick: () => fileInputRef.current?.click(),
      },
      null,
      // Sort header (non-clickable)
      {
        label: "排序方式",
        disabled: true,
      },
      {
        label: "名称",
        icon: sortMode === "name" ? <CheckSquare size={12} /> : <Square size={12} />,
        onClick: () => {
          localStorage.setItem("cmd-sort", "name");
          setSortMode("name");
        },
      },
      {
        label: "最近使用",
        icon: sortMode === "recent" ? <CheckSquare size={12} /> : <Square size={12} />,
        onClick: () => {
          localStorage.setItem("cmd-sort", "recent");
          setSortMode("recent");
        },
      },
    ],
    [sortMode, openNewCommandDialog, handleExportAll],
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
        title="单击填入 · 双击直接执行"
        // 命令是叶子节点，不能做成卡片 —— 卡片是「容器」的语言，父项和子项形态
        // 一样就废掉了树状层级。静止时没有背景，只靠缩进挂在所属文件夹里，
        // 鼠标经过才浮出一层淡底，用落点而不是形状来定位。
        // 置顶不加任何底色：蓝色星星本身就是唯一标记，再上色就是双重强调。
        className="group flex items-center gap-2 pr-2 py-1.5 rounded-md transition-colors cursor-pointer hover:bg-[var(--surface-hover)]"
        style={{ paddingLeft: leftPad }}
      >
        {/* Icon */}
        {cmd.icon && (
          <span className="shrink-0 w-4 text-center text-xs leading-none">{cmd.icon}</span>
        )}

        {/* Label — 正文层：比文件夹标题小一档、淡一档，权重让给容器 */}
        <span className="flex-1 text-[13px] text-[var(--text-secondary)] truncate">{cmd.label || cmd.command}</span>

        {/* Pinned star */}
        {cmd.pinned && <Star size={10} className="text-[var(--accent)] shrink-0" fill="var(--accent)" />}

      </div>
    ),
    [handleCmdClick, showCtx, cmdCtx]
  );

  // ── Nested folder rows (level 2) ──────────────────────────────────────

  const renderChildFolders = (nodes: TreeNode[], pad: number): React.ReactNode =>
    nodes.map((child) => {
      const isExpanded = searching || expandedCards.has(child.path);
      return (
        // 子文件夹同样是「容器」：整块背景板 + 展开体包在板子里，
        // 于是命令行看起来是「这个文件夹里的内容」，而不是并排的独立按钮。
        // 层级深度靠整块的缩进（marginLeft）表达，越深越靠右。
        <div
          key={child.path}
          style={{ marginLeft: pad }}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-row)] overflow-hidden"
        >
          <button
            onClick={() => setExpandedCards((prev) => { const n = new Set(prev); if (n.has(child.path)) n.delete(child.path); else n.add(child.path); return n; })}
            onContextMenu={(e) => showCtx(e, folderCtx(child))}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
          >
            {isExpanded
              ? <FolderOpen size={14} className="shrink-0 text-[var(--accent)]" />
              : <FolderClosed size={14} className="shrink-0 text-[var(--text-secondary)]" />
            }
            <span className="text-[13px] font-medium text-[var(--text-secondary)] truncate">{child.name}</span>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)] border border-[var(--border-subtle)] ml-auto px-1.5 rounded-full shrink-0">{countCommands(child)}</span>
          </button>
          {isExpanded && (
            <div className="pb-1">
              {child.commands.map((cmd) => renderCmd(cmd, 26))}
              {renderChildFolders(child.children, 12)}
            </div>
          )}
        </div>
      );
    });

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" onContextMenu={(e) => { e.preventDefault(); showCtx(e, emptyCtx()); }}>

      {/* 面板头：纯文本，不给底色不给图标 —— 上面是标签栏、下面是列表，
          这一行只是分区名，任何强调色块都会压过真正需要点击的命令列表。 */}
      <div className="flex items-center pl-3 pr-2.5 pt-2 pb-1 shrink-0">
        <span className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">命令集</span>
      </div>

      {/* 库级导入的文件选择器：由右键菜单的「导入全部命令」触发 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
      />

      {/* Search — 面板内过滤，命中 label / 命令 / 描述 / 分组 */}
      <div className="px-2 pb-1.5">
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus-within:border-[var(--border-focus)] transition-[border-color]">
          <Search size={14} className="shrink-0 text-[var(--text-muted)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstMatch) handleExecute(firstMatch);
              if (e.key === "Escape") { e.stopPropagation(); setQuery(""); }
            }}
            placeholder={`搜索 ${entries.length} 条命令…`}
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          {searching && (
            <button
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="清空"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {dataMsg && (
        <div className={`text-xs px-2 py-1.5 rounded mx-2 mb-1 ${
          dataMsg.ok
            ? "text-[var(--color-success)] bg-success/10"
            : "text-[var(--color-danger)] bg-danger/10"
        }`}>
          {dataMsg.text}
        </div>
      )}

      {/* Command cards */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-1.5 space-y-2">
        {tree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[13px] text-[var(--text-muted)] px-3 text-center">
            {searching ? "没有匹配的命令" : "暂无保存的命令"}
          </div>
        ) : (
          tree.map((node) => {
            const isExpanded = searching || expandedCards.has(node.path);
            return (
              // 文件夹 = 容器 = 唯一的背景板。展开体包在同一块板子里，
              // 命令作为「叶行」缩进排在板子内部，母子的从属关系由形状本身说明。
              <div key={node.path} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                <button
                  onClick={() => setExpandedCards((prev) => { const n = new Set(prev); if (n.has(node.path)) n.delete(node.path); else n.add(node.path); return n; })}
                  onContextMenu={(e) => showCtx(e, folderCtx(node))}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                >
                  {/* 展开/折叠不靠箭头提示：开合两态的文件夹图标本身已经区分得很清楚，
                      去掉箭头后文件夹左对齐，父级感反而更强。 */}
                  {isExpanded
                    ? <FolderOpen size={15} className="shrink-0 text-[var(--accent)]" />
                    : <FolderClosed size={15} className="shrink-0 text-[var(--text-secondary)]" />
                  }
                  <span className="text-[15px] font-semibold text-[var(--text-heading)] truncate">{node.name}</span>
                  <span className="text-[11px] tabular-nums text-[var(--text-muted)] border border-[var(--border-subtle)] ml-auto px-1.5 py-0.5 rounded-full shrink-0">{countCommands(node)}</span>
                </button>
                {isExpanded && (
                  <div className="pb-1.5">
                    {node.commands.map((cmd) => renderCmd(cmd, 26))}
                    {renderChildFolders(node.children, 12)}
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
  const [description, setDescription] = useState("");
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (entry) {
      setLabel(entry.label);
      setCommand(entry.command);
      setCategory(entry.category);
      setDescription(entry.description ?? "");
      setPinned(entry.pinned);
    }
  }, [entry?.id]);

  const isValid = (label || command).trim().length > 0;
  const depthTooDeep = category.trim().split("/").filter(Boolean).length > 2;

  const handleSave = () => {
    if (!entry || !isValid || depthTooDeep) return;
    onSave({
      ...entry,
      id: entry.id || crypto.randomUUID(),
      label: label.trim(),
      command: command.trim(),
      category: category.trim(),
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
            <label className="text-sm text-[var(--text-secondary)]">名称</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} placeholder="显示名称" className="h-8 text-sm" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--text-secondary)]">指令</label>
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
            {depthTooDeep && (
              <span className="text-xs text-[var(--color-danger)]">分类最多支持两层（如 数据库/MySQL）</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="rounded accent-[var(--accent)]" />固定到顶部
          </label>
          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-sm h-7">取消</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!isValid || depthTooDeep} className="text-sm h-7">保存</Button>
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
            <option value="">未分类</option>
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
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onMove(ids, selected)}
              className="text-sm h-7"
            >
              移动
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
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              disabled={!name.trim()}
              className="text-sm h-7"
            >
              创建
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

