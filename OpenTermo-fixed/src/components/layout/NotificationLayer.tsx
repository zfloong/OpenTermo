import { useCallback, useState } from "react";
import { Copy, ChevronDown, ChevronUp } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";

/**
 * Transient notices (mount results, connection errors) float over the top of
 * the terminal area. Overlay rather than a layout row on purpose: adding or
 * removing a row resizes #terminal-area, which refits xterm and pushes a
 * resize to the remote shell — visible flicker for a 4-second message.
 */
export default function NotificationLayer() {
  const lastError = useSessionStore((s) => s.lastError);
  const clearError = useSessionStore((s) => s.clearError);
  const lastInfo = useSessionStore((s) => s.lastInfo);
  const clearInfo = useSessionStore((s) => s.clearInfo);

  if (!lastError && !lastInfo) return null;

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center px-4 pt-2 pointer-events-none">
      <div className="w-full max-w-2xl max-h-[45vh] overflow-y-auto rounded-lg pointer-events-auto">
        {lastError ? (
          <ErrorBanner error={lastError} onDismiss={clearError} />
        ) : lastInfo ? (
          <InfoBanner info={lastInfo} onDismiss={clearInfo} />
        ) : null}
      </div>
    </div>
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
    // Solid backdrop: the card floats over live terminal text, a 10% tint alone
    // would let the output underneath show through.
    <div className="w-full rounded-lg bg-[var(--bg-elevated)] shadow-lg">
      <div className="flex items-start gap-2 bg-danger/10 border border-danger/25 rounded-lg px-3 py-2 text-xs">
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

// ── Transient success banner ─────────────────────────────────────────────

function InfoBanner({ info, onDismiss }: { info: string; onDismiss: () => void }) {
  return (
    <div className="w-full rounded-lg bg-[var(--bg-elevated)] shadow-lg">
      <div className="flex items-center gap-2 bg-success/10 border border-success/25 rounded-lg px-3 py-2 text-xs">
        <span className="text-[var(--color-success)] font-bold flex-shrink-0">&#10003;</span>
        <span className="flex-1 min-w-0 text-[var(--color-success)] font-medium break-all">{info}</span>
        <button
          onClick={onDismiss}
          className="px-2 py-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-bold flex-shrink-0"
          title="关闭"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
