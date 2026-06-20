import { useEffect, useState } from "react";
import { PanelLeftOpen, PanelLeftClose, Activity, Zap } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useSessionStore } from "@/stores/sessionStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getSystemStats, type SystemSnapshot } from "@/lib/tauriCommands";

export default function Sidebar() {
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className="flex flex-col bg-[var(--surface)] border-r border-[var(--border)] overflow-hidden flex-shrink-0 transition-all duration-200 ease-in-out"
      style={{ width: isOpen ? 260 : 0 }}
    >
      <div className="w-[260px] flex flex-col h-full">
        {/* header */}
        <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--border)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Resources
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[var(--text-secondary)] hover:text-[var(--text)]"
            onClick={toggleSidebar}
          >
            {isOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </Button>
        </div>

        <Tabs defaultValue="monitor" className="flex flex-col flex-1 px-2 pt-2">
          <TabsList className="w-full">
            <TabsTrigger value="monitor" className="flex-1 gap-1.5">
              <Activity size={14} />
              <span>Monitor</span>
            </TabsTrigger>
            <TabsTrigger value="commands" className="flex-1 gap-1.5">
              <Zap size={14} />
              <span>Commands</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitor" className="flex-1 overflow-auto mt-1">
            <SystemMonitorPanel />
          </TabsContent>

          <TabsContent
            value="commands"
            className="flex-1 flex items-center justify-center text-sm text-[var(--text-secondary)]"
          >
            <p>No saved commands</p>
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}

/** Polls local system stats and renders a compact dashboard. */
function SystemMonitorPanel() {
  const [stats, setStats] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const s = await getSystemStats();
        if (active) setStats(s);
      } catch {
        // Command not available? Retry later.
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* CPU */}
      <StatBlock label="CPU" value={percent(stats.cpuPercent)} color="var(--primary)" bar={stats.cpuPercent} />
      {/* Memory */}
      <StatBlock label="Memory" value={mib(stats.memUsedMib, stats.memTotalMib)} color="var(--info)" bar={stats.memPercent} />
      {/* Swap */}
      {stats.swapTotalMib > 0 && (
        <StatBlock label="Swap" value={mib(stats.swapUsedMib, stats.swapTotalMib)} color="var(--warning)" bar={stats.swapPercent} />
      )}
      {/* Network */}
      <StatBlock label="NET ↓" value={formatBytes(stats.netRxPerSec)} color="var(--secondary)" />
      <StatBlock label="NET ↑" value={formatBytes(stats.netTxPerSec)} color="var(--secondary)" />
    </div>
  );
}

function StatBlock({
  label,
  value,
  color,
  bar,
}: {
  label: string;
  value: string;
  color: string;
  bar?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span style={{ color }} className="font-mono tabular-nums">
          {value}
        </span>
      </div>
      {bar != null && (
        <div className="h-1 bg-[var(--surface-bright)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, bar)}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

function percent(v: number) {
  return `${v.toFixed(1)}%`;
}

function mib(used: number, total: number) {
  if (total === 0) return "—";
  return `${(used / 1024).toFixed(1)} / ${(total / 1024).toFixed(1)} GiB`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
}
