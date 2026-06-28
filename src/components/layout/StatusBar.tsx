import { useEffect, useState } from "react";
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
    <footer
      className="flex items-center justify-between h-footer_height px-4 flex-shrink-0 z-50 bg-surface-container-lowest border-t border-outline-variant/30 opacity-80 hover:opacity-100 transition-opacity"
    >
      <div className="font-terminal-mono text-on-surface text-xs">
        OpenTermo v2.4.0-stable
      </div>

      <div className="flex items-center gap-4 text-status-chip font-status-chip">
        {remoteStats ? (<>
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">memory</span>} label="处理器" value={remoteStats.cpu_percent.toFixed(0) + "%"} color="secondary" />
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">storage</span>} label="内存" value={kibToGiB(remoteStats.mem_used_kib, remoteStats.mem_total_kib)} color="tertiary" />
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">speed</span>} label="网络" value={formatBytes(localStats?.netRxPerSec ?? 0) + "/" + formatBytes(localStats?.netTxPerSec ?? 0)} color="primary" />
        </>) : localStats ? (<>
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">memory</span>} label="处理器" value={localStats.cpuPercent.toFixed(0) + "%"} color="secondary" />
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">storage</span>} label="内存" value={mib(localStats.memUsedMib, localStats.memTotalMib)} color="tertiary" />
          <TelemetryChip icon={<span className="material-symbols-outlined text-[12px]">speed</span>} label="网络" value={formatBytes(localStats.netRxPerSec) + "/" + formatBytes(localStats.netTxPerSec)} color="primary" />
        </>) : null}
      </div>
    </footer>
  );
}

function TelemetryChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: "primary" | "secondary" | "tertiary" }) {
  const colors: Record<string, string> = {
    primary: "var(--primary)",
    secondary: "var(--secondary)",
    tertiary: "var(--tertiary)",
  };
  const colorVar = colors[color];

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded border transition-colors cursor-pointer hover:opacity-100" style={{
      color: colorVar,
      backgroundColor: `${colorVar}5`,
      borderColor: `${colorVar}10`,
    } as React.CSSProperties}>
      {icon}
      <span>{label}: {value}</span>
    </div>
  );
}

function mib(used: number, total: number) {
  if (total === 0) return "—";
  return (used / 1024).toFixed(1) + "GB";
}
function kibToGiB(usedKib: number, totalKib: number) {
  if (totalKib === 0) return "—";
  const ug = usedKib / 1024 / 1024;
  return ug.toFixed(1) + "GB";
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes.toFixed(0) + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}