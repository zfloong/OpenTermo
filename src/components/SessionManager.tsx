import { useEffect, useState, useMemo } from "react";
import {
  Trash2, Edit3, Terminal, ChevronDown, ChevronRight,
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionConfig } from "@/lib/tauriCommands";
import { pingHost } from "@/lib/tauriCommands";
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

export default function SessionManager({ searchQuery = "" }: { searchQuery?: string }) {
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [knownGroups, setKnownGroups] = useState<Set<string>>(new Set());
  const [latency, setLatency] = useState<Record<string, number>>({});

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Auto-expand all groups when sessions load
  useEffect(() => {
    if (sessions.length === 0) return;
    const groupNames = [...new Set(sessions.map((s) => s.group).filter(Boolean))];
    setExpanded((prev) => {
      let changed = false;
      for (const g of groupNames) { if (!prev.has(g)) { changed = true; prev = new Set(prev); prev.add(g); } }
      return changed ? prev : prev;
    });
  }, [sessions]);

  // Ping all sessions for latency, refresh every 3s
  useEffect(() => {
    if (sessions.length === 0) return;
    const abort = new AbortController();
    const runPing = async () => {
      const results: Record<string, number> = {};
      for (let i = 0; i < sessions.length; i += 5) {
        if (abort.signal.aborted) return;
        const batch = sessions.slice(i, i + 5);
        const promises = batch.map(async (s) => {
          try {
            const us = await pingHost(s.host);
            results[s.id] = us;
          } catch { results[s.id] = -1; }
        });
        await Promise.all(promises);
        if (!abort.signal.aborted) setLatency({ ...results });
      }
    };
    runPing();
    const timer = setInterval(runPing, 30000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [sessions]);

  const groups = useMemo(() => {
    const filtered = searchQuery
      ? sessions.filter((s) =>
          (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.host.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : sessions;
    // Sessions with no group → shown directly (ungrouped)
    const ungrouped = filtered.filter((s) => !s.group);
    // Sessions with a group → grouped by group name
    const map: Record<string, SessionConfig[]> = {};
    for (const s of filtered) {
      if (!s.group) continue;
      if (!map[s.group]) map[s.group] = [];
      map[s.group].push(s);
    }
    for (const g of knownGroups) {
      if (!map[g]) map[g] = [];
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (a.name || a.host).localeCompare(b.name || b.host));
    }
    const keys = Object.keys(map).sort((a, b) => a.localeCompare(b));
    return { ungrouped, grouped: keys.map((k) => ({ name: k, path: k, sessions: map[k] })) };
  }, [sessions, knownGroups, searchQuery]);

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
    return [
      { label: "连接", icon: <Terminal size={13} />, onClick: () => handleConnect(s) },
      { label: "编辑", icon: <Edit3 size={13} />, onClick: () => startEdit(s) },
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
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[28px] opacity-25">terminal</span>
          <span>暂无保存的会话</span>
        </div>
      ) : (
        <>
          {/* 无分组会话 — 直接显示 */}
          {groups.ungrouped.length > 0 && (
            <div className="space-y-1 px-2 pb-2">
              {groups.ungrouped.map((s) => (
                <div key={s.id} data-session-item>
                  <SessionItem
                    session={s}
                    isConnected={isConnected(s.id)}
                    isActive={isActive(s.id)}
                    onConnect={() => handleConnect(s)}
                    onContextMenu={(e: React.MouseEvent) => showCtx(e, sessionCtx(s))}
                    latency={latency[s.id]}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 有分组会话 — 按分组显示 */}
          {groups.grouped.map((group) => {
            const isExpanded = expanded.has(group.path);
            return (
              <div key={group.path}>
                <button
                  onClick={() => toggleGroup(group.path)}
                  onContextMenu={(e) => showCtx(e, [
                    { label: isExpanded ? "折叠" : "展开", icon: isExpanded ? <ChevronRight size={13} /> : <ChevronDown size={13} />, onClick: () => toggleGroup(group.path) },
                    null,
                    { label: "重命名", icon: <Edit3 size={13} />, onClick: () => handleRenameGroup(group.name) },
                  ])}
                  className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-surface-variant/15 active:bg-transparent transition-colors rounded-md group/gh mb-0.5"
                >
                  <span className={`material-symbols-outlined text-[14px] text-outline/40 transition-transform duration-200 group-hover/gh:text-outline/60 ${isExpanded ? "" : "-rotate-90"}`}>
                    expand_more
                  </span>
                  <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-outline/40 group-hover/gh:text-outline/60">
                    {group.name}
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-outline/30 hover:text-secondary cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); openConnectDialog(); }}>add</span>
                </button>

                {isExpanded && (
                  <div className="space-y-1 px-2 pb-2">
                    {group.sessions.map((s) => (
                      <div key={s.id} data-session-item>
                        <SessionItem
                          session={s}
                          isConnected={isConnected(s.id)}
                          isActive={isActive(s.id)}
                          onConnect={() => handleConnect(s)}
                          onContextMenu={(e: React.MouseEvent) => showCtx(e, sessionCtx(s))}
                          latency={latency[s.id]}
                        />
                      </div>
                    ))}
                    {group.sessions.length === 0 && (
                      <div className="px-4 py-3 text-[10px] text-center text-on-surface-variant opacity-60">
                        此分组内暂无会话
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {ctx && (
        <ContextMenu items={ctx.items} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}

/* ── Session Item ── */
function SessionItem({
  session,
  isConnected,
  isActive,
  onConnect,
  onContextMenu,
  latency,
}: {
  session: SessionConfig;
  isConnected: boolean;
  isActive: boolean;
  onConnect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  latency?: number;
}) {
  // Format latency for display (backend returns microseconds, convert to ms)
  const latencyMs = latency === undefined ? undefined
    : latency < 0 ? -1
    : Math.round(latency / 1000);
  const latencyDisplay = latencyMs === undefined ? null
    : latencyMs < 0 ? "✗"
    : latencyMs < 1 ? "<1ms"
    : `${latencyMs}ms`;

  const latencyColor = latencyMs === undefined ? ""
    : latencyMs < 0 ? "text-error/50"
    : latencyMs < 50 ? "text-secondary"
    : latencyMs < 200 ? "text-yellow-400"
    : "text-error/70";

  return (
    <div
      onClick={onConnect}
      onContextMenu={onContextMenu}
      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all select-none bg-surface-container-low/30 border border-transparent hover:bg-surface-variant/25 hover:border-outline-variant/10 ${
        isActive
          ? "!bg-primary-dim !border-primary-border !shadow-sm"
          : isConnected
            ? "!bg-secondary-dim !border-secondary-border hover:!bg-secondary-dim/60"
            : ""
      }`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-all ${
        isActive ? "bg-secondary shadow-[0_0_6px_#4de082]" : isConnected ? "bg-secondary/60" : "opacity-0 group-hover:opacity-40 bg-outline"
      }`} />

      {/* Status icon */}
      <div className={`flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0 transition-all ${
        isActive
          ? "bg-secondary/20 text-secondary"
          : isConnected
            ? "bg-secondary/10 text-secondary"
            : "bg-surface-variant/25 text-outline/60 group-hover:text-secondary group-hover:bg-secondary/8"
      }`}>
        <span className="material-symbols-outlined text-[16px]">
          {isActive ? "terminal" : isConnected ? "cloud_done" : "dns"}
        </span>
      </div>

      {/* Name + Host */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className={`text-[12px] font-medium truncate leading-tight ${
          isActive ? "text-on-surface font-semibold" : isConnected ? "text-secondary" : "text-on-surface-variant group-hover:text-on-surface"
        }`}>
          {session.name || session.host}
        </span>
        <span className="text-[11px] font-terminal-mono text-outline/60 truncate mt-0.5">
          {session.user}@{session.host}{session.port !== 22 && session.port !== 23 ? `:${session.port}` : ""}
        </span>
      </div>

      {/* Latency indicator */}
      {latencyDisplay !== null && (
        <span className={`text-[10px] font-terminal-mono tabular-nums ${latencyColor} flex-shrink-0`}>
          {latencyDisplay}
        </span>
      )}
    </div>
  );
}
