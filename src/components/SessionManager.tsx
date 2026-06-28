import { useEffect, useState, useMemo } from "react";
import {
  Trash2, Edit3, Terminal, ChevronDown, ChevronRight, Plus,
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
  const [knownGroups, setKnownGroups] = useState<Set<string>>(new Set());

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const groups = useMemo(() => {
    const map: Record<string, SessionConfig[]> = {};
    for (const s of sessions) {
      const g = s.group || DEFAULT_GROUP;
      if (!map[g]) map[g] = [];
      map[g].push(s);
    }
    for (const g of knownGroups) {
      if (!map[g]) map[g] = [];
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));
    }
    const keys = Object.keys(map).sort((a, b) => {
      if (a === DEFAULT_GROUP) return -1;
      if (b === DEFAULT_GROUP) return 1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ name: k, path: k, sessions: map[k] }));
  }, [sessions, knownGroups]);

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
    const targets = sessions.filter((s) => (s.group || DEFAULT_GROUP) === oldName);
    for (const s of targets) {
      await save({ ...s, group: target === DEFAULT_GROUP ? "" : target });
    }
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
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[28px] opacity-25">terminal</span>
          <span>暂无保存的会话</span>
        </div>
      ) : (
        groups.map((group) => {
          const isExpanded = expanded.has(group.path);
          const connectedCount = group.sessions.filter((s) => isConnected(s.id)).length;

          return (
            <div key={group.path}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.path)}
                onContextMenu={(e) => showCtx(e, [
                  { label: isExpanded ? "折叠" : "展开", icon: isExpanded ? <ChevronRight size={13} /> : <ChevronDown size={13} />, onClick: () => toggleGroup(group.path) },
                  null,
                  { label: "重命名", icon: <Edit3 size={13} />, onClick: () => handleRenameGroup(group.name) },
                ])}
                className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-surface-variant/30 transition-colors rounded group/gh mb-0.5"
              >
                <span className={`material-symbols-outlined text-[16px] text-outline transition-transform duration-200 group-hover/gh:text-on-surface ${isExpanded ? "" : "-rotate-90"}`}>
                  expand_more
                </span>
                <span className="flex-1 text-[10px] font-bold uppercase tracking-wider text-outline group-hover/gh:text-on-surface">
                  {group.name}
                </span>
                <span className="text-[10px] font-terminal-mono text-outline bg-surface-container px-1.5 py-0.5 rounded tabular-nums">
                  {group.sessions.length}
                </span>
              </button>

              {/* Session items */}
              {isExpanded && group.sessions.length > 0 && (
                <div className="space-y-1 pb-1">
                  {group.sessions.map((s) => (
                    <div key={s.id} data-session-item>
                      <SessionItem
                        session={s}
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

              {isExpanded && group.sessions.length === 0 && (
                <div className="px-4 py-3 text-[10px] text-center text-on-surface-variant opacity-60">
                  此分组内暂无会话
                </div>
              )}
            </div>
          );
        })
      )}

      {ctx && (
        <ContextMenu items={ctx.items} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}

/* ── Session Item (Stitch Design System) ── */
function SessionItem({
  session,
  isConnected,
  isActive,
  onConnect,
  onEdit,
  onDelete,
  onContextMenu,
}: {
  session: SessionConfig;
  isConnected: boolean;
  isActive: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      onClick={onConnect}
      onContextMenu={onContextMenu}
      className={`flex items-center justify-between px-3 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all group py-1 cursor-pointer ${
        isConnected || isActive
          ? "border-l-2 border-secondary"
          : "border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isActive
            ? "bg-secondary shadow-[0_0_6px_#4de082]"
            : isConnected
              ? "bg-secondary animate-pulse"
              : "bg-outline/30"
        }`} />
        {/* dns icon */}
        <span className={`material-symbols-outlined text-[18px] text-outline group-hover:text-secondary transition-colors flex-shrink-0`}>
          dns
        </span>
        {/* Name + Host */}
        <div className="flex flex-col min-w-0">
          <span className={`text-label-sm font-label-sm truncate ${
            isActive
              ? "text-secondary font-semibold"
              : isConnected
                ? "text-secondary"
                : "text-on-surface-variant"
          }`}>
            {session.name || session.host}
          </span>
          <span className="text-[10px] font-terminal-mono text-outline truncate">
            {session.host}{session.port !== 22 && session.port !== 23 ? `:${session.port}` : ""}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 transition-colors"
          title="编辑"
        >
          <Edit3 size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
          title="删除"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </a>
  );
}
