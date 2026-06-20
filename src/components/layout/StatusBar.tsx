import { useSessionStore } from "@/stores/sessionStore";

export default function StatusBar() {
  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeTabId);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <footer className="flex h-7 items-center justify-between bg-[var(--surface-bright)] border-t border-[var(--border)] px-3 flex-shrink-0">
      <span className="text-xs text-[var(--text-secondary)]">
        {activeTab
          ? `${activeTab.session.name} — ${activeTab.statusText}`
          : "Ready"}
      </span>
      <span className="text-xs text-[var(--text-secondary)]">
        {tabs.length > 0 && `${tabs.length} session${tabs.length > 1 ? "s" : ""}`}
      </span>
    </footer>
  );
}
