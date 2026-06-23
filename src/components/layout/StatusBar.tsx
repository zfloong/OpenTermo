import { useEffect, useState, useCallback } from "react";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { getSystemStats, type SystemSnapshot } from "@/lib/tauriCommands";

export default function StatusBar() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const lastError = useSessionStore((s) => s.lastError);
  const clearError = useSessionStore((s) => s.clearError);
  const [localStats, setLocalStats] = useState<SystemSnapshot | null>(null);
  const remoteStats = activeTab?.remoteStats ?? null;

  useEffect(() => {
    let active = true;
    const poll = async () => { try { const s = await getSystemStats(); if (active) setLocalStats(s); } catch {} };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <footer className="flex h-8 items-center bg-[var(--bg-glass)] backdrop-blur-[var(--glass-blur,18px)] border-t border-[var(--border-strong)] px-3 flex-shrink-0 gap-3">
      {lastError && (
        <ErrorBanner error={lastError} onDismiss={clearError} />
      )}
      <div className="flex items-center gap-2 flex-shrink-0">
        {activeTab ? (
          <div className="flex items-center gap-2 bg-[var(--surface-hover)] rounded-full px-2.5 py-0.5">
            <span className={"status-dot " + (activeTab.status === "connected" ? "connected" : "connecting")} />
            <span className="text-xs text-[var(--text-primary)] font-medium">{activeTab.session.name || activeTab.session.host}</span>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">&middot; {activeTab.statusText}</span>
          </div>
        ) : <span className="text-xs text-[var(--text-muted)]">就绪</span>}
      </div>
      <div className="flex items-center gap-2 ml-4 min-w-0 overflow-hidden text-xs">
        {remoteStats ? (<>
          <MonitorChip label="CPU" value={remoteStats.cpu_percent.toFixed(1) + "%"} />
          <MonitorChip label="Mem" value={kibToGiB(remoteStats.mem_used_kib, remoteStats.mem_total_kib)} pct={remoteStats.mem_total_kib > 0 ? (remoteStats.mem_used_kib / remoteStats.mem_total_kib) * 100 : undefined} />
        </>) : localStats ? (<>
          <MonitorChip label="CPU" value={percent(localStats.cpuPercent)} pct={localStats.cpuPercent} />
          <MonitorChip label="Mem" value={mib(localStats.memUsedMib, localStats.memTotalMib)} pct={localStats.memPercent} />
          {localStats.swapTotalMib > 0 && <MonitorChip label="Swap" value={mib(localStats.swapUsedMib, localStats.swapTotalMib)} pct={localStats.swapPercent} />}
          <MonitorChip label="&darr;" value={formatBytes(localStats.netRxPerSec)} />
          <MonitorChip label="&uarr;" value={formatBytes(localStats.netTxPerSec)} />
        </>) : null}
      </div>
      <div className="flex-1" />
      <span className="text-xs text-[var(--text-muted)] flex-shrink-0 tabular-nums">{tabs.length > 0 && tabs.length + " 个会话"}</span>
    </footer>
  );
}

// ── Error banner with copy ──────────────────────────────────────────────

function ErrorBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = error;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [error]);

  // Truncate for collapsed view
  const preview = error.length > 120 ? error.slice(0, 120) + "..." : error;

  return (
    <div className="flex-shrink-0 w-full text-xs">
      <div className="flex items-start gap-2 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/25 rounded-lg px-3 py-2">
        {/* Error icon */}
        <span className="text-[var(--color-danger)] font-bold mt-0.5 flex-shrink-0">!</span>

        {/* Error text */}
        <div className="flex-1 min-w-0">
          <div className="text-[var(--color-danger)] font-medium leading-relaxed break-all">
            {expanded ? error : preview}
          </div>
          {error.length > 120 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] mt-0.5 transition-colors"
            >
              {expanded ? (
                <><ChevronUp size={12} /> 收起</>
              ) : (
                <><ChevronDown size={12} /> 展开完整日志</>
              )}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="复制错误日志"
          >
            <Copy size={12} />
            <span className="hidden sm:inline">{copied ? "已复制" : "复制"}</span>
          </button>
          <button
            onClick={onDismiss}
            className="px-2 py-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-bold"
            title="关闭"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}

function MonitorChip({ label, value, pct }: { label: string; value: string; pct?: number }) {
  const color = pct != null ? (pct >= 85 ? "var(--color-danger)" : pct >= 60 ? "var(--color-warning)" : "var(--color-success)") : "var(--text-secondary)";
  return (
    <span className="flex items-center gap-1 flex-shrink-0 rounded-full px-2 py-0.5 font-mono tabular-nums" style={{ color, background: color + "12", border: "1px solid " + color + "22" }}>
      <span className="opacity-60 text-xs">{label}</span><span>{value}</span>
    </span>
  );
}

function percent(v: number) { return v.toFixed(1) + "%"; }
function mib(used: number, total: number) { if (total === 0) return "\u2014"; return (used / 1024).toFixed(1) + "/" + (total / 1024).toFixed(1) + "G"; }
function kibToGiB(usedKib: number, totalKib: number) { if (totalKib === 0) return "\u2014"; const ug = usedKib / 1024 / 1024; const tg = totalKib / 1024 / 1024; return ug.toFixed(1) + "/" + tg.toFixed(1) + "G"; }
function formatBytes(bytes: number) { if (bytes < 1024) return bytes.toFixed(0) + "B/s"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "K/s"; return (bytes / (1024 * 1024)).toFixed(1) + "M/s"; }
