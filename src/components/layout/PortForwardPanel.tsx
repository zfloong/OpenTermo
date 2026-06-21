import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Plus, Trash2, ArrowLeftRight, Wifi, Globe } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import {
  portForwardStart,
  portForwardStop,
  portForwardList,
  type PortForwardConfig,
  type PortForwardInfo,
} from "@/lib/tauriCommands";

// ── Component ────────────────────────────────────────────────────────────

export default function PortForwardPanel() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [forwards, setForwards] = useState<PortForwardInfo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [fKind, setFKind] = useState("local");
  const [fName, setFName] = useState("");
  const [fBindPort, setFBindPort] = useState("");
  const [fHost, setFHost] = useState("");
  const [fHostPort, setFHostPort] = useState("");

  const isConnected = activeTab?.status === "connected" && activeTab?.session.kind === "ssh";

  // ── Load / refresh ──────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    if (!activeTabId) return;
    portForwardList(activeTabId).then(setForwards).catch(() => {});
  }, [activeTabId]);

  useEffect(() => {
    if (isConnected) refresh();
    else setForwards([]);
  }, [isConnected, activeTabId, refresh]);

  // ── Event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTabId) return;
    const uls: UnlistenFn[] = [];

    listen<PortForwardInfo>(`forward-started:${activeTabId}`, () => {
      refresh();
    }).then((fn) => uls.push(fn));

    listen<PortForwardInfo>(`forward-stopped:${activeTabId}`, () => {
      refresh();
    }).then((fn) => uls.push(fn));

    return () => { uls.forEach((f) => f()); };
  }, [activeTabId, refresh]);

  // ── Actions ────────────────────────────────────────────────────────────
  const add = useCallback(async () => {
    if (!activeTabId || !fBindPort) return;
    setError("");

    const cfg: PortForwardConfig = {
      kind: fKind,
      name: fName || `${fBindPort}→${fHost}:${fHostPort}`,
      bind_addr: "127.0.0.1",
      bind_port: parseInt(fBindPort, 10),
      host: fHost || "localhost",
      host_port: fHostPort ? parseInt(fHostPort, 10) : 0,
    };

    try {
      await portForwardStart(activeTabId, cfg);
      setShowAdd(false);
      setFName("");
      setFBindPort("");
      setFHost("");
      setFHostPort("");
      refresh();
    } catch (e: any) {
      setError(String(e));
    }
  }, [activeTabId, fKind, fName, fBindPort, fHost, fHostPort, refresh]);

  const stop = useCallback(
    async (id: string) => {
      if (!activeTabId) return;
      try {
        await portForwardStop(activeTabId, id);
        refresh();
      } catch (e: any) {
        setError(String(e));
      }
    },
    [activeTabId, refresh],
  );

  // ── Helpers ────────────────────────────────────────────────────────────
  const kindIcon = (k: string) => {
    switch (k) {
      case "local": return <ArrowLeftRight size={12} className="text-[var(--accent)]" />;
      case "dynamic": return <Globe size={12} className="text-[var(--color-warning)]" />;
      default: return <Wifi size={12} />;
    }
  };

  const kindLabel = (k: string) => {
    switch (k) {
      case "local": return "-L";
      case "dynamic": return "-D";
      case "remote": return "-R";
      default: return k;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border-subtle)] flex-shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wide mr-auto">
          Port Forwarding
        </span>
        <button
          onClick={() => setShowAdd((v) => !v)}
          disabled={!isConnected}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-sm transition-colors disabled:opacity-30"
          title="Add forward"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-2 py-2 border-b border-[var(--border-subtle)] flex-shrink-0 space-y-1.5">
          <div className="flex gap-1">
            <select
              value={fKind}
              onChange={(e) => setFKind(e.target.value)}
              className="w-20 px-1 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none"
            >
              <option value="local">本地 (-L)</option>
              <option value="dynamic">动态 (-D)</option>
            </select>
            <input
              placeholder="Name (optional)"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              className="flex-1 px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)]"
            />
          </div>
          <div className="flex gap-1">
            <div className="flex items-center gap-0.5 flex-1">
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">绑定:</span>
              <input
                placeholder="port"
                value={fBindPort}
                onChange={(e) => setFBindPort(e.target.value.replace(/\D/g, ""))}
                className="flex-1 px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)] w-16"
              />
            </div>
            {fKind === "local" && (
              <>
                <span className="text-[10px] text-[var(--text-muted)] self-center">→</span>
                <input
                  placeholder="host"
                  value={fHost}
                  onChange={(e) => setFHost(e.target.value)}
                  className="flex-1 px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)]"
                />
                <span className="text-[10px] text-[var(--text-muted)] self-center">:</span>
                <input
                  placeholder="port"
                  value={fHostPort}
                  onChange={(e) => setFHostPort(e.target.value.replace(/\D/g, ""))}
                  className="w-16 px-1.5 py-0.5 text-[11px] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-sm outline-none focus:border-[var(--border-focus)]"
                />
              </>
            )}
          </div>
          {error && <div className="text-[10px] text-[var(--color-danger)]">{error}</div>}
          <div className="flex gap-1">
            <button
              onClick={add}
              className="px-2 py-0.5 text-[10px] bg-[var(--accent)] text-white rounded-sm hover:opacity-90 transition-opacity"
            >
              Start
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(""); }}
              className="px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Forward list */}
      <div className="flex-1 overflow-y-auto">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Wifi size={24} className="opacity-30" />
            <span>连接到 SSH 会话以管理端口转发</span>
          </div>
        ) : forwards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-1.5 text-[11px] text-[var(--text-muted)]">
            <ArrowLeftRight size={24} className="opacity-30" />
            <span>无活跃转发</span>
            <span className="text-[10px] opacity-60">点击 + 添加本地或动态转发</span>
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-surface)]">
                <th className="w-6" />
                <th className="text-left py-1 px-2 text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">名称</th>
                <th className="text-left py-1 px-2 text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">绑定</th>
                <th className="text-left py-1 px-2 text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">目标</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {forwards.map((fw) => (
                <tr key={fw.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="pl-2 py-[3px]">{kindIcon(fw.kind)}</td>
                  <td className="px-2 text-[var(--text-primary)] truncate max-w-[100px]">
                    <span className="text-[10px] text-[var(--text-muted)] mr-1">{kindLabel(fw.kind)}</span>
                    {fw.name}
                  </td>
                  <td className="px-2 text-[var(--text-secondary)] font-mono text-[10px]">
                    {fw.bind_addr}:{fw.bind_port}
                  </td>
                  <td className="px-2 text-[var(--text-secondary)] font-mono text-[10px]">
                    {fw.kind === "dynamic" ? "SOCKS5" : `${fw.host}:${fw.host_port}`}
                  </td>
                  <td className="pr-2">
                    <button
                      onClick={() => stop(fw.id)}
                      className="p-0.5 text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
                      title="Stop forward"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
