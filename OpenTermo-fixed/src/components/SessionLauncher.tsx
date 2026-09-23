import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, CornerDownLeft, Terminal, Cable, Monitor,
  Plus, Edit3, Trash2, ChevronDown, ChevronRight, Zap, Copy, Check, FolderPlus,
  ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { useUIStore } from "@/stores/uiStore";
import type { SessionConfig } from "@/lib/tauriCommands";
import { formatSessionInfo } from "@/lib/sessionInfo";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";
import { alertMessage, confirmAction, promptText } from "@/components/ui/confirm-dialog";
import {
  RESERVED_GROUP,
  loadGroupOrder,
  movableGroups,
  orderGroups,
  saveGroupOrder,
} from "@/lib/sessionGroups";

interface CtxState {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
}

interface QuickSpec {
  user: string;
  host: string;
  port: number;
}

type FlatItem =
  | { kind: "session"; session: SessionConfig }
  | { kind: "quick"; spec: QuickSpec };

/** `user@host[:port]` → 直连参数；解析不出来就返回 null。 */
function parseQuickConnect(raw: string): QuickSpec | null {
  const m = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(raw.trim());
  if (!m) return null;
  const port = m[3] ? Number(m[3]) : 22;
  if (port < 1 || port > 65535) return null;
  return { user: m[1], host: m[2], port };
}

function quickSession(spec: QuickSpec): SessionConfig {
  return {
    id: crypto.randomUUID(),
    name: `${spec.user}@${spec.host}`,
    host: spec.host,
    port: spec.port,
    user: spec.user,
    auth: "password",
    password: "",
    private_key_path: "",
    proxy: "",
    last_used: null,
    group: "",
    kind: "ssh",
    serial_port: "",
    baud_rate: 115200,
    data_bits: 8,
    stop_bits: 1,
    parity: "none",
    flow_control: "none",
  };
}

function hostLine(s: SessionConfig) {
  return s.kind === "serial" ? (s.serial_port || "—") : s.host;
}

function kindIcon(kind: string) {
  switch (kind) {
    case "serial": return <Cable size={13} className="text-[var(--color-warning)]" />;
    case "telnet": return <Monitor size={13} className="text-[var(--color-info)]" />;
    default: return <Terminal size={13} className="text-[var(--accent)]" />;
  }
}

const sortByName = (a: SessionConfig, b: SessionConfig) =>
  (a.name || a.host).localeCompare(b.name || b.host, "en");

/**
 * Session launcher overlay (title-bar `+` / Ctrl+T).
 *
 * Sits at z-40 — below the dialog layer (z-50) so confirm/edit dialogs raised
 * from here render on top, and above the app content.
 */
export default function SessionLauncher() {
  const isOpen = useUIStore((s) => s.isLauncherOpen);
  const openLauncher = useUIStore((s) => s.openLauncher);
  const closeLauncher = useUIStore((s) => s.closeLauncher);

  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadSessions);
  const save = useSessionStore((s) => s.save);
  const remove = useSessionStore((s) => s.remove);
  const connect = useSessionStore((s) => s.connect);
  const openEditDialog = useSessionStore((s) => s.openEditDialog);
  const openConnectDialog = useSessionStore((s) => s.openConnectDialog);
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [ctx, setCtx] = useState<CtxState | null>(null);
  /** 记「折叠」而不是「展开」：新分组默认展开，打开即可点。 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** 名册：数组顺序就是分组显示顺序（Default 不在其中，它永远置顶）。 */
  const [knownGroups, setKnownGroups] = useState<string[]>(loadGroupOrder);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveGroupOrder(knownGroups); }, [knownGroups]);

  const focusTerminal = useCallback(() => {
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus();
    }, 50);
  }, []);

  const closeToTerminal = useCallback(() => {
    closeLauncher();
    focusTerminal();
  }, [closeLauncher, focusTerminal]);

  // Ctrl+T — 全局开合
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        if (useUIStore.getState().isLauncherOpen) closeLauncher();
        else openLauncher();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLauncher, openLauncher]);

  // 每次打开都重新拉一遍会话，并让搜索框拿到焦点
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIdx(0);
    setCtx(null);
    loadSessions();
    // 弹窗里新建的分组只写了名册，本组件一直挂载不会重读：打开时补一次。
    setKnownGroups(loadGroupOrder());
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen, loadSessions]);

  const handleConnect = useCallback((s: SessionConfig) => {
    const existing = tabs.find((t) => t.session.id === s.id);
    if (existing) setActiveTab(existing.id);
    else connect(`tab-${s.id}-${Date.now()}`, s);
    closeToTerminal();
  }, [tabs, setActiveTab, connect, closeToTerminal]);

  const connectQuick = useCallback((spec: QuickSpec) => {
    const s = quickSession(spec);
    connect(`tab-${s.id}-${Date.now()}`, s);
    closeToTerminal();
  }, [connect, closeToTerminal]);

  // Esc 关闭；ctx 菜单或更上层的对话框先收自己的尾
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ctx) { setCtx(null); return; }
      if (document.querySelector(".dialog-overlay")) return;
      closeToTerminal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, ctx, closeToTerminal]);

  // ── 分组 / 搜索 ────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const map: Record<string, SessionConfig[]> = {};
    for (const s of sessions) {
      const g = s.group || RESERVED_GROUP;
      if (!map[g]) map[g] = [];
      map[g].push(s);
    }
    for (const g of knownGroups) if (!map[g]) map[g] = [];

    for (const g of Object.keys(map)) map[g].sort(sortByName);

    return orderGroups(Object.keys(map), knownGroups).map((k) => ({
      name: k,
      connected: map[k].filter((s) => tabs.some((t) => t.session.id === s.id && t.status === "connected")).length,
      sessions: map[k],
    }));
  }, [sessions, knownGroups, tabs]);

  const trimmed = query.trim();
  const needle = trimmed.toLowerCase();

  const results = useMemo<FlatItem[]>(() => {
    if (!needle) return [];
    const matched = sessions
      .filter((s) =>
        (s.name || "").toLowerCase().includes(needle) ||
        (s.host || "").toLowerCase().includes(needle) ||
        (s.user || "").toLowerCase().includes(needle) ||
        (s.group || "").toLowerCase().includes(needle) ||
        `${s.user}@${s.host}`.toLowerCase().includes(needle),
      )
      .sort(sortByName);
    const items: FlatItem[] = matched.map((s) => ({ kind: "session", session: s }));
    const quick = parseQuickConnect(trimmed);
    if (quick) items.push({ kind: "quick", spec: quick });
    return items;
  }, [sessions, needle, trimmed]);

  useEffect(() => { setSelectedIdx(0); }, [results]);

  const toggleGroup = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // ── 会话管理 ───────────────────────────────────────────────────────────

  const isConnected = (id: string) =>
    tabs.some((t) => t.session.id === id && t.status === "connected");
  const isActive = (id: string) => {
    const tab = tabs.find((t) => t.session.id === id);
    return tab ? tab.id === activeTabId : false;
  };

  const handleDelete = async (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    const ok = await confirmAction({
      title: "删除会话",
      message: `确定删除会话「${s.name || s.host}」？此操作不可撤销。`,
      confirmText: "删除",
      danger: true,
    });
    if (ok) await remove(id);
  };

  const groupExists = (name: string) =>
    knownGroups.includes(name) || sessions.some((s) => (s.group || RESERVED_GROUP) === name);

  /** 重名一律提示并中止，新建 / 移入 / 重命名共用这条规则。 */
  const warnIfTaken = async (name: string, hint: string): Promise<boolean> => {
    if (!groupExists(name)) return true;
    await alertMessage("分组已存在", `已有名为「${name}」的分组。${hint}`);
    return false;
  };

  const handleNewGroup = async () => {
    const name = await promptText({
      title: "新建分组",
      input: { label: "分组名称", placeholder: "例如：生产环境" },
    });
    if (!name) return;
    if (name === RESERVED_GROUP) {
      await alertMessage("名称不可用", `「${RESERVED_GROUP}」是内置分组，未分组的会话就在里面。请换一个名称。`);
      return;
    }
    if (!(await warnIfTaken(name, "请换一个名称，或把会话移动到已有分组。"))) return;
    // 新建的分组追加到名册末尾，要往前挪用组头右键「上移」
    setKnownGroups((prev) => [...prev, name]);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(name); return n; });
  };

  const handleMoveToGroup = async (s: SessionConfig, group: string) => {
    await save({ ...s, group });
  };

  const handleMoveToNewGroup = async (s: SessionConfig) => {
    const name = await promptText({
      title: "移动到新分组",
      message: `会话「${s.name || s.host}」将移入新分组。`,
      input: { label: "分组名称", placeholder: "例如：生产环境" },
    });
    if (!name) return;
    if (name === RESERVED_GROUP) {
      await alertMessage("名称不可用", `要移回「${RESERVED_GROUP}」，请在「移动到分组」子菜单里直接选它。`);
      return;
    }
    if (!(await warnIfTaken(name, "要移进去也在「移动到分组」子菜单里直接选它。"))) return;
    await save({ ...s, group: name });
    // 和「新建分组」同一条规则：建过名的分组进名册末尾，不会因组内清空而凭空消失
    setKnownGroups((prev) => [...prev, name]);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(name); return n; });
  };

  const handleRenameGroup = async (oldName: string) => {
    const newName = await promptText({
      title: "重命名分组",
      input: { label: "分组名称", initial: oldName },
    });
    if (!newName || newName === oldName) return;
    // 改成 Default 仍是「并入 Default」的既有用法，其余重名拦下
    if (newName !== RESERVED_GROUP && !(await warnIfTaken(newName, "要把会话并过去，请用卡片右键「移动到分组」。"))) return;
    const targets = sessions.filter((s) => (s.group || "Default") === oldName);
    for (const s of targets) {
      await save({ ...s, group: newName === "Default" ? "" : newName });
    }
    setKnownGroups((prev) => {
      if (newName === RESERVED_GROUP) return prev.filter((g) => g !== oldName);
      // 重命名保持原位；旧名不在名册（会话直接带的组）时把新名补到末尾
      return prev.includes(oldName)
        ? prev.map((g) => (g === oldName ? newName : g))
        : [...prev, newName];
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(oldName);
      next.delete(newName);
      return next;
    });
  };

  const handleDeleteGroup = async (name: string) => {
    const targets = sessions.filter((s) => (s.group || RESERVED_GROUP) === name);
    const ok = await confirmAction({
      title: "删除分组",
      message: targets.length === 0
        ? `确定删除空分组「${name}」？`
        : `确定删除分组「${name}」？该分组下的 ${targets.length} 个会话将移至 ${RESERVED_GROUP}。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    for (const s of targets) {
      await save({ ...s, group: "" });
    }
    setKnownGroups((prev) => prev.filter((g) => g !== name));
    setCollapsed((prev) => { const next = new Set(prev); next.delete(name); return next; });
  };

  // ── 分组排序 ───────────────────────────────────────────────────────────

  /** 屏幕上可挪动的分组（Default 永远置顶，不参与排序）。 */
  const movableNames = groups.map((g) => g.name).filter((n) => n !== RESERVED_GROUP);

  /** 上移 / 下移：与相邻分组换位置。挪动过的未登记组一并落进名册，位置才算数。 */
  const moveGroup = (name: string, delta: -1 | 1) => {
    const list = [...movableNames];
    const from = list.indexOf(name);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    setKnownGroups(list);
  };

  const sortGroupsByName = () => {
    setKnownGroups([...movableNames].sort((a, b) => a.localeCompare(b, "en")));
  };

  // ── 右键菜单 ───────────────────────────────────────────────────────────

  const showCtx = (e: React.MouseEvent, items: (ContextMenuItem | null)[]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ items, x: e.clientX, y: e.clientY });
  };

  const sessionCtx = (s: SessionConfig): (ContextMenuItem | null)[] => {
    // 顺序跟启动台一致；Default 始终给一份，最后一个会话也能移回未分组
    const groupNames = orderGroups(
      [RESERVED_GROUP, ...knownGroups, ...sessions.map((x) => x.group || RESERVED_GROUP)],
      knownGroups,
    );
    const cur = s.group || "Default";
    const moveItems: ContextMenuItem[] = groupNames
      .filter((g) => g !== cur)
      .map((g) => ({
        label: g,
        onClick: () => handleMoveToGroup(s, g === "Default" ? "" : g),
      }));
    moveItems.push({
      label: "新建分组...",
      icon: <Plus size={12} />,
      onClick: () => handleMoveToNewGroup(s),
    });

    return [
      { label: "连接", icon: <Terminal size={13} />, onClick: () => handleConnect(s) },
      { label: "编辑", icon: <Edit3 size={13} />, onClick: () => openEditDialog(s.id) },
      { label: "移动到分组", icon: <ChevronRight size={13} />, children: moveItems },
      null,
      { label: "删除", icon: <Trash2 size={13} />, onClick: () => handleDelete(s.id), danger: true },
    ];
  };

  const newConnection = (group?: string) => {
    closeLauncher();
    openConnectDialog(group ?? null);
  };

  /** 组头 / 空托盘的「在此新建连接」：Default 走未分组，不写字面量。 */
  const newConnectionIn = (groupName: string) =>
    newConnection(groupName === RESERVED_GROUP ? undefined : groupName);

  const blankCtx = (): (ContextMenuItem | null)[] => [
    { label: "新建连接", icon: <Plus size={13} />, onClick: () => newConnection() },
    { label: "新建分组", icon: <Plus size={13} />, onClick: handleNewGroup },
  ];

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selectedIdx];
      if (!item) return;
      if (item.kind === "session") handleConnect(item.session);
      else connectQuick(item.spec);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-[8vh]">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
        onClick={closeToTerminal}
      />

      <div
        role="dialog"
        aria-label="会话启动台"
        className="relative flex flex-col w-full max-w-4xl max-h-[72vh] bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Search + 新建连接 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          <Search size={16} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="搜索会话，或输入 user@host 直接连接…"
            className="flex-1 bg-transparent text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-muted)]"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            onClick={() => newConnection()}
            className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-md text-sm font-semibold text-[var(--accent)] bg-[var(--accent-dim)] border border-[var(--accent-border)] hover:bg-accent/25 transition-colors"
          >
            <Plus size={13} />
            新建连接
          </button>
          <button
            onClick={handleNewGroup}
            className="shrink-0 flex items-center gap-1 h-7 px-2.5 rounded-md text-sm font-semibold text-[var(--text-secondary)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <FolderPlus size={13} />
            新建分组
          </button>
          <kbd className="shrink-0 text-xs text-[var(--text-muted)] bg-[var(--surface-hover)] px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto min-h-0 p-3"
          onContextMenu={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-session-card]") || target.closest("button")) return;
            showCtx(e, blankCtx());
          }}
        >
          {trimmed ? (
            results.length === 0 ? (
              <div className="py-14 text-center text-xs text-[var(--text-muted)]">
                未找到匹配「{trimmed}」的会话
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {results.map((item, i) => {
                  const isSel = i === selectedIdx;
                  const rowCls = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors " + (
                    isSel ? "bg-[var(--surface-selected)]" : "hover:bg-[var(--surface-hover)]"
                  );
                  if (item.kind === "quick") {
                    return (
                      <button
                        key="quick"
                        onClick={() => connectQuick(item.spec)}
                        onMouseEnter={() => setSelectedIdx(i)}
                        className={rowCls + " border border-dashed border-[var(--accent-border)]"}
                      >
                        <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                          <Zap size={14} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-[var(--text-primary)] truncate">
                            直接连接 <span className="font-mono">{item.spec.user}@{item.spec.host}:{item.spec.port}</span>
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">不保存到会话列表</div>
                        </div>
                        {isSel && <CornerDownLeft size={14} className="text-[var(--text-muted)] shrink-0" />}
                      </button>
                    );
                  }
                  const s = item.session;
                  const conn = isConnected(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleConnect(s)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      onContextMenu={(e) => showCtx(e, sessionCtx(s))}
                      className={rowCls}
                    >
                      <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--bg-surface)]">
                        {kindIcon(s.kind)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-[var(--text-primary)] truncate font-medium">
                            {s.name || s.host}
                          </span>
                          {conn && (
                            <span className="shrink-0 flex items-center gap-1 text-[10px] text-[var(--color-success)]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)]" />
                              已连接
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate font-mono">
                          {hostLine(s)}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                        {s.group || "Default"}
                      </span>
                      {isSel && <CornerDownLeft size={14} className="text-[var(--text-muted)] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-sm text-[var(--text-muted)]">
              <Terminal size={28} className="opacity-25" />
              <span>还没有保存的会话</span>
              <button
                onClick={() => newConnection()}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-sm font-semibold text-[var(--accent)] bg-[var(--accent-dim)] border border-[var(--accent-border)] hover:bg-accent/25 transition-colors"
              >
                <Plus size={15} />
                新建连接
              </button>
            </div>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsed.has(group.name);
              const mi = movableNames.indexOf(group.name);
              return (
                <div
                  key={group.name}
                  className="mb-2.5 last:mb-0 rounded-xl bg-[var(--bg-sunken)] overflow-hidden"
                >
                  <button
                    onClick={() => toggleGroup(group.name)}
                    onContextMenu={(e) => showCtx(e, [
                      {
                        label: "在此新建连接",
                        icon: <Plus size={13} />,
                        onClick: () => newConnectionIn(group.name),
                      },
                      null,
                      {
                        label: isCollapsed ? "展开" : "折叠",
                        icon: isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />,
                        onClick: () => toggleGroup(group.name),
                      },
                      { label: "上移", icon: <ArrowUp size={13} />, disabled: mi <= 0, onClick: () => moveGroup(group.name, -1) },
                      { label: "下移", icon: <ArrowDown size={13} />, disabled: mi < 0 || mi >= movableNames.length - 1, onClick: () => moveGroup(group.name, 1) },
                      { label: "按名称重排", icon: <ArrowUpDown size={13} />, onClick: sortGroupsByName },
                      null,
                      { label: "重命名", icon: <Edit3 size={13} />, onClick: () => handleRenameGroup(group.name) },
                      null,
                      { label: "删除分组", icon: <Trash2 size={13} />, onClick: () => handleDeleteGroup(group.name), danger: true },
                    ])}
                    className="w-full flex items-center gap-2 pl-3.5 pr-3 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                    />
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {group.name}
                    </span>
                    {group.connected > 0 && (
                      <span className="shrink-0 text-[11px] text-[var(--color-success)]">
                        {group.connected} 在线
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded-full">
                      {group.sessions.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    group.sessions.length === 0 ? (
                      <div className="px-2.5 pb-2.5 pt-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-muted)]">此分组内暂无会话</span>
                        <button
                          onClick={() => newConnectionIn(group.name)}
                          className="shrink-0 flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
                        >
                          <Plus size={12} />
                          在此新建连接
                        </button>
                      </div>
                    ) : (
                      <div
                        className="grid gap-2 px-2 pb-2 pt-0.5"
                        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
                      >
                        {group.sessions.map((s) => (
                          <SessionCard
                            key={s.id}
                            session={s}
                            active={isActive(s.id)}
                            connected={isConnected(s.id)}
                            onConnect={() => handleConnect(s)}
                            onContextMenu={(e) => showCtx(e, sessionCtx(s))}
                          />
                        ))}
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex-shrink-0">
          {trimmed ? (
            <>
              <span>↑↓ 选择</span>
              <span>↵ 连接</span>
            </>
          ) : (
            <>
              <span>点击卡片连接</span>
              <span>组头 / 卡片右键：分组管理</span>
            </>
          )}
          <span>Esc 关闭</span>
          <span className="ml-auto">{sessions.length} 个会话</span>
        </div>
      </div>

      {ctx && (
        <ContextMenu items={ctx.items} x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}

function SessionCard({
  session,
  active,
  connected,
  onConnect,
  onContextMenu,
}: {
  session: SessionConfig;
  active: boolean;
  connected: boolean;
  onConnect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(formatSessionInfo(session))
      .then(() => {
        setCopied(true);
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  return (
    <div
      data-session-card
      role="button"
      tabIndex={0}
      onClick={onConnect}
      onKeyDown={(e) => { if (e.key === "Enter") onConnect(); }}
      onContextMenu={onContextMenu}
      className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer outline-none transition-all duration-200 ${
        active
          ? "bg-[var(--surface-selected)] border-[var(--accent-border)]"
          : connected
            ? "bg-[var(--bg-surface)] border-success/35 hover:bg-[var(--surface-hover)]"
            : "bg-[var(--bg-surface)] border-transparent hover:bg-[var(--surface-hover)]"
      }`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">{kindIcon(session.kind)}</span>
          <span className={`flex-1 min-w-0 truncate text-sm ${
            active
              ? "font-semibold text-[var(--text-primary)]"
              : connected
                ? "font-medium text-[var(--color-success)]"
                : "text-[var(--text-primary)]"
          }`}>
            {session.name || session.host}
          </span>
          {connected && (
            <span className="shrink-0 flex items-center gap-1 text-[10px] text-[var(--color-success)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)]" />
              已连接
            </span>
          )}
        </div>

        <div className="text-xs text-[var(--text-muted)] truncate font-mono">
          {hostLine(session)}
        </div>
      </div>

      {/* 常驻的复制按钮（比原来那两个小按钮大一倍） */}
      <button
        onClick={handleCopy}
        title="复制会话信息"
        aria-label="复制会话信息"
        className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
          copied
            ? "border-success/40 bg-[var(--bg-elevated)] text-[var(--color-success)]"
            : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-dim)]"
        }`}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}
