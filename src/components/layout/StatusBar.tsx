import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { getSystemStats, type SystemSnapshot } from "@/lib/tauriCommands";

export default function StatusBar() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [stats, setStats] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await getSystemStats();
        if (active) setStats(s);
      } catch {
        // ignore
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <footer className="flex h-6 items-center bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-3 flex-shrink-0 gap-3">
      {/* Left: connection status */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {activeTab ? (
          <>
            <span
              className={`status-dot ${activeTab.status === "connected" ? "connected" : "connecting"}`}
            />
            <span className="text-[11px] text-[var(--text-secondary)]">
              {activeTab.session.name || activeTab.session.host}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
              — {activeTab.statusText}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">Ready</span>
        )}
      </div>

      {/* Center: system monitor inline */}
      {stats && (
        <div className="flex items-center gap-3 min-w-0 overflow-hidden text-[11px]">
          <MonitorItem
            label="CPU"
            value={percent(stats.cpuPercent)}
            pct={stats.cpuPercent}
          />
          <MonitorItem
            label="Mem"
            value={mib(stats.memUsedMib, stats.memTotalMib)}
            pct={stats.memPercent}
          />
          {stats.swapTotalMib > 0 && (
            <MonitorItem
              label="Swap"
              value={mib(stats.swapUsedMib, stats.swapTotalMib)}
              pct={stats.swapPercent}
            />
          )}
          <MonitorItem label="↓" value={formatBytes(stats.netRxPerSec)} />
          <MonitorItem label="↑" value={formatBytes(stats.netTxPerSec)} />
        </div>
      )}

      {/* Right: session count */}
      <div className="flex-1" />
      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0">
        {tabs.length > 0 &&
          `${tabs.length} session${tabs.length > 1 ? "s" : ""}`}
      </span>
    </footer>
  );
}

// ── Inline monitor chip ────────────────────────────────────────────────────

function MonitorItem({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct?: number;
}) {
  return (
    <span
      className="flex items-center gap-1 flex-shrink-0"
      style={{ color: pct != null ? colorForPercent(pct) : "var(--text-secondary)" }}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function colorForPercent(pct: number): string {
  if (pct >= 85) return "var(--color-danger)";
  if (pct >= 60) return "var(--color-warning)";
  return "var(--color-success)";
}

function percent(v: number) {
  return `${v.toFixed(1)}%`;
}

function mib(used: number, total: number) {
  if (total === 0) return "—";
  return `${(used / 1024).toFixed(1)}/${(total / 1024).toFixed(1)}G`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toFixed(0)}B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M/s`;
}
