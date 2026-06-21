import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface ContextMenuProps {
  /** The menu items to show.  A `null` separator inserts a divider line. */
  items: (ContextMenuItem | null)[];
  /** Screen position where the menu should appear. */
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Lightweight right-click context menu rendered via Portal.
 * Closes on click-outside, Escape key, or item selection.
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
    // Delay listener so the triggering right-click doesn't close immediately
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

  // Clamp position so menu stays within viewport
  const pad = 4;
  const clampedX = Math.min(x, window.innerWidth - 180 - pad);
  const clampedY = Math.min(y, window.innerHeight - items.length * 32 - pad);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] dropdown-menu"
      style={{ left: clampedX, top: clampedY }}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={i} className="dropdown-separator" />
        ) : (
          <button
            key={i}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`dropdown-item ${item.danger ? "text-[var(--color-danger)] hover:bg-[rgba(217,83,79,0.08)]" : ""}`}
          >
            {item.icon && <span className="w-4 flex-shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
