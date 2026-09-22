import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Nested submenu items */
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: (ContextMenuItem | null)[];
  x: number;
  y: number;
  onClose: () => void;
}

function MenuItem({ item, onClose, depth = 0 }: { item: ContextMenuItem; onClose: () => void; depth?: number }) {
  const [subOpen, setSubOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (hasChildren) return; // submenu items open on hover, not click
    item.onClick?.();
    onClose();
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => hasChildren && setSubOpen(true)}
      onMouseLeave={() => hasChildren && setSubOpen(false)}
    >
      <button
        onClick={handleClick}
        disabled={item.disabled}
        className={`dropdown-item w-full justify-between ${item.danger ? "text-[var(--color-danger)] hover:bg-danger/10" : ""}`}
      >
        <span className="flex items-center gap-2">
          {item.icon && <span className="w-4 flex-shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </span>
        {hasChildren && <ChevronRight size={13} className="text-[var(--text-muted)]" />}
      </button>
      {hasChildren && subOpen && (
        <div className="absolute dropdown-menu" style={{ left: "100%", top: 0, minWidth: 140, whiteSpace: "nowrap" }}>
          {item.children!.map((child, i) =>
            child === null ? (
              <div key={i} className="dropdown-separator" />
            ) : (
              <MenuItem key={i} item={child} onClose={onClose} depth={depth + 1} />
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lightweight right-click context menu rendered via Portal.
 * Supports nested submenus via `children` on items.
 */
export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp
  const pad = 4;
  const clampedX = Math.min(x, window.innerWidth - 180 - pad);
  const clampedY = Math.min(y, window.innerHeight - items.length * 32 - pad);

  return createPortal(
    <div ref={menuRef} className="fixed z-[100] dropdown-menu" style={{ left: clampedX, top: clampedY, minWidth: 160 }}>
      {items.map((item, i) =>
        item === null ? (
          <div key={i} className="dropdown-separator" />
        ) : (
          <MenuItem key={i} item={item} onClose={onClose} />
        )
      )}
    </div>,
    document.body,
  );
}
