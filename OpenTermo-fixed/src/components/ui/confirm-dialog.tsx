import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfirmInputOptions {
  label?: string;
  initial?: string;
  placeholder?: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认键走红色，且初始焦点落在「取消」上 */
  danger?: boolean;
  /** 只渲染一个确认按钮，用于纯提示 */
  dismissOnly?: boolean;
  /** 传入即渲染文本输入框，用于替代原生 prompt */
  input?: ConfirmInputOptions;
}

interface PendingRequest {
  id: number;
  opts: ConfirmOptions;
  resolve: (value: string | boolean | null) => void;
}

// 原生 window.confirm/prompt 在 Tauri WebView 里不可靠（可能静默失灵），
// 这里用应用内对话框替代，调用方拿到的是同一个 Promise。
let pending: PendingRequest | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function open(opts: ConfirmOptions): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    // 同时只保留一个请求：后到的把先到的按「取消」收尾，避免 Promise 悬空。
    if (pending) pending.resolve(pending.opts.input ? null : false);
    pending = { id: nextId++, opts, resolve };
    emit();
  });
}

function close(value: string | boolean | null) {
  const cur = pending;
  pending = null;
  emit();
  cur?.resolve(value);
}

/** 确认框：确定 resolve(true)，取消 resolve(false)。 */
export async function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return (await open({ ...opts, input: undefined })) === true;
}

/** 纯提示框：只有一个「知道了」，用来告知操作被拒等原因。 */
export async function alertMessage(title: string, message: string): Promise<void> {
  await open({ title, message, confirmText: "知道了", dismissOnly: true });
}

/** 输入框：确定 resolve(trim 后的文本)，取消 resolve(null)。 */
export async function promptText(
  opts: ConfirmOptions & { input?: ConfirmInputOptions }
): Promise<string | null> {
  const v = await open({ ...opts, input: opts.input ?? {} });
  return typeof v === "string" ? v : null;
}

/** 挂在 App 根部，全局只需要一个。 */
export function ConfirmDialogHost() {
  const req = useSyncExternalStore(subscribe, () => pending);
  if (!req) return null;
  return <ConfirmDialogView key={req.id} opts={req.opts} />;
}

function ConfirmDialogView({ opts }: { opts: ConfirmOptions }) {
  const isInput = opts.input !== undefined;
  const [value, setValue] = useState(opts.input?.initial ?? "");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const canConfirm = !isInput || value.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    close(isInput ? value.trim() : true);
  };
  const handleCancel = () => close(isInput ? null : false);

  useEffect(() => {
    // FocusScope 会把焦点给第一个可聚焦元素，挂载后这里再纠正一次。
    if (isInput) return;
    (opts.danger && !opts.dismissOnly ? cancelRef : confirmRef).current?.focus();
  }, [isInput, opts.danger, opts.dismissOnly]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader>
          <DialogTitle>{opts.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-3">
          {opts.message && (
            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line break-all">
              {opts.message}
            </p>
          )}
          {isInput && (
            <div className="flex flex-col gap-1">
              {opts.input?.label && (
                <label className="text-sm text-[var(--text-secondary)]">
                  {opts.input.label}
                </label>
              )}
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                onFocus={(e) => e.target.select()}
                placeholder={opts.input?.placeholder}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            {!opts.dismissOnly && (
              <Button
                ref={cancelRef}
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-sm h-7"
              >
                {opts.cancelText ?? "取消"}
              </Button>
            )}
            <Button
              ref={confirmRef}
              variant={opts.danger ? "destructive" : "primary"}
              size="sm"
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="text-sm h-7"
            >
              {opts.confirmText ?? "确定"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
