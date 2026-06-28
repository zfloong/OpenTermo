import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

interface LogData {
  files: { name: string; path: string; size: number; modified: string }[];
  entries: LogEntry[];
}

const LEVELS = ["ALL", "INFO", "WARN", "ERROR", "DEBUG"] as const;
const LEVEL_COLORS: Record<string, string> = {
  ERROR: "text-red-400",
  WARN:  "text-yellow-400",
  INFO:  "text-secondary",
  DEBUG: "text-outline/60",
  TRACE: "text-outline/40",
};

export default function LogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<LogData | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      const result = await invoke<LogData>("read_logs");
      setData(result);
    } catch (err) {
      console.error("读取日志失败:", err);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    if (!open) return;
    loadLogs();
    if (autoRefresh) {
      timerRef.current = setInterval(loadLogs, 3000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, autoRefresh, loadLogs]);

  // Auto-scroll to bottom on new data
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const filtered = data?.entries.filter((e) => {
    if (filter !== "ALL" && e.level !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) ?? [];

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl w-[90vw] h-[80vh] flex flex-col bg-[#131313] border border-outline-variant/20 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 pt-5 pb-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary text-[22px]">list_alt</span>
            <h2 className="text-lg font-bold text-on-surface">系统日志</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-variant/30 transition-all">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-outline-variant/10">
          {/* Level filter */}
          <div className="flex items-center gap-1 bg-surface-container-lowest rounded-lg p-0.5 border border-outline-variant/15">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilter(lvl)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  filter === lvl
                    ? "bg-secondary/20 text-secondary shadow-sm"
                    : "text-outline hover:text-on-surface"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[14px]">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/15 rounded-lg py-1.5 pl-8 pr-3 text-xs text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-primary/40 transition-colors font-terminal-mono"
              placeholder="搜索日志..."
            />
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              autoRefresh
                ? "bg-secondary/10 text-secondary border-secondary/20"
                : "text-outline border-outline-variant/15 hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            {autoRefresh ? "实时" : "暂停"}
          </button>

          {/* Manual refresh */}
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-outline border border-outline-variant/15 hover:text-on-surface hover:bg-surface-variant/20 transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">sync</span>
            刷新
          </button>

          {/* File info */}
          {data?.files[0] && (
            <span className="text-[10px] text-outline/50 ml-auto font-terminal-mono">
              {data.files[0].name} · {(data.files[0].size / 1024).toFixed(0)} KB
            </span>
          )}
        </div>

        {/* Log entries */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto font-terminal-mono text-[12px] leading-relaxed p-4 space-y-0.5"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-outline/40">
              <span className="material-symbols-outlined text-[32px]">sentiment_neutral</span>
              <span className="text-xs">暂无日志</span>
            </div>
          ) : (
            filtered.map((entry, i) => {
              // Color the full line based on level
              const lvlColor = LEVEL_COLORS[entry.level] || "text-outline/70";
              return (
                <div key={i} className={`${lvlColor} hover:bg-surface-variant/10 px-2 py-0.5 rounded transition-colors`}>
                  <span>{entry.message}</span>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
