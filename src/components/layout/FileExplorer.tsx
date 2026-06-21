import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Folder,
  FolderOpen,
  File,
  FolderPlus,
  Trash2,
  Upload,
  Download,
  ArrowUp,
  RefreshCw,
  Edit3,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import {
  sftpSpawn,
  sftpListDir,
  sftpDownload,
  sftpUpload,
  sftpDelete,
  sftpMkdir,
  sftpRename,
  type RemoteEntry,
  type SftpEntriesPayload,
  type SftpTransferPayload,
} from "@/lib/tauriCommands";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

type SortColumn = "name" | "size" | "modified";
type SortDir = "asc" | "desc";

interface TransferState {
  name: string;
  transferred: number;
  total: number;
  isUpload: boolean;
  done: boolean;
}

interface CtxState {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
}

const EMPTY_TRANSFER: TransferState = { name: "", transferred: 0, total: 0, isUpload: false, done: true };

export default function FileExplorer() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [ctx, setCtx] = useState<CtxState | null>(null);

  // Sort state
  const [sortCol, setSortCol] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Transfer progress
  const [transfer, setTransfer] = useState<TransferState>(EMPTY_TRANSFER);
  const transferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ── Auto-spawn SFTP ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTab || activeTab.status !== "connected") return;
    if (activeTab.session.kind !== "ssh") return;
    setEntries([]);
    setTransfer(EMPTY_TRANSFER);
    sftpSpawn(activeTabId!, activeTab.session).then(() => {
      sftpListDir(activeTabId!, "/");
    });
    setCwd("/");
  }, [activeTab?.status, activeTabId]);

  // ── Event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTabId) return;
    let ul: UnlistenFn | null = null;
    let ut: UnlistenFn | null = null;
    const uls: UnlistenFn[] = [];

    listen<SftpEntriesPayload>(`sftp-entries:${activeTabId}`, (ev) => {
      setCwd(ev.payload.path);
      setEntries(ev.payload.entries);
      setLoading(false);
    }).then((fn) => { ul = fn; });

    listen<SftpTransferPayload>(`sftp-transfer:${activeTabId}`, (ev) => {
      const { name, transferred, total, is_upload, state } = ev.payload;
      const done = state === 1 || state === 2;
      setTransfer({ name, transferred, total, isUpload: is_upload, done });
      if (done && transferTimer.current) {
        clearTimeout(transferTimer.current);
        transferTimer.current = setTimeout(() => {
          setTransfer(EMPTY_TRANSFER);
          refresh();
        }, 3000);
      }
    }).then((fn) => { ut = fn; });

    listen<string>(`sftp-status:${activeTabId}`, (ev) => {
      setStatus(ev.payload);
    }).then((fn) => uls.push(fn));

    listen<string>(`sftp-error:${activeTabId}`, (ev) => {
      setStatus(`Error: ${ev.payload}`);
      setLoading(false);
    }).then((fn) => uls.push(fn));

    return () => {
      ul?.();
      ut?.();
      uls.forEach((f) => f());
    };
  }, [activeTabId]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const navigate = useCallback(
    (path: string) => {
      if (!activeTabId) return;
      setLoading(true);
      sftpListDir(activeTabId, path);
    },
    [activeTabId],
  );

  const goUp = useCallback(() => {
    if (cwd === "/") return;
    const parent = cwd.replace(/\/[^/]*$/, "") || "/";
    navigate(parent);
  }, [cwd, navigate]);

  const refresh = useCallback(() => {
    navigate(cwd);
  }, [cwd, navigate]);

  // ── Upload ─────────────────────────────────────────────────────────────
  const upload = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !activeTabId) return;
      Array.from(files).forEach((f) => {
        // Tauri WebView exposes the file path via a non-standard property
        const localPath = (f as any).path || f.name;
        sftpUpload(activeTabId, localPath, cwd);
      });
      if (fileInput.current) fileInput.current.value = "";
    },
    [activeTabId, cwd],
  );

  // ── Download ───────────────────────────────────────────────────────────
  const download = useCallback(
    (entry: RemoteEntry) => {
      if (!activeTabId) return;
      sftpDownload(activeTabId, entry.full_path, "");
    },
    [activeTabId],
  );

  // ── Sorting ────────────────────────────────────────────────────────────
  const toggleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("asc");
      }
    },
    [sortCol],
  );

  const sortIndicator = (col: SortColumn) => {
    if (sortCol !== col) return <ArrowUpDown size={10} className="inline opacity-30" />;
    return <span className="text-[var(--accent)]">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      // ".." always first
      if (a.name === "..") return -1;
      if (b.name === "..") return 1;
      // Directories before files
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      // Then by selected column
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else if (sortCol === "size") cmp = a.size - b.size;
      else if (sortCol === "modified") cmp = a.modified - b.modified;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [entries, sortCol, sortDir]);

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  const crumbs = useMemo(() => {
    if (cwd === "/") return [{ label: "/", path: "/" }];
    const parts = cwd.split("/").filter(Boolean);
    const result: { label: string; path: string }[] = [{ label: "/", path: "/" }];
    for (let i = 0; i < parts.length; i++) {
      result.push({
        label: parts[i],
        path: "/" + parts.slice(0, i + 1).join("/"),
      });
    }
    return result;
  }, [cwd]);

  // ── Context menus ──────────────────────────────────────────────────────
  const showCtx = useCallback(
    (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
      e.preventDefault();
      setCtx({ items, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const entryCtx = useCallback(
    (entry: RemoteEntry): (ContextMenuItem | null)[] => {
      const items: (ContextMenuItem | null)[] = [];
      if (entry.is_dir) {
        items.push({ label: "Open", icon: <FolderOpen size={12} />, onClick: () => navigate(entry.full_path) });
      } else {
        items.push({ label: "Download", icon: <Download size={12} />, onClick: () => download(entry) });
      }
      items.push(
        { label: "Rename", icon: <Edit3 size={12} />, onClick: () => {
          const newName = prompt("New name:", entry.name);
          if (newName && newName !== entry.name) {
            const parent = entry.full_path.replace(/\/[^/]*$/, "") || "/";
            sftpRename(activeTabId!, entry.full_path, `${parent}/${newName}`).then(refresh);
          }
        }},
        null,
        { label: "Delete", icon: <Trash2 size={12} />, onClick: () => {
          if (confirm(`Delete ${entry.name}?`)) {
            sftpDelete(activeTabId!, entry.full_path).then(refresh);
          }
        }, danger: true },
      );
      return items;
    },
    [activeTabId, navigate, download, refresh],
  );

  const isEmptyCtx = useCallback(
    (): (ContextMenuItem | null)[] => [
      { label: "New Folder", icon: <FolderPlus size={12} />, onClick: () => {
        const name = prompt("Folder name:");
        if (name) {
          sftpMkdir(activeTabId!, `${cwd.replace(/\/$/, "")}/${name}`).then(refresh);
        }
      }},
      { label: "Upload File", icon: <Upload size={12} />, onClick: () => fileInput.current?.click() },
    ],
    [activeTabId, cwd, refresh],
  );

  // ── Render helpers ─────────────────────────────────────────────────────
  const isParent = (e: RemoteEntry) => e.is_dir && e.name === "..";
  const isDir = (e: RemoteEntry) => e.is_dir && e.name !== "..";

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--border-subtle)] flex-shrink-0 flex-wrap">
        <button
          onClick={goUp}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors"
          title="Parent directory"
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={refresh}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => {
            const name = prompt("Folder name:");
            if (name) {
              sftpMkdir(activeTabId!, `${cwd.replace(/\/$/, "")}/${name}`).then(refresh);
            }
          }}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors"
          title="New folder"
        >
          <FolderPlus size={14} />
        </button>
        <button
          onClick={() => fileInput.current?.click()}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors"
          title="Upload file"
        >
          <Upload size={14} />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />

        {/* Breadcrumb */}
        <span className="flex items-center gap-0 text-[11px] font-mono ml-1 overflow-x-auto">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-0 flex-shrink-0">
              {i > 0 && <ChevronRight size={10} className="text-[var(--text-muted)] mx-0.5 flex-shrink-0" />}
              <button
                onClick={() => navigate(c.path)}
                className={`hover:text-[var(--accent)] hover:underline transition-colors ${
                  i === crumbs.length - 1 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                }`}
              >
                {c.label}
              </button>
            </span>
          ))}
        </span>

        {status && (
          <span className="ml-auto text-[10px] text-[var(--text-secondary)] truncate max-w-[100px]">
            {status}
          </span>
        )}
      </div>

      {/* File list */}
      <div
        className="flex-1 overflow-y-auto"
        onContextMenu={(e) => showCtx(e, isEmptyCtx())}
      >
        {loading && (
          <div className="flex items-center justify-center py-8 text-[11px] text-[var(--text-muted)]">
            Loading...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-8 text-[11px] text-[var(--text-muted)]">
            Empty directory. Right-click → Upload File
          </div>
        )}

        <table className="w-full text-[11px]">
          {/* Sortable header */}
          <thead>
            <tr className="border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-surface)]">
              <th className="w-5" />
              <th
                className="text-left py-1.5 cursor-pointer select-none hover:text-[var(--accent)] transition-colors"
                onClick={() => toggleSort("name")}
              >
                <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">
                  Name {sortIndicator("name")}
                </span>
              </th>
              <th
                className="text-right pr-3 w-16 cursor-pointer select-none hover:text-[var(--accent)] transition-colors"
                onClick={() => toggleSort("size")}
              >
                <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">
                  Size {sortIndicator("size")}
                </span>
              </th>
              <th
                className="text-right pr-2 w-24 cursor-pointer select-none hover:text-[var(--accent)] transition-colors"
                onClick={() => toggleSort("modified")}
              >
                <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">
                  Modified {sortIndicator("modified")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((e) => (
              <tr
                key={e.full_path}
                className="hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                onClick={() => { if (isDir(e)) navigate(e.full_path); else if (isParent(e)) goUp(); }}
                onDoubleClick={() => { if (!isDir(e) && !isParent(e)) download(e); }}
                onContextMenu={(ev) => showCtx(ev, isParent(e) ? [] : entryCtx(e))}
              >
                <td className="pl-2 py-1">
                  {isParent(e) ? (
                    <ArrowUp size={13} className="text-[var(--text-secondary)]" />
                  ) : isDir(e) ? (
                    <Folder size={13} className="text-[var(--accent)]" />
                  ) : (
                    <File size={13} className="text-[var(--text-secondary)]" />
                  )}
                </td>
                <td className={`pr-3 ${isDir(e) ? "text-[var(--accent)]" : "text-[var(--text-primary)]"} max-w-[140px] truncate`}>
                  {e.name}
                </td>
                <td className="pr-3 text-right tabular-nums text-[var(--text-secondary)]">
                  {e.is_dir ? "" : formatSize(e.size)}
                </td>
                <td className="pr-2 text-right tabular-nums text-[var(--text-secondary)]">
                  {formatTime(e.modified)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transfer progress bar */}
      {!transfer.done && (
        <div className="flex-shrink-0 px-3 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <span>{transfer.isUpload ? <Upload size={11} /> : <Download size={11} />}</span>
            <span className="truncate flex-1">{transfer.name}</span>
            <span className="tabular-nums flex-shrink-0">
              {transfer.total > 0
                ? `${Math.round((transfer.transferred / transfer.total) * 100)}%`
                : formatSize(transfer.transferred)}
            </span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
              style={{
                width: transfer.total > 0
                  ? `${Math.min((transfer.transferred / transfer.total) * 100, 100)}%`
                  : "30%",
              }}
            />
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          items={ctx.items}
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}G`;
}

function formatTime(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
