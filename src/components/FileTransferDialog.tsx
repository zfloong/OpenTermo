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
  const connectedTabs = tabs.filter((t) => t.status === "connected");
  const [selectedTabId, setSelectedTabId] = useState(
    connectedTabs.length > 0 ? connectedTabs[0].id : ""
  );
  const selectedTab = connectedTabs.find((t) => t.id === selectedTabId);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-[70vh] bg-surface border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-on-surface">文件传输</h2>
          <div className="flex items-center gap-3 text-[10px] text-outline/50">
            <span className="flex items-center gap-1"><span className="text-secondary">●</span> 选本地文件 → 上传</span>
            <span className="flex items-center gap-1"><span className="text-primary">●</span> 选远程文件 → 下载</span>
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
              connectedTabs={connectedTabs}
              selectedTabId={selectedTabId}
              onTabChange={setSelectedTabId}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-outline-variant/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-outline/70 truncate min-w-0 flex-1">
            <span className="flex items-center gap-1 truncate">
              <span className="material-symbols-outlined text-[14px] text-secondary flex-shrink-0">computer</span>
              <span className="truncate">{localPath || "未选择"}</span>
            </span>
            <span className="material-symbols-outlined text-[14px] text-outline/40 flex-shrink-0">arrow_forward</span>
            <span className="flex items-center gap-1 truncate">
              <span className="material-symbols-outlined text-[14px] text-primary flex-shrink-0">dns</span>
              {selectedTab && <span className="text-secondary/70 flex-shrink-0 font-mono text-[10px]">{selectedTab.session.name || selectedTab.session.host}:</span>}
              <span className="truncate">{remotePath || "未选择"}</span>
            </span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={onUpload} disabled={!localPath}
              className="px-4 py-1.5 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">upload</span>
              上传
            </button>
            <button onClick={onDownload} disabled={!remotePath}
              className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">download</span>
              下载
            </button>
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
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-outline-variant/10 bg-surface-container-low/30">
        <span className="material-symbols-outlined text-[16px] text-secondary">computer</span>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-outline/40 uppercase tracking-wider font-medium mb-0.5">本机</div>
          <div className="text-[11px] font-terminal-mono text-on-surface truncate select-all">{currentPath || <span className="text-outline/40">选择驱动器</span>}</div>
        </div>
        {!showDrives && (
          <button onClick={goUp}
            className="w-6 h-6 rounded flex items-center justify-center text-outline/50 hover:text-on-surface hover:bg-surface-variant/30 transition-all"
            title="上一级">
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {showDrives && (
          <div className="py-1">
            <div className="px-3 py-1.5 text-[9px] text-outline/30 uppercase tracking-wider font-medium">驱动器</div>
            {drives.length === 0 && <div className="text-[10px] text-outline/30 text-center py-12">正在检测...</div>}
            {drives.map((d) => (
              <button key={d} onClick={() => loadDir(d)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-variant/20 transition-colors text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-yellow-500">storage</span>
                <span className="text-[12px] font-medium">{d}</span>
                <span className="text-[9px] text-outline/30 ml-auto">本地磁盘</span>
              </button>
            ))}
          </div>
        )}
        {!showDrives && (
          <div className="py-1">
            {entries.map((e) => (
              <button key={e.name} onClick={() => e.is_dir ? loadDir(currentPath + e.name + "\\") : onSelect(currentPath + e.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-none transition-colors hover:bg-surface-variant/20 ${
                  !e.is_dir && (currentPath + e.name) === path
                    ? "bg-secondary/10 text-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}>
                <span className={`material-symbols-outlined text-[18px] ${e.is_dir ? "text-yellow-500" : "text-outline/50"}`}>
                  {e.is_dir ? "folder" : "description"}
                </span>
                <span className="text-[12px] truncate flex-1 text-left">{e.name}</span>
                {!e.is_dir && <span className="text-[9px] text-outline/30 font-mono">{fmtSize(e.size)}</span>}
                {e.is_dir && <span className="text-[9px] text-outline/20">文件夹</span>}
              </button>
            ))}
            {entries.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-outline/30">
                <span className="material-symbols-outlined text-[28px]">folder_open</span>
                <span className="text-[10px]">空目录</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Remote panel ── */
function RemotePanel({ path, onSelect, connectedTabs, selectedTabId, onTabChange }: {
  path: string; onSelect: (p: string) => void;
  connectedTabs: { id: string; session: SessionConfig; status: string }[];
  selectedTabId: string;
  onTabChange: (tabId: string) => void;
}) {
  const [entries, setEntries] = useState<{ name: string; is_dir: boolean }[]>([]);
  const [currentPath, setCurrentPath] = useState(path || "/root");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError("");
    const tab = connectedTabs.find((t) => t.id === selectedTabId);
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
  }, [connectedTabs, selectedTabId, onSelect]);

  useEffect(() => { if (path) load(path); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, selectedTabId]);

  const goUp = () => {
    const p = currentPath.replace(/\/$/, "");
    const parent = p.substring(0, p.lastIndexOf("/")) || "/";
    load(parent);
  };

  const selectedTab = connectedTabs.find((t) => t.id === selectedTabId);

  return (
    <>
      <div className="flex-shrink-0 border-b border-outline-variant/10">
        {/* Server tabs */}
        {connectedTabs.length > 1 && (
          <div className="flex items-center gap-0.5 px-2 pt-2 pb-0 overflow-x-auto">
            {connectedTabs.map((t) => (
              <button key={t.id} onClick={() => onTabChange(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded-t-lg border border-b-0 transition-all whitespace-nowrap ${
                  t.id === selectedTabId
                    ? "bg-surface-container-low text-secondary border-outline-variant/30 font-medium"
                    : "bg-surface-variant/20 text-outline/60 border-transparent hover:text-on-surface hover:bg-surface-variant/30"
                }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0" />
                {t.session.name || t.session.host}
              </button>
            ))}
          </div>
        )}
        {/* Path bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-container-low/30">
          <span className="material-symbols-outlined text-[16px] text-secondary">dns</span>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] text-outline/40 uppercase tracking-wider font-medium mb-0.5">
              远程服务器 {selectedTab ? `· ${selectedTab.session.name || selectedTab.session.host}` : ""}
            </div>
            <div className="text-[11px] font-terminal-mono text-on-surface truncate select-all">{currentPath}</div>
          </div>
          {currentPath !== "/" && (
            <button onClick={goUp}
              className="w-6 h-6 rounded flex items-center justify-center text-outline/50 hover:text-on-surface hover:bg-surface-variant/30 transition-all"
              title="上一级">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[10px] text-outline/30 gap-2">
            <span className="material-symbols-outlined text-[16px] animate-pulse">cloud</span>
            加载中...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[10px] text-outline/30 px-4 text-center">
            <span className="material-symbols-outlined text-[32px] text-outline/20">cloud_off</span>
            <span>{error}</span>
          </div>
        ) : (
          <div className="py-1">
            {entries.map((e) => (
              <button key={e.name} onClick={() => e.is_dir ? load(currentPath + "/" + e.name) : onSelect(currentPath + "/" + e.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-none transition-colors hover:bg-surface-variant/20 ${
                  !e.is_dir && (currentPath + "/" + e.name) === path
                    ? "bg-secondary/10 text-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}>
                <span className={`material-symbols-outlined text-[18px] ${e.is_dir ? "text-yellow-500" : "text-outline/50"}`}>
                  {e.is_dir ? "folder" : "description"}
                </span>
                <span className="text-[12px] truncate flex-1 text-left">{e.name.replace(/\/$/, "")}</span>
                {e.is_dir && <span className="text-[9px] text-outline/20">文件夹</span>}
              </button>
            ))}
            {entries.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-2 py-12 text-outline/30">
                <span className="material-symbols-outlined text-[28px]">folder_open</span>
                <span className="text-[10px]">空目录</span>
              </div>
            )}
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
