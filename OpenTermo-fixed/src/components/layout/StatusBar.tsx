import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { getSystemStats, type SystemSnapshot } from "@/lib/tauriCommands";

export default function StatusBar() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
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
    <footer className="flex h-8 items-center bg-[var(--bg-glass)] backdrop-blur-[var(--glass-blur,18px)] frame-edge-t px-3 flex-shrink-0 gap-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        {activeTab ? (
          <div className="flex items-center gap-2 bg-[var(--surface-hover)] rounded-full px-2.5 py-0.5">
            <span className={"status-dot " + (activeTab.status === "connected" ? "connected" : activeTab.status === "connecting" ? "connecting" : "disconnected")} />
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

const CHIP_TONES = {
  danger: "bg-danger/[0.07] border border-danger/[0.13] text-danger",
  warning: "bg-warning/[0.07] border border-warning/[0.13] text-warning",
  success: "bg-success/[0.07] border border-success/[0.13] text-success",
  muted: "text-[var(--text-secondary)]",
} as const;

function MonitorChip({ label, value, pct }: { label: string; value: string; pct?: number }) {
  const tone = pct == null ? "muted" : pct >= 85 ? "danger" : pct >= 60 ? "warning" : "success";
  return (
    <span className={`flex items-center gap-1 flex-shrink-0 rounded-full px-2 py-0.5 font-mono tabular-nums ${CHIP_TONES[tone]}`}>
      <span className="opacity-60 text-xs">{label}</span><span>{value}</span>
    </span>
  );
}

function percent(v: number) { return v.toFixed(1) + "%"; }
function mib(used: number, total: number) { if (total === 0) return "\u2014"; return (used / 1024).toFixed(1) + "/" + (total / 1024).toFixed(1) + "G"; }
function kibToGiB(usedKib: number, totalKib: number) { if (totalKib === 0) return "\u2014"; const ug = usedKib / 1024 / 1024; const tg = totalKib / 1024 / 1024; return ug.toFixed(1) + "/" + tg.toFixed(1) + "G"; }
function formatBytes(bytes: number) { if (bytes < 1024) return bytes.toFixed(0) + "B/s"; if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "K/s"; return (bytes / (1024 * 1024)).toFixed(1) + "M/s"; }
