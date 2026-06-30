import { useEffect, useState, useCallback } from "react";
import type { FileEntry, SessionConfig } from "@/lib/tauriCommands";
import { listLocalDir, clusterExec } from "@/lib/tauriCommands";

interface FileTransferDialogProps {
  localPath: string;
  setLocalPath: (p: string) => void;
  remotePath: string;
  setRemotePath: (p: string) => void;
  onUpload: () => void;
  onDownload: () => void;
  onClose: () => void;
  sessions: SessionConfig[];
  tabs: { id: string; session: SessionConfig; status: string }[];
}

export default function FileTransferDialog({
  localPath, setLocalPath,
  remotePath, setRemotePath,
  onUpload, onDownload, onClose,
  sessions, tabs,
}: FileTransferDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-[70vh] bg-[#1a1a1a] border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">文件传输</h2>
          <div className="flex items-center gap-3 text-[10px] text-outline/50">
            <span>选本地文件 → 上传到服务器</span>
            <span>选远程文件 → 下载到本机</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-variant/30 transition-all">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Split panels */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col border-r border-outline-variant/10">
            <LocalPanel path={localPath} onSelect={(p) => { setLocalPath(p); }} />
          </div>
          <div className="flex-1 flex flex-col">
            <RemotePanel
              path={remotePath}
              onSelect={(p) => { setRemotePath(p); }}
              sessions={sessions}
              tabs={tabs}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-outline-variant/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-outline/70 truncate">
            <span>{localPath || "—"}</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            <span>{remotePath || "—"}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onUpload} disabled={!localPath} className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium">上传 ↑</button>
            <button onClick={onDownload} disabled={!remotePath} className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium">下载 ↓</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isDriveRoot(p: string) { return /^[A-Z]:\\$/i.test(p); }

/* ── Local panel ── */
function LocalPanel({ path, onSelect }: { path: string; onSelect: (p: string) => void }) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [drives, setDrives] = useState<string[]>([]);
  const [showDrives, setShowDrives] = useState(true);

  const loadDir = useCallback(async (dir: string) => {
    try {
      const items = await listLocalDir(dir);
      setEntries(items);
      setCurrentPath(dir);
      setShowDrives(false);
      onSelect(dir);
    } catch { /* ignore */ }
  }, [onSelect]);

  // Init: detect drives
  useEffect(() => {
    (async () => {
      const d: string[] = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ":\\";
        try { await listLocalDir(letter); d.push(letter); } catch {}
      }
      setDrives(d);
      if (path) loadDir(path);
    })();
  }, []);

  const goUp = () => {
    const p = currentPath.replace(/\\$/, "");
    const parent = p.substring(0, p.lastIndexOf("\\"));
    if (!parent) { setShowDrives(true); setCurrentPath(""); return; }
    loadDir(parent + "\\");
  };

  return (
    <>
      <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-outline-variant/10 bg-surface-container-low/20">
        <span className="material-symbols-outlined text-[14px] text-outline/50">computer</span>
        <span className="text-[10px] font-terminal-mono text-outline/70 truncate flex-1 select-all">{currentPath || "选择驱动器"}</span>
        {!showDrives && <button onClick={goUp} className="text-[10px] text-outline/50 hover:text-on-surface px-1">↑</button>}
      </div>
      <div className="flex-1 overflow-y-auto font-terminal-mono text-[11px]">
        {showDrives && (
          <div className="px-2 py-1 space-y-0.5">
            <div className="text-[9px] text-outline/30 uppercase tracking-wider px-2 pt-1 pb-0.5">驱动器</div>
            {drives.length === 0 && <div className="text-[10px] text-outline/30 text-center py-8">正在检测...</div>}
            {drives.map((d) => (
              <button key={d} onClick={() => loadDir(d)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-variant/20 transition-colors text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] text-yellow-500">storage</span>
                <span>{d}</span>
              </button>
            ))}
          </div>
        )}
        {!showDrives && (
          <div className="px-2 py-1 space-y-0.5">
            <button onClick={goUp}
              className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-variant/20 transition-colors text-outline/60">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              <span>..</span>
            </button>
            {entries.map((e) => (
              <button key={e.name} onClick={() => e.is_dir ? loadDir(currentPath + e.name + "\\") : onSelect(currentPath + e.name)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-variant/20 transition-colors ${!e.is_dir && (currentPath + e.name) === path ? "bg-secondary/10 text-secondary" : "text-on-surface-variant"}`}>
                <span className={`material-symbols-outlined text-[14px] ${e.is_dir ? "text-yellow-500" : "text-outline/50"}`}>
                  {e.is_dir ? "folder" : "description"}
                </span>
                <span className="truncate flex-1">{e.name}</span>
                {!e.is_dir && <span className="text-[9px] text-outline/30">{fmtSize(e.size)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Remote panel ── */
function RemotePanel({ path, onSelect, sessions, tabs }: {
  path: string; onSelect: (p: string) => void;
  sessions: SessionConfig[]; tabs: { id: string; session: SessionConfig; status: string }[];
}) {
  const [entries, setEntries] = useState<{ name: string; is_dir: boolean }[]>([]);
  const [currentPath, setCurrentPath] = useState(path || "/root");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError("");
    const tab = tabs.find((t) => t.status === "connected");
    if (!tab) { setError("没有已连接的服务器，请先在终端连接"); setLoading(false); return; }
    try {
      const outputs = await clusterExec([tab.id], `ls -1ap "${dir.replace(/"/g, '\\"')}" 2>/dev/null`);
      const out = outputs[0] || "";
      const lines = out.split("\n").filter(Boolean);
      const items = lines
        .filter((l) => l !== "./" && l !== "../" && !l.startsWith("total "))
        .map((l) => ({ name: l.replace(/[@*|=]$/, ""), is_dir: l.endsWith("/") }));
      setEntries(items);
      setCurrentPath(dir);
      onSelect(dir);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, [tabs, onSelect]);

  useEffect(() => { if (path) load(path); }, [load, path]);

  const goUp = () => {
    const p = currentPath.replace(/\/$/, "");
    const parent = p.substring(0, p.lastIndexOf("/")) || "/";
    load(parent);
  };

  return (
    <>
      <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-outline-variant/10 bg-surface-container-low/20">
        <span className="material-symbols-outlined text-[14px] text-outline/50">dns</span>
        <span className="text-[10px] font-terminal-mono text-outline/70 truncate flex-1 select-all">{currentPath}</span>
        {currentPath !== "/" && <button onClick={goUp} className="text-[10px] text-outline/50 hover:text-on-surface px-1">↑</button>}
      </div>
      <div className="flex-1 overflow-y-auto font-terminal-mono text-[11px]">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[10px] text-outline/30">加载中...</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[10px] text-outline/30 px-4 text-center">
            <span className="material-symbols-outlined text-[24px] text-outline/20">cloud_off</span>
            <span>{error}</span>
          </div>
        ) : (
          <div className="px-2 py-1 space-y-0.5">
            {currentPath !== "/" && (
              <button onClick={goUp} className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-variant/20 transition-colors text-outline/60">
                <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                <span>..</span>
              </button>
            )}
            {entries.map((e) => (
              <button key={e.name} onClick={() => e.is_dir ? load(currentPath + "/" + e.name) : onSelect(currentPath + "/" + e.name)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-variant/20 transition-colors ${!e.is_dir && (currentPath + "/" + e.name) === path ? "bg-secondary/10 text-secondary" : "text-on-surface-variant"}`}>
                <span className={`material-symbols-outlined text-[14px] ${e.is_dir ? "text-yellow-500" : "text-outline/50"}`}>
                  {e.is_dir ? "folder" : "description"}
                </span>
                <span className="truncate flex-1">{e.name.replace(/\/$/, "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
