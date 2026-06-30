import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftOpen, Edit3, Trash2, ChevronRight } from "lucide-react";
import { useUIStore, MIN_SIDEBAR_WIDTH } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useCommandStore } from "@/stores/commandStore";
import { resolveCommandTemplate } from "@/lib/utils";
import type { CommandEntry } from "@/lib/tauriCommands";
import { invoke } from "@tauri-apps/api/core";
import SessionManager from "@/components/SessionManager";
import LogDialog from "@/components/LogDialog";
import AddCommandDialog from "@/components/AddCommandDialog";
import ContextMenu, { type ContextMenuItem } from "@/components/ui/context-menu";

export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [userInfo, setUserInfo] = useState({ username: "...", computer: "..." });
  const [scriptsOpen, setScriptsOpen] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [cmdExpanded, setCmdExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [addCmdOpen, setAddCmdOpen] = useState(false);
  const [editCmdEntry, setEditCmdEntry] = useState<CommandEntry | undefined>(undefined);
  const [logOpen, setLogOpen] = useState(false);
  const [cmdCtx, setCmdCtx] = useState<{ items: (ContextMenuItem | null)[]; x: number; y: number } | null>(null);
  const commandEntries = useCommandStore((s) => s.entries);
  const loadCommands = useCommandStore((s) => s.load);
  const removeCommand = useCommandStore((s) => s.remove);
  const recordUsage = useCommandStore((s) => s.recordUsage);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const tabs = useSessionStore((s) => s.tabs);
  const sendInput = useSessionStore((s) => s.sendInput);
  const triggerScroll = useSessionStore((s) => s.triggerScroll);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const dragging = useRef(false);

  const cmdClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmdClickEntry = useRef<{ command: string; id: string } | null>(null);

  const handleCmdClick = useCallback((entry: { command: string; id: string }) => {
    if (!activeTabId) return;
    // If this is a second click within 300ms → treat as double-click
    if (cmdClickEntry.current?.id === entry.id && cmdClickTimer.current) {
      clearTimeout(cmdClickTimer.current);
      cmdClickTimer.current = null;
      cmdClickEntry.current = null;
      // Double-click: execute immediately (send + newline)
      const resolved = resolveCommandTemplate(entry.command, activeTab?.session);
      sendInput(activeTabId, resolved + "\n");
      triggerScroll(activeTabId);
      recordUsage(entry.id);
      return;
    }
    // First click: schedule send to terminal (without newline)
    cmdClickEntry.current = entry;
    cmdClickTimer.current = setTimeout(() => {
      cmdClickTimer.current = null;
      cmdClickEntry.current = null;
      const resolved = resolveCommandTemplate(entry.command, activeTab?.session);
      sendInput(activeTabId, resolved);
      triggerScroll(activeTabId);
      recordUsage(entry.id);
    }, 250);
  }, [activeTabId, activeTab, sendInput, triggerScroll, recordUsage]);

  const showCmdCtx = (e: React.MouseEvent, entry: CommandEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const items: (ContextMenuItem | null)[] = [
      { label: "编辑", icon: <Edit3 size={13} />, onClick: () => setEditCmdEntry(entry) },
      null,
      { label: "删除", icon: <Trash2 size={13} />, onClick: async () => {
        if (confirm(`删除脚本 "${entry.label}"?`)) {
          await removeCommand(entry.id);
          await loadCommands();
        }
      }, danger: true },
    ];
    setCmdCtx({ items, x: e.clientX, y: e.clientY });
  };

  const startX = useRef(0);
  const startWidth = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragging.current = true; startX.current = e.clientX;
    startWidth.current = sidebarWidth || MIN_SIDEBAR_WIDTH;
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const mm = (e: MouseEvent) => { if (!dragging.current) return; setSidebarWidth(startWidth.current + e.clientX - startX.current); };
    const mu = () => { if (!dragging.current) return; dragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
    return () => { document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); };
  }, [setSidebarWidth]);

  useEffect(() => {
    invoke<{ username: string; computer: string }>("get_local_user_info").then(setUserInfo).catch(() => {});
  }, []);

  useEffect(() => { loadCommands(); }, []);

  // Auto-expand all command categories when entries load
  useEffect(() => {
    const cats = [...new Set(commandEntries.map((e) => e.category).filter(Boolean))];
    if (cats.length === 0) return;
    setCmdExpanded((prev) => {
      let changed = false;
      for (const c of cats) { if (!prev.has(c)) { changed = true; prev = new Set(prev); prev.add(c); } }
      return changed ? prev : prev;
    });
  }, [commandEntries]);

  return (<>
    {!isOpen && (
      <button onClick={toggleSidebar} title="展开侧栏" className="absolute left-3 top-12 z-50 w-8 h-8 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 backdrop-blur-sm transition-all">
        <PanelLeftOpen size={16} />
      </button>
    )}

    <aside
      className="flex flex-col flex-shrink-0 overflow-hidden relative"
      style={{
        width: sidebarWidth,
        background: "var(--bg-glass)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderRight: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center gap-2 px-2 h-10 flex-shrink-0 cursor-pointer group" data-tauri-drag-region>
        <div className="rounded bg-surface-variant border border-outline-variant/30 flex items-center justify-center overflow-hidden relative w-5 h-5">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: "14px" }}>shield_person</span>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-primary leading-tight text-[10px]">Root Node</span>
          <span className="text-[9px] font-terminal-mono text-on-surface-variant leading-tight">{userInfo.username}@{userInfo.computer}</span>
        </div>
      </div>

      {/* 可滚动区域：已保存连接 + 脚本命令 */}
      <div className="flex-1 overflow-y-auto">
        {/* 搜索栏 */}
        <div className="px-3 pt-2 pb-1">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[14px]">search</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/20 text-terminal-mono font-terminal-mono text-on-surface rounded py-1 pl-7 pr-2 text-xs focus:outline-none focus:border-primary/50 placeholder:text-outline/30"
              placeholder="搜索会话名称或主机..."
              type="text"
            />
          </div>
        </div>
        {/* 已保存的连接列表 - 可折叠 */}
        <div className="px-2">
        <div className="w-full flex items-center justify-between px-3 py-2 mb-1 hover:bg-surface-variant/20 active:bg-transparent transition-colors rounded-lg group cursor-pointer" onClick={() => setSessionsOpen(!sessionsOpen)}>
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[16px] text-outline/50 transition-transform duration-200 group-hover:text-outline ${sessionsOpen ? "" : "-rotate-90"}`}>expand_more</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline/80 group-hover:text-on-surface">终端列表</span>
          </div>
        </div>
        <div className={sessionsOpen || searchQuery ? "" : "hidden"}>
          <SessionManager searchQuery={searchQuery} />
        </div>
        </div>

        {/* 分割线 */}
        <div className="mx-3 my-2 h-px bg-outline-variant/8" />

        {/* 脚本命令 */}
        <div className="px-2">
        <div className="w-full flex items-center justify-between px-3 py-2 mb-1.5 hover:bg-surface-variant/20 active:bg-transparent transition-colors rounded-lg group cursor-pointer" onClick={() => setScriptsOpen(!scriptsOpen)}>
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[16px] text-outline/50 transition-transform duration-200 group-hover:text-outline ${scriptsOpen ? "" : "-rotate-90"}`}>expand_more</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline/80 group-hover:text-on-surface">脚本命令</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-outline/40 hover:text-secondary cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); setAddCmdOpen(true); }}>add</span>
          </div>
        </div>

        <div className={scriptsOpen || searchQuery ? "" : "hidden"}>
          {commandEntries.length === 0 ? (
            <div className="py-6 text-center">
              <span className="text-[11px] text-outline/30">暂无脚本命令</span>
            </div>
          ) : (
            (() => {
              // Filter by search query
              const filtered = searchQuery
                ? commandEntries.filter((e) =>
                    (e.label || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (e.command || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (e.category || "").toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : commandEntries;
              // Group commands by category
              const ungrouped = filtered.filter((e) => !e.category || e.category === "uncategorized");
              const grouped: Record<string, typeof filtered> = {};
              for (const e of filtered) {
                if (!e.category || e.category === "uncategorized") continue;
                if (!grouped[e.category]) grouped[e.category] = [];
                grouped[e.category].push(e);
              }
              const groupKeys = Object.keys(grouped).sort();
              return (
                <>
                  {/* 无分类命令 — 直接显示 */}
                  {ungrouped.length > 0 && (
                    <div className="space-y-1 px-2 pb-2">
                      {ungrouped.map((entry) => (
                        <button key={entry.id} onClick={() => handleCmdClick(entry)} onContextMenu={(e) => showCmdCtx(e, entry)} className="group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all bg-surface-container-low/30 border border-transparent hover:bg-surface-variant/25 hover:border-outline-variant/10 select-none">
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-variant/25 text-outline/60 group-hover:text-secondary group-hover:bg-secondary/8 flex-shrink-0 transition-all">
                            <span className="material-symbols-outlined text-[16px]">terminal</span>
                          </div>
                          <span className="flex-1 text-left text-[12px] font-medium text-on-surface-variant group-hover:text-on-surface truncate transition-colors">{entry.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 有分类命令 — 分组显示 */}
                  {groupKeys.map((cat) => (
                    <div key={cat}>
                      <button
                        onClick={() => setCmdExpanded((prev) => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; })}
                        className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-surface-variant/15 active:bg-transparent transition-colors rounded-md group/gh mb-0.5"
                      >
                        <span className={`material-symbols-outlined text-[14px] text-outline/40 transition-transform duration-200 group-hover/gh:text-outline/60 ${cmdExpanded.has(cat) ? "" : "-rotate-90"}`}>expand_more</span>
                        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-outline/40 group-hover/gh:text-outline/60">{cat}</span>
                      </button>
                      {cmdExpanded.has(cat) && (
                        <div className="space-y-1 px-2 pb-2">
                          {grouped[cat].slice(0, 20).map((entry) => (
                            <button key={entry.id} onClick={() => handleCmdClick(entry)} onContextMenu={(e) => showCmdCtx(e, entry)} className="group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all bg-surface-container-low/30 border border-transparent hover:bg-surface-variant/25 hover:border-outline-variant/10 select-none">
                              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-variant/25 text-outline/60 group-hover:text-secondary group-hover:bg-secondary/8 flex-shrink-0 transition-all">
                                <span className="material-symbols-outlined text-[16px]">terminal</span>
                              </div>
                              <span className="flex-1 text-left text-[12px] font-medium text-on-surface-variant group-hover:text-on-surface truncate transition-colors">{entry.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              );
            })()
          )}
          </div>
      </div>
      </div>{/* end scrollable area */}

      <div className="px-2 mt-auto border-t border-outline-variant/10 pt-4 space-y-1">
        <button onClick={() => setLogOpen(true)} className="flex items-center gap-3 px-3 py-2 rounded text-on-surface-variant hover:bg-surface-variant/30 transition-all border-l-4 border-transparent active:translate-x-1 duration-200 cursor-pointer">
          <span className="material-symbols-outlined text-[20px]">list_alt</span>
          <span className="text-label-sm font-label-sm">日志</span>
        </button>
      </div>

      <div
        onMouseDown={onDragStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10"
      />
    </aside>

    {addCmdOpen && (
      <AddCommandDialog onClose={() => { setAddCmdOpen(false); setEditCmdEntry(undefined); }} />
    )}
    {editCmdEntry && (
      <AddCommandDialog editEntry={editCmdEntry} onClose={() => { setEditCmdEntry(undefined); loadCommands(); }} />
    )}
    {cmdCtx && (
      <ContextMenu items={cmdCtx.items} x={cmdCtx.x} y={cmdCtx.y} onClose={() => setCmdCtx(null)} />
    )}
    {logOpen && <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />}
  </>);
}

/** 终端列表子组件 - 显示当前打开的会话标签 */
function TerminalList() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const setActiveTab = useSessionStore((s) => s.setActiveTab);
  const disconnect = useSessionStore((s) => s.disconnect);

  if (tabs.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="text-[10px] text-outline/50">暂无打开的终端</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const statusColor =
          tab.status === "connected" ? "text-secondary" :
          tab.status === "connecting" ? "text-warning" :
          "text-on-surface-variant";
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all group ${
              isActive
                ? "bg-surface-variant/40 text-on-surface border-l-2 border-secondary"
                : "text-on-surface-variant hover:bg-surface-variant/20 hover:text-on-surface border-l-2 border-transparent"
            }`}
          >
            <span className={`material-symbols-outlined text-[14px] ${statusColor}`}>
              {tab.status === "connected" ? "terminal" : tab.status === "connecting" ? "hourglass_top" : "close"}
            </span>
            <span className="text-[12px] truncate flex-1">{tab.session.name || tab.session.host}</span>
            <button
              onClick={(e) => { e.stopPropagation(); disconnect(tab.id); }}
              className="opacity-0 group-hover:opacity-100 text-outline hover:text-error transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
