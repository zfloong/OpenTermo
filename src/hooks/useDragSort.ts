import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Shared HTML5 drag-and-drop sorting hook.
 * Uses native DOM events instead of React synthetic events for maximum
 * compatibility with Tauri's WebView2.
 *
 * @param onReorder  Called with (fromIndex, toIndex) when a drop completes.
 * @returns bindDragItem — a callback-ref factory: `ref={bindDragItem(idx)}`
 */
export function useDragSort(
  onReorder: (fromIndex: number, toIndex: number) => void,
) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Keep latest callback in ref
  const onReorderRef = useRef(onReorder);
  useEffect(() => {
    onReorderRef.current = onReorder;
  });

  const dragOverRef = useRef<number | null>(null);
  useEffect(() => {
    dragOverRef.current = dragOver;
  }, [dragOver]);

  // Track cleanup functions per index
  const cleanupRef = useRef<Map<number, () => void>>(new Map());

  /**
   * Callback-ref factory. Attach via `ref={bindDragItem(idx)}`.
   * Native event listeners are added/removed automatically via React ref lifecycle.
   */
  const bindDragItem = useCallback(
    (index: number) =>
      (node: HTMLElement | null) => {
        // Cleanup previous binding for this index
        const prev = cleanupRef.current.get(index);
        if (prev) prev();
        cleanupRef.current.delete(index);

        if (!node) return;

        // ── Force draggable attribute on the DOM ──────────────────────
        node.setAttribute("draggable", "true");

        // ── Native event handlers ─────────────────────────────────────
        const onDragStart = (e: DragEvent) => {
          e.dataTransfer!.effectAllowed = "move";
          e.dataTransfer!.setData("text/plain", String(index));
          setDragging(index);
        };

        const onDragOverHandler = (e: DragEvent) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          if (dragOverRef.current !== index) setDragOver(index);
        };

        const onDragLeaveHandler = () => {
          setDragOver(null);
        };

        const onDropHandler = (e: DragEvent) => {
          e.preventDefault();
          const from = Number(e.dataTransfer!.getData("text/plain"));
          if (!isNaN(from) && from !== index) {
            onReorderRef.current(from, index);
          }
          setDragging(null);
          setDragOver(null);
        };

        const onDragEndHandler = () => {
          setDragging(null);
          setDragOver(null);
        };

        node.addEventListener("dragstart", onDragStart);
        node.addEventListener("dragover", onDragOverHandler);
        node.addEventListener("dragleave", onDragLeaveHandler);
        node.addEventListener("drop", onDropHandler);
        node.addEventListener("dragend", onDragEndHandler);

        // Store cleanup
        cleanupRef.current.set(index, () => {
          node.removeEventListener("dragstart", onDragStart);
          node.removeEventListener("dragover", onDragOverHandler);
          node.removeEventListener("dragleave", onDragLeaveHandler);
          node.removeEventListener("drop", onDropHandler);
          node.removeEventListener("dragend", onDragEndHandler);
        });
      },
    [],
  );

  return { dragging, dragOver, bindDragItem };
}
