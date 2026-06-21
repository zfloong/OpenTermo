import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Trash2, Edit3, Monitor, Cable, Terminal,
  ChevronDown, ChevronRight
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionConfig } from "@/lib/tauriCommands";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

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
  const remove = useSessionStore((s) => s.remove);
  const connect = useSessionStore((s) => s.connect);
  const tabs = useSessionStore((s) => s.tabs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SessionConfig>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["Default"]));
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [search, setSearch] = useState("");

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
      const g = s.group || "Default";
      if (!map[g]) map[g] = [];
      map[g].push(s);
    }

    // Sort: Default first, then alphabetical
    const keys = Object.keys(map).sort((a, b) => {
      if (a === "Default") return -1;
      if (b === "Default") return 1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ name: k, path: k, sessions: map[k] }));
  }, [sessions, search]);

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

  const kindIcon = (k: string) => {
    switch (k) {
      case "ssh": return <Terminal size={13} className="text-[var(--accent)]" />;
      case "serial": return <Cable size={13} className="text-[var(--color-warning)]" />;
      case "telnet": return <Monitor size={13} className="text-[var(--color-info)]" />;
      default: return <Terminal size={13} />;
    }
  };

  const handleConnect = (s: SessionConfig) => {
    connect(`tab-${s.id}-${Date.now()}`, s);
  };

  const handleDelete = async (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s || !confirm(`删除会话 "${s.name || s.host}"?`)) return;
    await remove(id);
    loadSessions();
  };

  const startEdit = (s: SessionConfig) => {
    setEditingId(s.id);
    setEditForm({ ...s });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const existing = sessions.find((s) => s.id === editingId);
    if (!existing) return;
    await save({ ...existing, ...editForm } as SessionConfig);
    setEditingId(null);
    setEditForm({});
    loadSessions();
  };

  const sessionCtx = (s: SessionConfig): (ContextMenuItem | null)[] => [
    { label: "连接", icon: <Terminal size={13} />, onClick: () => handleConnect(s) },
    { label: "编辑", icon: <Edit3 size={13} />, onClick: () => startEdit(s) },
    null,
    { label: "删除", icon: <Trash2 size={13} />, onClick: () => handleDelete(s.id), danger: true },
  ];

  const showCtx = (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ items, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus-within:border-[var(--accent)]/50 transition-colors">
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
      <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2 space-y-2">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-[var(--text-muted)]">
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
                  <div className="border-t border-[var(--border-subtle)]">
                    {group.sessions.map((s) => (
                      <div key={s.id}>
                        {editingId === s.id ? (
                          <div className="px-4 py-2.5 space-y-2">
                            <input
                              value={editForm.name || ""}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="名称"
                              className="w-full px-2.5 py-1.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-md outline-none focus:border-[var(--accent)]"
                            />
                            <input
                              value={editForm.host || ""}
                              onChange={(e) => setEditForm((p) => ({ ...p, host: e.target.value }))}
                              placeholder="主机"
                              className="w-full px-2.5 py-1.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-md outline-none focus:border-[var(--accent)]"
                            />
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-md hover:brightness-110 transition-all">保存</button>
                              <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md transition-colors">取消</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer group/srow ${
                              isConnected(s.id)
                                ? "bg-[var(--surface-selected)] hover:bg-[var(--surface-selected)]"
                                : "hover:bg-[var(--surface-hover)]"
                            }`}
                            onClick={() => handleConnect(s)}
                            onContextMenu={(e) => showCtx(e, sessionCtx(s))}
                          >
                            {/* Icon + connected indicator */}
                            <div className="relative shrink-0">
                              {kindIcon(s.kind)}
                              {isConnected(s.id) && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 ring-1 ring-[var(--bg-surface)]" />
                              )}
                            </div>

                            {/* Name + host */}
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm truncate ${isConnected(s.id) ? "text-[var(--accent)] font-medium" : "text-[var(--text-primary)]"}`}>
                                {s.name || s.host}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                {s.user && `${s.user}@`}{s.host}{s.port !== 22 && s.port !== 23 ? `:${s.port}` : ""}
                              </div>
                            </div>

                            {/* Hover actions */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/srow:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
                                title="编辑"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
                                title="删除"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
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
