import { useCallback, useEffect, useState, useMemo } from "react";
import { Trash2, Edit3, Monitor, Cable, Terminal, Plus } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { SessionConfig } from "@/lib/tauriCommands";
import { useDragSort } from "@/hooks/useDragSort";

// ── Component ────────────────────────────────────────────────────────────

export default function SessionManager() {
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const save = useSessionStore((s) => s.save);
  const remove = useSessionStore((s) => s.remove);
  const reorderSessions = useSessionStore((s) => s.reorder);
  const connect = useSessionStore((s) => s.connect);
  const openConnectDialog = useSessionStore((s) => s.openConnectDialog);
  const tabs = useSessionStore((s) => s.tabs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SessionConfig>>({});

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Drag sort ───────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const groups: Record<string, SessionConfig[]> = {};
    for (const s of sessions) {
      const g = s.group || "Default";
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    }
    return groups;
  }, [sessions]);

  const flatIds = useMemo(
    () => Object.values(grouped).flat().map((s) => s.id),
    [grouped],
  );

  const handleSessionReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || fromIndex >= flatIds.length) return;
      if (toIndex < 0 || toIndex >= flatIds.length) return;
      const ids = [...flatIds];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      reorderSessions(ids);
    },
    [flatIds, reorderSessions],
  );

  const { dragging, dragOver, bindDragItem } = useDragSort(handleSessionReorder);

  // ── Helpers ────────────────────────────────────────────────────────────
  const kindIcon = (k: string) => {
    switch (k) {
      case "ssh": return <Terminal size={12} className="text-[var(--accent)]" />;
      case "serial": return <Cable size={12} className="text-[var(--color-warning)]" />;
      case "telnet": return <Monitor size={12} className="text-[var(--color-info)]" />;
      default: return <Terminal size={12} />;
    }
  };

  const kindLabel = (k: string) => {
    switch (k) {
      case "ssh": return "SSH";
      case "serial": return "Serial";
      case "telnet": return "Telnet";
      default: return k;
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const startEdit = (s: SessionConfig) => {
    setEditingId(s.id);
    setEditForm({ ...s });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const existing = sessions.find((s) => s.id === editingId);
    if (!existing) return;
    await save({ ...existing, ...editForm } as SessionConfig);
    setEditingId(null);
    setEditForm({});
    loadSessions();
  };

  const handleConnect = (session: SessionConfig) => {
    const tabId = `tab-${session.id}-${Date.now()}`;
    connect(tabId, session);
  };

  const handleDelete = async (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s || !confirm(`Delete session "${s.name}"?`)) return;
    await remove(id);
    loadSessions();
  };

  const isConnected = (id: string) =>
    tabs.some((t) => t.session.id === id && t.status === "connected");

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border-subtle)] flex-shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wide mr-auto">
          Sessions
        </span>
        <button
          onClick={openConnectDialog}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-sm transition-colors"
          title="New session"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Terminal size={24} className="opacity-30" />
            <span>No saved sessions</span>
            <span className="text-[10px] opacity-60">Click + to create one</span>
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                {group}
              </div>
              {(() => {
                let flatIdx = 0;
                // Advance past previous groups
                for (const [g, prevItems] of Object.entries(grouped)) {
                  if (g === group) break;
                  flatIdx += prevItems.length;
                }
                return items.map((s) => {
                  const idx = flatIdx++;
                  return (
                    <div key={s.id} className="group">
                      {editingId === s.id ? (
                        /* ── Edit inline ── */
                        <div className="px-2 py-1.5 space-y-1">
                          <input
                            value={editForm.name || ""}
                            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Name"
                            className="w-full px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)]"
                          />
                          <input
                            value={editForm.host || ""}
                            onChange={(e) => setEditForm((p) => ({ ...p, host: e.target.value }))}
                            placeholder="Host"
                            className="w-full px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)]"
                          />
                          <div className="flex gap-1">
                            <button onClick={saveEdit} className="px-2 py-0.5 text-[10px] bg-[var(--accent)] text-white rounded-sm">Save</button>
                            <button onClick={cancelEdit} className="px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-sm">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        /* ── Row ── */
                        <div
                          className={`flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--surface-hover)] transition-colors cursor-grab active:cursor-grabbing group/srow
                            ${dragging === idx ? "opacity-30" : ""}
                            ${dragOver === idx ? "border-t-2 border-t-[var(--accent)]" : ""}`}
                          style={dragOver === idx ? { transform: "translateY(1px)" } : undefined}
                          onDoubleClick={() => handleConnect(s)}
                          title="Double-click to connect"
                          ref={bindDragItem(idx)}
                        >
                          {kindIcon(s.kind)}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-[var(--text-primary)] truncate">{s.name}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                              {s.user && `${s.user}@`}{s.host}{s.port !== 22 && s.port !== 23 ? `:${s.port}` : ""}
                            </div>
                          </div>
                          {isConnected(s.id) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" title="Connected" />
                          )}
                          <div className="flex items-center gap-0 opacity-0 group-hover/srow:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                              title="Edit"
                            >
                              <Edit3 size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
