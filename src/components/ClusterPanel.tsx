import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "@/stores/sessionStore";
import type { Cluster, SessionConfig } from "@/lib/tauriCommands";
import { listClusters, saveCluster, deleteCluster, pingHost, clusterUpload, clusterDownload } from "@/lib/tauriCommands";
import FileTransferDialog from "@/components/FileTransferDialog";

/** Display width: CJK chars = 2, ASCII = 1 */
function dispLen(s: string): number {
  return [...s].reduce((n, c) => n + (c > '\u00ff' ? 2 : 1), 0);
}
function padDisp(s: string, len: number): string {
  return s + '\u00a0'.repeat(Math.max(0, len - dispLen(s)));
}
function cleanOutput(text: string, cmd: string): string {
  const lines = text.split("\n");
  // Remove leading command echo (first line matches the command)
  if (lines.length > 0 && lines[0].trim() === cmd.trim()) {
    lines.shift();
  }
  // Remove trailing prompt: user@host:path$ or #
  const last = lines[lines.length - 1]?.trim();
  if (last && (last.endsWith("$") || last.endsWith("#")) && last.includes("@")) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

export default function ClusterPanel({ onViewChange }: { onViewChange?: (v: "terminal" | "cluster") => void }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdResults, setCmdResults] = useState<{ cluster: string; results: { name: string; host?: string; status: string; tabId?: string }[]; cmd: string } | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const outputRef = useRef<Record<string, string>>({});
  const unlistenRef = useRef<(() => void)[]>([]);
  const [latency, setLatency] = useState<Record<string, number>>({});
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [fileResults, setFileResults] = useState<string[] | null>(null);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [localFilePath, setLocalFilePath] = useState("");
  const [remoteFilePath, setRemoteFilePath] = useState("");
  const sessions = useSessionStore((s) => s.sessions);
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const connect = useSessionStore((s) => s.connect);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);

  const load = useCallback(async () => {
    const list = await listClusters();
    setClusters(list);
    if (list.length > 0 && !selectedCluster) setSelectedCluster(list[0].id);
  }, [selectedCluster]);

  useEffect(() => { load(); }, []);

  // Ping all unique hosts for latency
  useEffect(() => {
    if (clusters.length === 0) return;
    const hosts = [...new Set(sessions.filter((s) => clusters.some((c) => c.session_ids.includes(s.id))).map((s) => s.host))];
    (async () => {
      const results: Record<string, number> = {};
      for (const host of hosts) {
        try { results[host] = await pingHost(host); } catch { results[host] = -1; }
      }
      setLatency(results);
    })();
  }, [clusters, sessions]);

  const active = clusters.find((c) => c.id === selectedCluster);
  const activeSessions = useMemo(() =>
    sessions.filter((s) => active?.session_ids.includes(s.id)),
  [sessions, active]);

  const handleBatchCommand = async () => {
    if (!cmdInput.trim() || !active) return;
    // Clean up old listeners
    for (const un of unlistenRef.current) un();
    unlistenRef.current = [];
    outputRef.current = {};
    setOutputs({});

    const sendResults: { name: string; host?: string; status: string; tabId?: string }[] = [];
    for (const s of activeSessions) {
      const existing = tabs.find((t) => t.session.id === s.id);
      if (existing && existing.status === "connected") {
        const tabId = existing.id;
        // Listen for terminal output from this tab
        outputRef.current[tabId] = "";
        // Start listening BEFORE sending to not miss any output
        const unlisten = await listen<string>(`terminal-output:${tabId}`, (event) => {
          const clean = event.payload
            .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
            .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, "")
            .replace(/\u001b\([0-9A-Z]/g, "")
            .replace(/\]\d+;[ \t]*/g, "")
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
          if (!clean) return;
          outputRef.current[tabId] = (outputRef.current[tabId] || "") + clean;
          if (outputRef.current[tabId].length > 10000) {
            outputRef.current[tabId] = outputRef.current[tabId].slice(-5000);
          }
          setOutputs({ ...outputRef.current });
        });
        unlistenRef.current.push(unlisten);
        // Send keystrokes to terminal (after listener is confirmed active)
        useSessionStore.getState().sendInput(tabId, cmdInput.trim() + "\n");
        useSessionStore.getState().triggerScroll(tabId);
        sendResults.push({ name: s.name || s.host, host: s.host, status: "已发送", tabId });
      } else {
        sendResults.push({ name: s.name || s.host, host: s.host, status: "✗ 未连接" });
      }
    }
    setCmdResults({ cluster: active.name, results: sendResults, cmd: cmdInput.trim() });
    setCmdInput("");
  };

  // Clean up listeners on unmount
  useEffect(() => {
    return () => { for (const un of unlistenRef.current) un(); };
  }, []);

  const openNewCluster = () => { setEditCluster(null); setShowManage(true); };
  const openEditCluster = (c: Cluster) => { setEditCluster(c); setShowManage(true); };

  const handleDelete = async (id: string) => {
    if (!confirm("删除此集群？")) return;
    await deleteCluster(id);
    if (selectedCluster === id) setSelectedCluster(null);
    load();
  };

  const handleFileUpload = async () => {
    if (!active || activeSessions.length === 0 || !localFilePath) return;
    const fileName = localFilePath.split("\\").pop() || localFilePath.split("/").pop() || "file";
    const remotePath = remoteFilePath.endsWith("/") || remoteFilePath.endsWith("\\") ? remoteFilePath + fileName : remoteFilePath;
    const targets: [string, number, string, string, string][] = [];
    for (const s of activeSessions) {
      const existing = tabs.find((t) => t.session.id === s.id);
      if (existing && existing.status === "connected") {
        targets.push([s.host, s.port, s.user, s.private_key_path, remotePath]);
      }
    }
    if (targets.length === 0) { setFileResults(["没有已连接的服务器"]); return; }
    const results = await clusterUpload(localFilePath, targets);
    setFileResults(results);
  };

  const handleFileDownload = async () => {
    if (!active || activeSessions.length === 0 || !remoteFilePath) return;
    const targets: [string, number, string, string, string, string][] = [];
    for (const s of activeSessions) {
      const existing = tabs.find((t) => t.session.id === s.id);
      if (existing && existing.status === "connected") {
        const localName = `${s.name || s.host}_${remoteFilePath.split("/").pop() || "file"}`;
        targets.push([s.host, s.port, s.user, s.private_key_path, remoteFilePath, localName]);
      }
    }
    if (targets.length === 0) { setFileResults(["没有已连接的服务器"]); return; }
    const results = await clusterDownload(targets);
    setFileResults(results);
  };

  const handleSave = async (c: Cluster) => {
    await saveCluster(c);
    setShowManage(false);
    load();
  };

  const formatLatency = (us: number) => {
    if (us < 0) return "✗";
    const ms = Math.round(us / 1000);
    return ms < 1 ? "<1ms" : `${ms}ms`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[20px]">dns</span>
          <span className="text-sm font-bold text-on-surface">集群</span>
        </div>
        <button onClick={openNewCluster} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors text-xs font-medium">
          <span className="material-symbols-outlined text-[14px]">add</span>
          新建集群
        </button>
      </div>

      {/* Cluster tabs */}
      {clusters.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-outline-variant/10 overflow-x-auto">
          {clusters.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCluster(c.id)}
              onContextMenu={(e) => { e.preventDefault(); openEditCluster(c); }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedCluster === c.id
                  ? "bg-secondary/15 text-secondary border border-secondary/20"
                  : "text-outline hover:text-on-surface hover:bg-surface-variant/20 border border-transparent"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">dns</span>
              {c.name}
              <span className="text-[10px] text-outline/50 ml-1">{c.session_ids.length}</span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="ml-1 text-outline/30 hover:text-error transition-colors">
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </button>
          ))}
        </div>
      )}

      {!active ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-outline/40">
          <span className="material-symbols-outlined text-[48px]">dns</span>
          <span className="text-sm">暂无集群</span>
          <button onClick={openNewCluster} className="px-4 py-2 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors text-xs font-medium">
            创建第一个集群
          </button>
        </div>
      ) : (
        /* Cluster detail */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Server cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeSessions.map((s) => {
              const us = latency[s.host];
              const isConnected = tabs.some((t) => t.session.id === s.id && t.status === "connected");
              const isActive = tabs.some((t) => t.session.id === s.id && t.id === activeTabId);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/10 hover:bg-surface-variant/20 transition-all cursor-pointer"
                  onClick={() => {
                    const existing = tabs.find((t) => t.session.id === s.id);
                    if (existing) useSessionStore.getState().setActiveTab(existing.id);
                    else connect(`tab-${s.id}-${Date.now()}`, s);
                  }}
                >
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                    isActive ? "bg-secondary/20 text-secondary" : isConnected ? "bg-secondary/10 text-secondary" : "bg-surface-variant/30 text-outline"
                  }`}>
                    <span className="material-symbols-outlined text-[18px]">{isActive ? "terminal" : isConnected ? "cloud_done" : "dns"}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-on-surface truncate">{s.name || s.host}</div>
                    <div className="text-[10px] font-terminal-mono text-outline/60 truncate">{s.host}</div>
                  </div>
                  <div className={`text-[10px] font-terminal-mono tabular-nums ${
                    us === undefined ? "text-outline/30" : us < 0 ? "text-error/50" : us < 50000 ? "text-secondary" : us < 200000 ? "text-yellow-400" : "text-error/70"
                  }`}>
                    {us === undefined ? "..." : formatLatency(us)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Batch command */}
          <div className="rounded-xl bg-surface-container-low/40 border border-outline-variant/10 p-4">
            <div className="text-xs font-bold text-on-surface mb-2">批量命令</div>
            <div className="flex gap-2">
              <input
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleBatchCommand(); }}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-primary/50 font-terminal-mono"
                placeholder="输入要批量执行的命令..."
              />
              <button
                onClick={handleBatchCommand}
                disabled={!cmdInput.trim()}
                className="px-4 py-2 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
              >
                发送
              </button>
              <button
                onClick={() => {
                  for (const s of activeSessions) {
                    const existing = tabs.find((t) => t.session.id === s.id);
                    if (existing && existing.status === "connected") {
                      useSessionStore.getState().sendInput(existing.id, "\x03");
                    }
                  }
                }}
                className="px-3 py-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors text-xs font-medium"
                title="发送 Ctrl+C 中断当前命令"
              >
                停止
              </button>
              <button
                onClick={() => { setLocalFilePath(""); setRemoteFilePath("/root/"); setFileDialogOpen(true); }}
                className="px-3 py-2 rounded-lg bg-surface-variant/40 text-outline hover:text-on-surface hover:bg-surface-variant/60 transition-colors text-xs font-medium"
                title="文件传输"
              >
                <span className="material-symbols-outlined text-[14px] align-middle mr-0.5">folder_open</span>
                文件
              </button>
            </div>
            {cmdResults && cmdResults.cluster === active.name && (
              <div className="mt-3 space-y-2">
                <div className="text-[10px] font-terminal-mono text-outline/50 px-2 py-1 rounded bg-surface-container-lowest/50">$ {cmdResults.cmd}</div>
                {cmdResults.results.map((r, i) => {
                const names = cmdResults.results.map(x=>dispLen(x.name));
                const ips = cmdResults.results.map(x=>dispLen(x.host||""));
                const maxN = Math.max(...names);
                const maxI = Math.max(...ips);
                return (
                  <div key={i} className="rounded-lg bg-surface-container-lowest/30 border border-outline-variant/10 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-outline-variant/10">
                      <div className="flex items-center gap-2 text-xs font-terminal-mono">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.tabId && outputs[r.tabId] ? "bg-secondary" : r.status === "已发送" ? "bg-secondary animate-pulse" : "bg-outline/30"}`} />
                        <span className="text-on-surface">{padDisp(r.name, maxN)}</span>
                        {r.host && <span className="text-outline/50">{padDisp(r.host, maxI)}</span>}
                      </div>
                      <span className="text-[10px] text-outline/50">{r.tabId && outputs[r.tabId] ? "✓ 已返回" : r.status}</span>
                    </div>
                    {r.tabId && outputs[r.tabId] && (
                      <div className="max-h-32 overflow-y-auto p-2 font-terminal-mono text-[11px] leading-relaxed text-on-surface/80 whitespace-pre-wrap break-all">
                        {cleanOutput(outputs[r.tabId], cmdResults.cmd)}
                      </div>
                    )}
                  </div>
                );})}
              </div>
            )}
          </div>
          {fileResults && (
              <div className="mt-2 space-y-1">
                {fileResults.map((r, i) => (
                  <div key={i} className={`text-[10px] font-terminal-mono ${r.includes("✓") ? "text-secondary" : "text-error/70"}`}>{r}</div>
                ))}
              </div>
            )}
          </div>
      )}

      {/* Manage dialog */}
      {showManage && (
        <ClusterManageDialog
          cluster={editCluster}
          sessions={sessions}
          onSave={handleSave}
          onClose={() => setShowManage(false)}
        />
      )}
      {fileDialogOpen && <FileTransferDialog
        localPath={localFilePath}
        setLocalPath={setLocalFilePath}
        remotePath={remoteFilePath}
        setRemotePath={setRemoteFilePath}
        onUpload={() => { setFileDialogOpen(false); handleFileUpload(); }}
        onDownload={() => { setFileDialogOpen(false); handleFileDownload(); }}
        onClose={() => setFileDialogOpen(false)}
        sessions={activeSessions}
        tabs={tabs}
      />}
    </div>
  );
}

/* ── Cluster Manage Dialog ── */
function ClusterManageDialog({
  cluster,
  sessions,
  onSave,
  onClose,
}: {
  cluster: Cluster | null;
  sessions: SessionConfig[];
  onSave: (c: Cluster) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(cluster?.name || "");
  const [selected, setSelected] = useState<Set<string>>(new Set(cluster?.session_ids || []));

  const toggleSession = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave({
      id: cluster?.id || crypto.randomUUID(),
      name: name.trim(),
      session_ids: [...selected],
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        <div className="px-5 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">{cluster ? "编辑集群" : "新建集群"}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-variant/30 transition-all">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5">集群名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low border-outline-variant/20 text-sm text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-secondary/50"
              placeholder="例如：生产环境"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5">选择服务器 ({selected.size} 台)</label>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {sessions.length === 0 ? (
                <div className="text-xs text-outline/40 py-4 text-center">暂无保存的会话</div>
              ) : (
                sessions.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      selected.has(s.id) ? "bg-secondary/10 border border-secondary/20" : "hover:bg-surface-variant/20 border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSession(s.id)}
                      className="rounded accent-secondary"
                    />
                    <span className="flex-1 text-xs text-on-surface truncate">{s.name || s.host}</span>
                    <span className="text-[10px] font-terminal-mono text-outline/50">{s.host}:{s.port}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-outline-variant/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs text-outline hover:text-on-surface transition-colors">取消</button>
          <button onClick={handleSave} disabled={!name.trim() || selected.size === 0} className="px-4 py-2 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
