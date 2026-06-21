import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { downloadDir } from "@tauri-apps/api/path";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileArchive,
  FileImage,
  FileAudio,
  FileVideo,
  FolderPlus,
  Trash2,
  Upload,
  Download,
  ArrowUp,
  RefreshCw,
  Edit3,
  Copy,
  ArrowUpDown,
  EyeOff,
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

// ── Types ────────────────────────────────────────────────────────────────

type SortColumn = "name" | "size" | "modified" | "mode";
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
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMode(mode: number): string {
  if (!mode) return "----------";
  const types: Record<number, string> = { 0o040000: "d", 0o120000: "l", 0o010000: "p", 0o140000: "s", 0o060000: "b", 0o020000: "c" };
  let s = types[mode & 0o170000] || "-";
  const rwx = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  s += rwx[(mode >> 6) & 7] + rwx[(mode >> 3) & 7] + rwx[mode & 7];
  return s;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const codeExts = ["sh","bash","zsh","py","js","ts","jsx","tsx","rs","go","java","c","cpp","h","hpp","rb","php","pl","lua","sql","yaml","yml","json","toml","xml","css","scss","html","htm","vue","svelte","dockerfile","makefile","cmake"];
  const textExts = ["txt","md","log","cfg","conf","ini","env","readme","license"];
  const archiveExts = ["zip","tar","gz","xz","bz2","7z","rar","tgz"];
  const imageExts = ["png","jpg","jpeg","gif","svg","webp","bmp","ico"];
  const audioExts = ["mp3","wav","ogg","flac","aac","m4a"];
  const videoExts = ["mp4","mkv","avi","mov","webm"];
  if (codeExts.includes(ext)) return <FileCode size={13} className="text-[var(--color-warning)]" />;
  if (textExts.includes(ext)) return <FileText size={13} className="text-[var(--color-info)]" />;
  if (archiveExts.includes(ext)) return <FileArchive size={13} className="text-[var(--color-danger)]" />;
  if (imageExts.includes(ext)) return <FileImage size={13} className="text-[var(--color-success)]" />;
  if (audioExts.includes(ext)) return <FileAudio size={13} className="text-[var(--text-secondary)]" />;
  if (videoExts.includes(ext)) return <FileVideo size={13} className="text-[var(--text-secondary)]" />;
  if (name.startsWith(".")) return <File size={13} className="text-[var(--text-muted)]" />;
  return <File size={13} className="text-[var(--text-secondary)]" />;
}

// ── Component ────────────────────────────────────────────────────────────

export default function FileExplorer() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [cwd, setCwd] = useState("/");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [pathInput, setPathInput] = useState("/");
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const [sortCol, setSortCol] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [transfer, setTransfer] = useState<TransferState>(EMPTY_TRANSFER);
  const transferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const tbodyRef = useRef<HTMLDivElement>(null);

  // ── Auto-spawn SFTP ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTab || activeTab.status !== "connected") return;
    if (activeTab.session.kind !== "ssh") return;
    setEntries([]);
    setSelected(new Set());
    setTransfer(EMPTY_TRANSFER);
    sftpSpawn(activeTabId!, activeTab.session).then(() => {
      sftpListDir(activeTabId!, "/");
    });
    setCwd("/");
    setPathInput("/");
  }, [activeTab?.status, activeTabId]);

  // ── Event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTabId) return;
    const uls: UnlistenFn[] = [];

    listen<SftpEntriesPayload>(`sftp-entries:${activeTabId}`, (ev) => {
      setCwd(ev.payload.path);
      setPathInput(ev.payload.path);
      setEntries(ev.payload.entries);
      setSelected(new Set());
      setLoading(false);
    }).then((fn) => uls.push(fn));

    listen<SftpTransferPayload>(`sftp-transfer:${activeTabId}`, (ev) => {
      const { name, transferred, total, is_upload, state } = ev.payload;
      const done = state === 1 || state === 2;
      setTransfer({ name, transferred, total, isUpload: is_upload, done });
      if (transferTimer.current) clearTimeout(transferTimer.current);
      if (done) {
        transferTimer.current = setTimeout(() => {
          setTransfer(EMPTY_TRANSFER);
          refreshCwd();
        }, 2500);
      }
    }).then((fn) => uls.push(fn));

    listen<string>(`sftp-error:${activeTabId}`, (ev) => {
      setStatus(`Error: ${ev.payload}`);
      setLoading(false);
    }).then((fn) => uls.push(fn));

    return () => { uls.forEach((f) => f()); };
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

  const refreshCwd = useCallback(() => {
    navigate(cwd);
  }, [cwd, navigate]);

  const submitPath = useCallback(() => {
    const trimmed = pathInput.trim();
    if (trimmed && trimmed !== cwd) {
      navigate(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
    }
  }, [pathInput, cwd, navigate]);

  // ── Upload / Download ──────────────────────────────────────────────────
  const uploadFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !activeTabId) return;
      Array.from(files).forEach((f) => {
        const localPath = (f as any).path || f.name;
        sftpUpload(activeTabId, localPath, cwd);
      });
      if (fileInput.current) fileInput.current.value = "";
    },
    [activeTabId, cwd],
  );

  const downloadEntry = useCallback(
    async (entry: RemoteEntry) => {
      if (!activeTabId || entry.is_dir) return;
      const dir = await downloadDir();
      sftpDownload(activeTabId, entry.full_path, dir);
    },
    [activeTabId],
  );

  const downloadSelected = useCallback(async () => {
    if (!activeTabId) return;
    const dir = await downloadDir();
    const files = filterEntries.filter(e => selected.has(e.full_path) && !e.is_dir);
    files.forEach(e => sftpDownload(activeTabId, e.full_path, dir));
  }, [activeTabId, selected]);

  // ── Sorting ────────────────────────────────────────────────────────────
  const toggleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSortCol(col); setSortDir("asc"); }
    },
    [sortCol],
  );

  const sortIndicator = (col: SortColumn) => {
    if (sortCol !== col) return <ArrowUpDown size={10} className="inline opacity-30" />;
    return <span className="text-[var(--accent)]">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const filterEntries = useMemo(() => {
    return entries.filter(e => showHidden || e.name === ".." || !e.name.startsWith("."));
  }, [entries, showHidden]);

  const sortedEntries = useMemo(() => {
    const sorted = [...filterEntries];
    sorted.sort((a, b) => {
      if (a.name === "..") return -1;
      if (b.name === "..") return 1;
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else if (sortCol === "size") cmp = a.size - b.size;
      else if (sortCol === "modified") cmp = a.modified - b.modified;
      else if (sortCol === "mode") cmp = a.mode - b.mode;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filterEntries, sortCol, sortDir]);

  // ── Selection ──────────────────────────────────────────────────────────
  const toggleSelect = useCallback(
    (path: string, e: React.MouseEvent) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (e.ctrlKey || e.metaKey) {
          if (next.has(path)) next.delete(path); else next.add(path);
        } else if (e.shiftKey && prev.size > 0) {
          const allPaths = sortedEntries.map(en => en.full_path);
          const lastSelected = [...prev][prev.size - 1];
          const start = allPaths.indexOf(lastSelected);
          const end = allPaths.indexOf(path);
          if (start !== -1 && end !== -1) {
            const [lo, hi] = start < end ? [start, end] : [end, start];
            for (let i = lo; i <= hi; i++) next.add(allPaths[i]);
          }
        } else {
          if (next.has(path) && next.size === 1) next.clear();
          else { next.clear(); next.add(path); }
        }
        return next;
      });
    },
    [sortedEntries],
  );

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  const crumbs = useMemo(() => {
    if (cwd === "/") return [{ label: "/", path: "/" }];
    const parts = cwd.split("/").filter(Boolean);
    const result: { label: string; path: string }[] = [{ label: "/", path: "/" }];
    for (let i = 0; i < parts.length; i++) {
      result.push({ label: parts[i], path: "/" + parts.slice(0, i + 1).join("/") });
    }
    return result;
  }, [cwd]);

  // ── Drag-upload ────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  // ── Context menus ──────────────────────────────────────────────────────
  const showCtx = useCallback((e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ items, x: e.clientX, y: e.clientY });
  }, []);

  const fileCtx = useCallback(
    (entry: RemoteEntry): (ContextMenuItem | null)[] => [
      { label: "Download", icon: <Download size={12} />, onClick: () => downloadEntry(entry) },
      null,
      { label: "Rename", icon: <Edit3 size={12} />, onClick: () => {
        const newName = prompt("Rename to:", entry.name);
        if (newName && newName !== entry.name) {
          const parent = entry.full_path.replace(/\/[^/]*$/, "") || "/";
          sftpRename(activeTabId!, entry.full_path, `${parent}/${newName}`).then(refreshCwd);
        }
      }},
      { label: "Copy Path", icon: <Copy size={12} />, onClick: () => {
        navigator.clipboard.writeText(entry.full_path);
      }},
      null,
      { label: "Delete", icon: <Trash2 size={12} />, onClick: () => {
        if (confirm(`Delete ${entry.name}?`))
          sftpDelete(activeTabId!, entry.full_path).then(refreshCwd);
      }, danger: true },
    ],
    [activeTabId, downloadEntry, refreshCwd],
  );

  const folderCtx = useCallback(
    (entry: RemoteEntry): (ContextMenuItem | null)[] => [
      { label: "Open", icon: <FolderOpen size={12} />, onClick: () => navigate(entry.full_path) },
      null,
      { label: "Rename", icon: <Edit3 size={12} />, onClick: () => {
        const newName = prompt("Rename to:", entry.name);
        if (newName && newName !== entry.name) {
          const parent = entry.full_path.replace(/\/[^/]*$/, "") || "/";
          sftpRename(activeTabId!, entry.full_path, `${parent}/${newName}`).then(refreshCwd);
        }
      }},
      { label: "Copy Path", icon: <Copy size={12} />, onClick: () => {
        navigator.clipboard.writeText(entry.full_path);
      }},
      null,
      { label: "Delete", icon: <Trash2 size={12} />, onClick: () => {
        if (confirm(`Delete folder "${entry.name}" and all contents?`))
          sftpDelete(activeTabId!, entry.full_path).then(refreshCwd);
      }, danger: true },
    ],
    [activeTabId, navigate, refreshCwd],
  );

  const emptyCtx = useCallback(
    (): (ContextMenuItem | null)[] => [
      { label: "New Folder", icon: <FolderPlus size={12} />, onClick: () => {
        const name = prompt("Folder name:");
        if (name) sftpMkdir(activeTabId!, `${cwd.replace(/\/$/, "")}/${name}`).then(refreshCwd);
      }},
      { label: "Upload Files", icon: <Upload size={12} />, onClick: () => fileInput.current?.click() },
      null,
      { label: "Refresh", icon: <RefreshCw size={12} />, onClick: refreshCwd },
    ],
    [activeTabId, cwd, refreshCwd],
  );

  const multiCtx = useCallback(
    (): (ContextMenuItem | null)[] => {
      const selFiles = filterEntries.filter(e => selected.has(e.full_path) && !e.is_dir);
      const items: (ContextMenuItem | null)[] = [
        {
          label: `Download ${selected.size} item${selected.size > 1 ? "s" : ""}`,
          icon: <Download size={12} />,
          onClick: downloadSelected,
          disabled: selFiles.length === 0,
        },
        null,
        {
          label: `Delete ${selected.size} item${selected.size > 1 ? "s" : ""}`,
          icon: <Trash2 size={12} />,
          onClick: () => {
            if (confirm(`Delete ${selected.size} selected item(s)?`)) {
              [...selected].forEach(p => sftpDelete(activeTabId!, p));
              setTimeout(refreshCwd, 300);
            }
          },
          danger: true,
        },
      ];
      return items;
    },
    [activeTabId, filterEntries, selected, downloadSelected, refreshCwd],
  );

  // ── Rendering ──────────────────────────────────────────────────────────
  const numFolders = filterEntries.filter(e => e.is_dir).length;
  const numFiles = filterEntries.filter(e => !e.is_dir).length;

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--border-subtle)] flex-shrink-0">
        {/* Action buttons */}
        <button onClick={goUp} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors" title="Parent directory">
          <ArrowUp size={15} />
        </button>
        <button onClick={refreshCwd} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors" title="Refresh">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => {
            const name = prompt("Folder name:");
            if (name) sftpMkdir(activeTabId!, `${cwd.replace(/\/$/, "")}/${name}`).then(refreshCwd);
          }}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-sm transition-colors" title="New folder"
        >
          <FolderPlus size={15} />
        </button>
        <button onClick={() => fileInput.current?.click()} className="p-1 text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-sm transition-colors" title="Upload file">
          <Upload size={15} />
        </button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />

        {/* Separator */}
        <span className="w-px h-4 mx-1 bg-[var(--border-subtle)]" />

        {/* Breadcrumb */}
        <div className="flex items-center gap-0 text-[11px] font-mono ml-0.5 overflow-x-auto min-w-0">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center flex-shrink-0">
              {i > 0 && <span className="text-[var(--text-muted)] mx-0.5">/</span>}
              <button
                onClick={() => navigate(c.path)}
                className={`hover:text-[var(--accent)] hover:underline transition-colors px-0.5 rounded-sm ${
                  i === crumbs.length - 1 ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"
                }`}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>

        {/* Path input (always visible, next to breadcrumb) */}
        <input
          ref={pathInputRef}
          className="flex-1 ml-1 px-1.5 py-0 h-5 text-[11px] font-mono bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-transparent focus:border-[var(--border-focus)] rounded-sm outline-none min-w-[60px] placeholder:text-[var(--text-muted)]"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={submitPath}
          placeholder="path"
        />

        {/* Hidden files toggle */}
        <label className="flex items-center gap-1 ml-1 text-[10px] text-[var(--text-muted)] cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="w-3 h-3 accent-[var(--accent)] cursor-pointer"
          />
          <EyeOff size={11} className={showHidden ? "text-[var(--accent)]" : ""} />
        </label>
      </div>

      {/* ── File list ────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto relative"
        ref={tbodyRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={(e) => showCtx(e, emptyCtx())}
        onClick={() => { setSelected(new Set()); }}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 bg-[var(--accent-dim)] border-2 border-dashed border-[var(--accent-border)] z-10 flex items-center justify-center pointer-events-none">
            <Upload size={24} className="text-[var(--accent)]" />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-[11px] text-[var(--text-muted)]">
            Loading...
          </div>
        )}

        {/* Empty */}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-1.5">
            <Folder size={28} className="text-[var(--text-muted)] opacity-40" />
            <span className="text-[11px] text-[var(--text-muted)]">This folder is empty</span>
            <span className="text-[10px] text-[var(--text-muted)] opacity-60">
              Right-click → New Folder / Upload Files
            </span>
          </div>
        )}

        {/* Table */}
        {entries.length > 0 && (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-surface)] z-[1]">
                <th className="w-5" />
                <th className="text-left py-1.5 cursor-pointer select-none hover:text-[var(--accent)] transition-colors" onClick={() => toggleSort("name")}>
                  <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">Name {sortIndicator("name")}</span>
                </th>
                <th className="text-right pr-2 w-16 cursor-pointer select-none hover:text-[var(--accent)] transition-colors" onClick={() => toggleSort("size")}>
                  <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">Size {sortIndicator("size")}</span>
                </th>
                <th className="text-right pr-2 w-20 cursor-pointer select-none hover:text-[var(--accent)] transition-colors" onClick={() => toggleSort("modified")}>
                  <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">Modified {sortIndicator("modified")}</span>
                </th>
                <th className="text-left pr-2 w-[72px] cursor-pointer select-none hover:text-[var(--accent)] transition-colors" onClick={() => toggleSort("mode")}>
                  <span className="text-[var(--text-secondary)] text-[10px] uppercase tracking-wider">Perm {sortIndicator("mode")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => {
                const isParent = e.is_dir && e.name === "..";
                const isDir = e.is_dir && e.name !== "..";
                const sel = selected.has(e.full_path);
                return (
                  <tr
                    key={e.full_path}
                    className={`cursor-pointer transition-colors ${
                      sel ? "bg-[var(--surface-selected)]" : "hover:bg-[var(--surface-hover)]"
                    }`}
                    onClick={(ev) => { if (isParent) goUp(); else toggleSelect(e.full_path, ev); }}
                    onDoubleClick={() => { if (isDir) navigate(e.full_path); else if (!isParent) downloadEntry(e); }}
                    onContextMenu={(ev) => {
                      if (isParent) return;
                      if (sel && selected.size > 1) showCtx(ev, multiCtx());
                      else showCtx(ev, isDir ? folderCtx(e) : fileCtx(e));
                    }}
                  >
                    <td className="pl-2 py-[3px]">
                      {isParent ? (
                        <ArrowUp size={13} className="text-[var(--text-secondary)]" />
                      ) : isDir ? (
                        <Folder size={13} className="text-[var(--accent)]" />
                      ) : (
                        fileIcon(e.name)
                      )}
                    </td>
                    <td className={`pr-2 ${isDir ? "text-[var(--accent)]" : "text-[var(--text-primary)]"} max-w-[100px] truncate`}>
                      {e.name}
                    </td>
                    <td className="pr-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {e.is_dir ? "" : formatSize(e.size)}
                    </td>
                    <td className="pr-2 text-right tabular-nums text-[var(--text-secondary)]">
                      {formatTime(e.modified)}
                    </td>
                    <td className="pr-2 text-left tabular-nums text-[var(--text-muted)] font-mono text-[10px]" title={formatMode(e.mode)}>
                      {formatMode(e.mode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 py-[2px] border-t border-[var(--border-subtle)] flex items-center gap-2 text-[10px] text-[var(--text-muted)] min-h-[20px]">
        {!transfer.done ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {transfer.isUpload ? <Upload size={10} className="text-[var(--accent)] flex-shrink-0" /> : <Download size={10} className="text-[var(--accent)] flex-shrink-0" />}
            <span className="truncate flex-1 min-w-0">{transfer.name}</span>
            <span className="tabular-nums flex-shrink-0">
              {transfer.total > 0
                ? `${Math.round((transfer.transferred / transfer.total) * 100)}%`
                : formatSize(transfer.transferred)}
            </span>
            <div className="w-16 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: transfer.total > 0 ? `${Math.min((transfer.transferred / transfer.total) * 100, 100)}%` : "30%" }} />
            </div>
          </div>
        ) : (
          <>
            <span>{numFolders > 0 && `${numFolders} folder${numFolders !== 1 ? "s" : ""}`}
              {numFolders > 0 && numFiles > 0 && ", "}
              {numFiles > 0 && `${numFiles} file${numFiles !== 1 ? "s" : ""}`}
              {numFolders === 0 && numFiles === 0 && "Empty"}</span>
            {selected.size > 0 && (
              <span className="text-[var(--accent)]">{selected.size} selected</span>
            )}
            {status && (
              <span className="ml-auto truncate max-w-[120px]">{status}</span>
            )}
          </>
        )}
      </div>

      {ctx && <ContextMenu items={ctx.items} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />}
    </div>
  );
}
