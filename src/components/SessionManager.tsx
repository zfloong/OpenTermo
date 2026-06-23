import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Trash2, Edit3, Monitor, Cable, Terminal,
  ChevronDown, ChevronRight, Plus
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionConfig } from "@/lib/tauriCommands";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

const DEFAULT_GROUP = "终端列表";

interface CtxState {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
}

interface SessionGroup {
  name: string;
  path: string;
  sessions: SessionConfig[];
}

export default function SessionManager() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const save = useSessionStore((s) => s.save);
  const openEditDialog = useSessionStore((s) => s.openEditDialog);
  const openConnectDialog = useSessionStore((s) => s.openConnectDialog);
  const remove = useSessionStore((s) => s.remove);
  const connect = useSessionStore((s) => s.connect);
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);

  const [expanded, setExpanded] = useState<Set<string>>(new Set([DEFAULT_GROUP]));
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [search, setSearch] = useState("");
  const [knownGroups, setKnownGroups] = useState<Set<string>>(new Set());

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Group sessions
  const groups = useMemo(() => {
    const lower = search.toLowerCase();
    const filtered = lower
      ? sessions.filter((s) =>
          (s.name || "").toLowerCase().includes(lower) ||
          (s.host || "").toLowerCase().includes(lower) ||
          (s.user || "").toLowerCase().includes(lower) ||
          (s.group || "").toLowerCase().includes(lower)
        )
      : sessions;

    const map: Record<string, SessionConfig[]> = {};
    for (const s of filtered) {
      const g = s.group || DEFAULT_GROUP;
      if (!map[g]) map[g] = [];
      map[g].push(s);
    }

    // Inject known empty groups so they show in sidebar
    for (const g of knownGroups) {
      if (!map[g]) map[g] = [];
    }

    // Sort sessions within each group A-Z
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));
    }

    // Sort: 终端列表 first, then alphabetical
    const keys = Object.keys(map).sort((a, b) => {
      if (a === DEFAULT_GROUP) return -1;
      if (b === DEFAULT_GROUP) return 1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ name: k, path: k, sessions: map[k] }));
    }, [sessions, search, knownGroups]);
  const toggleGroup = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const isConnected = (id: string) =>
    tabs.some((t) => t.session.id === id && t.status === "connected");
  const isActive = (id: string) => {
    const tab = tabs.find((t) => t.session.id === id);
    return tab ? tab.id === activeTabId : false;
  };
  const kindIcon = (k: string) => {
    switch (k) {
      case "ssh": return <Terminal size={13} className="text-[var(--accent)]" />;
      case "serial": return <Cable size={13} className="text-[var(--color-warning)]" />;
      case "telnet": return <Monitor size={13} className="text-[var(--color-info)]" />;
      default: return <Terminal size={13} />;
    }
  };
  const handleConnect = (s: SessionConfig) => {
    const existingTab = tabs.find((t) => t.session.id === s.id);
    if (existingTab) {
      setActiveTab(existingTab.id);
    } else {
      connect(`tab-${s.id}-${Date.now()}`, s);
    }
  };
  const handleDelete = async (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s || !confirm(`删除会话 "${s.name || s.host}"?`)) return;
    await remove(id);
    loadSessions();
  };
  const startEdit = (s: SessionConfig) => {
    openEditDialog(s.id);
  };

  // ?? Group management ???????????????????????????????????????????
  const handleNewGroup = () => {
    const name = prompt("新分组名称：");
    if (!name || !name.trim()) return;
    const g = name.trim();
    setKnownGroups((prev) => new Set(prev).add(g));
    setExpanded((prev) => new Set(prev).add(g));
  };

  const handleMoveToGroup = async (s: SessionConfig, group: string) => {
    await save({ ...s, group });
    loadSessions();
  };

  const handleMoveToNewGroup = async (s: SessionConfig) => {
    const name = prompt("新分组名称：");
    if (!name || !name.trim()) return;
    const g = name.trim();
    await save({ ...s, group: g });
    setExpanded((prev) => new Set(prev).add(g));
    loadSessions();
  };

  const handleRenameGroup = async (oldName: string) => {
    const newName = prompt("输入新分组名称：", oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const target = newName.trim();
    // Rename all sessions in this group
    const targets = sessions.filter((s) => (s.group || DEFAULT_GROUP) === oldName);
    for (const s of targets) {
      await save({ ...s, group: target === DEFAULT_GROUP ? "" : target });
    }
    // Update known groups
    setKnownGroups((prev) => {
      const next = new Set(prev);
      next.delete(oldName);
      if (target !== DEFAULT_GROUP) next.add(target);
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(oldName);
      next.add(target);
      return next;
    });
    loadSessions();
  };


  const sessionCtx = (s: SessionConfig): (ContextMenuItem | null)[] => {
    // Gather all groups for move-to submenu
    const groupNames = [...new Set(sessions.map((x) => x.group || DEFAULT_GROUP))];
    groupNames.sort((a, b) => {
      if (a === DEFAULT_GROUP) return -1;
      if (b === DEFAULT_GROUP) return 1;
      return a.localeCompare(b);
    });
    const cur = s.group || DEFAULT_GROUP;
    const moveItems: ContextMenuItem[] = groupNames
      .filter((g) => g !== cur)
      .map((g) => ({
        label: g,
        onClick: () => handleMoveToGroup(s, g === DEFAULT_GROUP ? "" : g),
      }));
    moveItems.push({
      label: "新建分组...",
      icon: <Plus size={12} />,
      onClick: () => handleMoveToNewGroup(s),
    });

    return [
      { label: "连接", icon: <Terminal size={13} />, onClick: () => handleConnect(s) },
      { label: "编辑", icon: <Edit3 size={13} />, onClick: () => startEdit(s) },
      { label: "移动到分组", icon: <ChevronRight size={13} />, children: moveItems },
      null,
      { label: "删除", icon: <Trash2 size={13} />, onClick: () => handleDelete(s.id), danger: true },
    ];
  };
  const showCtx = (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ items, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus-within:border-[rgb(var(--accent-rgb)/0.50)] transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--text-muted)] shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] min-w-0"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Groups - Clash Verge style cards */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-2 py-2 space-y-2"
        onContextMenu={(e) => {
          // Only show on blank area (not on session items or group headers)
          const target = e.target as HTMLElement;
          if (target.closest('[data-session-item]') || target.closest('button')) return;
          showCtx(e, [
            { label: "新建连接", icon: <Plus size={13} />, onClick: () => openConnectDialog() },
            { label: "新建分组", icon: <Plus size={13} />, onClick: () => handleNewGroup() },
          ]);
        }}
      >
        {groups.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-[var(--text-muted)]"
            onContextMenu={(e) => showCtx(e, [
              { label: "新建连接", icon: <Plus size={13} />, onClick: () => openConnectDialog() },
              { label: "新建分组", icon: <Plus size={13} />, onClick: () => handleNewGroup() },
            ])}
          >
            <Terminal size={28} className="opacity-25" />
            <span>{search ? "无匹配会话" : "暂无保存的会话"}</span>
          </div>
        ) : (
          groups.map((group) => {
            const isExpanded = expanded.has(group.path);
            const connectedCount = group.sessions.filter((s) => isConnected(s.id)).length;
            const connColor = connectedCount > 0 ? "text-[var(--color-success)]" : "text-[var(--text-muted)]";

            return (
              <div key={group.path} className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/50">
                {/* Group header bar - FULL WIDTH clickable */}
                <button
                  onClick={() => toggleGroup(group.path)}
                  onContextMenu={(e) => showCtx(e, [
                    { label: isExpanded ? "折叠" : "展开", icon: isExpanded ? <ChevronRight size={13} /> : <ChevronDown size={13} />, onClick: () => toggleGroup(group.path) },
                    null,
                    { label: "重命名", icon: <Edit3 size={13} />, onClick: () => handleRenameGroup(group.name) },
                  ])}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--surface-hover)] transition-colors group/gh"
                >
                  {/* Chevron */}
                  <span className={`shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
                    <ChevronDown size={16} className="text-[var(--text-muted)]" />
                  </span>

                  {/* Group info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{group.name}</div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 shrink-0">
                    {connectedCount > 0 && (
                      <span className={`text-xs font-medium ${connColor}`}>
                        {connectedCount} 在线
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-muted)] tabular-nums bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                      {group.sessions.length}
                    </span>
                  </div>
                </button>

                {/* Expanded sessions */}
                {isExpanded && group.sessions.length > 0 && (
                  <div className="border-t border-[var(--border-subtle)] py-1.5 px-1 flex flex-col gap-1">
                    {group.sessions.map((s) => (
                      <div key={s.id} data-session-item>
                          <SessionItemMerged
                            session={s}
                            icon={kindIcon(s.kind)}
                            isConnected={isConnected(s.id)}
                            isActive={isActive(s.id)}
                            onConnect={() => handleConnect(s)}
                            onEdit={() => startEdit(s)}
                            onDelete={() => handleDelete(s.id)}
                            onContextMenu={(e: React.MouseEvent) => showCtx(e, sessionCtx(s))}
                          />
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded but empty */}
                {isExpanded && group.sessions.length === 0 && (
                  <div className="px-4 py-3 text-xs text-center text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                    此分组内暂无会话
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu items={ctx.items} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}

function SessionItem({
  session,
  icon,
  isConnected,
  onConnect,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  session: SessionConfig;
  icon: React.ReactNode;
  isConnected: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onConnect}
      onContextMenu={onContextMenu}
      className={`group/srow flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
        isConnected
          ? "bg-[var(--surface-selected)] border border-[var(--accent-border)] shadow-sm"
          : "border border-transparent hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:shadow-sm hover:scale-[1.015]"
      }`}
    >
      {/* Icon + connected indicator */}
      <div className="relative shrink-0">
        {icon}
        {isConnected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-1 ring-[var(--bg-surface)]" />
        )}
      </div>

      {/* Name + host */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate ${
          isConnected ? "text-[var(--accent)] font-medium" : "text-[var(--text-primary)]"
        }`}>
          {session.name || session.host}
        </div>
        <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
          {session.user && `${session.user}@`}{session.host}{session.port !== 22 && session.port !== 23 ? `:${session.port}` : ""}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/srow:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
          title="编辑"
        >
          <Edit3 size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ??? SessionItemB ? indented list with left color bar ???????????????????????

function SessionItemB({
  session,
  icon,
  isConnected,
  onConnect,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  session: SessionConfig;
  icon: React.ReactNode;
  isConnected: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onConnect}
      onContextMenu={onContextMenu}
      className={`group/srow relative flex items-center gap-3 pl-4 pr-3 py-2 cursor-pointer transition-all duration-200 ${
        isConnected
          ? "bg-[var(--surface-selected)]"
          : "hover:bg-[var(--surface-hover)] hover:pl-5"
      }`}
    >
      {/* Left color bar */}
      <span
        className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full transition-all duration-300 ${
          isConnected
            ? "bg-[var(--color-success)] opacity-100"
            : "bg-[var(--border-subtle)] opacity-0 group-hover/srow:opacity-100"
        }`}
      />

      {/* Icon + connected indicator */}
      <div className="relative shrink-0">
        {icon}
        {isConnected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-1 ring-[var(--bg-surface)]" />
        )}
      </div>

      {/* Name + host */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate transition-colors duration-200 ${
          isConnected ? "text-[var(--accent)] font-medium" : "text-[var(--text-primary)]"
        }`}>
          {session.name || session.host}
        </div>
        <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
          {session.user && `${session.user}@`}{session.host}{session.port !== 22 && session.port !== 23 ? `:${session.port}` : ""}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/srow:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
          title="编辑"
        >
          <Edit3 size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}





// ??? SessionItemMerged ? card + left bar + active highlight ?????????????????

function SessionItemMerged({
  session,
  icon,
  isConnected,
  isActive,
  onConnect,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  session: SessionConfig;
  icon: React.ReactNode;
  isConnected: boolean;
  isActive: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onConnect}
      onContextMenu={onContextMenu}
      className={`group/srow relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
        isActive
          ? "bg-[var(--surface-selected)] border border-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]/20"
          : isConnected
            ? "bg-[var(--surface-selected)]/60 border border-[var(--accent-border)]"
            : "border border-transparent hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)] hover:shadow-sm"
      }`}
    >
      {/* Left color bar */}
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-all duration-300 ${
          isActive
            ? "bg-[var(--color-success)] opacity-100"
            : isConnected
              ? "bg-[var(--accent)] opacity-60"
              : "bg-[var(--border-subtle)] opacity-0 group-hover/srow:opacity-100"
        }`}
      />

      {/* Icon + connected indicator */}
      <div className="relative shrink-0 ml-0.5">
        {icon}
        {(isConnected || isActive) && (
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-[var(--bg-surface)] transition-all ${
            isActive ? "bg-[var(--color-success)] shadow-[0_0_4px_var(--color-success)]" : "bg-[var(--accent)]"
          }`} />
        )}
      </div>

      {/* Name + host */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate transition-colors duration-200 ${
          isActive
            ? "text-[var(--color-success)] font-semibold"
            : isConnected
              ? "text-[rgb(var(--accent-rgb)/0.80)] font-medium"
              : "text-[var(--text-primary)]"
        }`}>
          {session.name || session.host}
        </div>
        <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
          {session.user && `${session.user}@`}{session.host}{session.port !== 22 && session.port !== 23 ? `:${session.port}` : ""}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover/srow:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
          title="编辑"
        >
          <Edit3 size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

