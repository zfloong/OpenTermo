import { useEffect, useRef, useState } from "react";
import { Check, Copy, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SessionConfig } from "@/lib/tauriCommands";
import { formatSessionInfo } from "@/lib/sessionInfo";
import { GroupField } from "@/components/GroupField";
import { useSessionStore } from "@/stores/sessionStore";

interface EditSessionDialogProps {
  session: SessionConfig;
  onClose: () => void;
}

export default function EditSessionDialog({ session, onClose }: EditSessionDialogProps) {
  const save = useSessionStore((s) => s.save);
  const connect = useSessionStore((s) => s.connect);
  const sessions = useSessionStore((s) => s.sessions);

  const [form, setForm] = useState<SessionConfig>({ ...session });
  const [keyPassphrase, setKeyPassphrase] = useState(
    session.auth === "key" ? session.password || "" : ""
  );
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const handleCopyInfo = () => {
    navigator.clipboard
      .writeText(formatSessionInfo(form))
      .then(() => {
        setCopied(true);
        if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };

  const copyBtnClass = copied
    ? "text-[var(--color-success)]"
    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]";

  const isValid = form.kind === "serial"
    ? form.serial_port.trim().length > 0
    : form.host.trim().length > 0;

  const withAutoName = (s: SessionConfig): SessionConfig =>
    s.kind === "serial" && !s.name.trim()
      ? { ...s, name: `${s.serial_port.trim()} @${s.baud_rate}` }
      : s;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const s = withAutoName(
        form.auth === "key" ? { ...form, password: keyPassphrase } : form
      );
      await save(s);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!isValid) return;
    const s = withAutoName(
      form.auth === "key" ? { ...form, password: keyPassphrase } : form
    );
    await save(s);
    connect(`tab-${s.id}-${Date.now()}`, s);
    onClose();
  };

  const handleBrowseKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        defaultPath: form.private_key_path || undefined,
        filters: [{ name: "SSH Keys", extensions: ["pem", "key", "ppk"] }],
      });
      if (selected) {
        setForm({ ...form, private_key_path: selected as string });
      }
    } catch { /* dialog plugin may not be available */ }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[540px] mx-4 p-0">
        <DialogHeader className="px-6 py-4 border-b border-[var(--border-subtle)] flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-lg">编辑连接</DialogTitle>
          {form.kind !== "serial" && (
            <button
              onClick={handleCopyInfo}
              disabled={!form.host.trim()}
              title="复制 主机 / 端口 / 用户名 / 密钥"
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-[var(--border-subtle)] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${copyBtnClass}`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "已复制" : "复制"}
            </button>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-5 p-6">
          {/* Name + Group */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">会话名称</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" className="h-9 text-sm" />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">分组</span>
              <GroupField
                value={form.group}
                onChange={(group) => setForm({ ...form, group })}
                usedGroups={sessions.map((s) => s.group)}
                selectClass="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
              />
            </div>
          </div>

          {form.kind === "serial" && (
            <>
              <div className="grid grid-cols-[1fr_120px] gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">串口号</span>
                  <Input value={form.serial_port} onChange={(e) => setForm({ ...form, serial_port: e.target.value })} placeholder="COM3" className="h-9 text-sm" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">波特率</span>
                  <Input type="number" list="baud-presets" value={form.baud_rate} onChange={(e) => setForm({ ...form, baud_rate: Number(e.target.value) || 115200 })} className="h-9 text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">数据位</span>
                  <select value={form.data_bits} onChange={(e) => setForm({ ...form, data_bits: Number(e.target.value) })} className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                    <option value={8}>8</option>
                    <option value={7}>7</option>
                    <option value={6}>6</option>
                    <option value={5}>5</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">停止位</span>
                  <select value={form.stop_bits} onChange={(e) => setForm({ ...form, stop_bits: Number(e.target.value) })} className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">校验</span>
                  <select value={form.parity} onChange={(e) => setForm({ ...form, parity: e.target.value })} className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                    <option value="none">无</option>
                    <option value="odd">奇</option>
                    <option value="even">偶</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">流控</span>
                  <select value={form.flow_control} onChange={(e) => setForm({ ...form, flow_control: e.target.value })} className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                    <option value="none">无</option>
                    <option value="hardware">硬件</option>
                    <option value="software">软件</option>
                  </select>
                </label>
              </div>
              <datalist id="baud-presets">
                {[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}

          {form.kind !== "serial" && (
          <>
          {/* Host + Port */}
          <div className="grid grid-cols-[1fr_100px] gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">主机</span>
              <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.1" className="h-9 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">端口</span>
              <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })} className="h-9 text-sm" />
            </label>
          </div>

          {/* User + Auth */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">用户名</span>
              <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="root" className="h-9 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">认证方式</span>
              <select
                value={form.auth}
                onChange={(e) => setForm({ ...form, auth: e.target.value as SessionConfig["auth"] })}
                className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
              >
                <option value="password">密码</option>
                <option value="key">密钥</option>
              </select>
            </label>
          </div>

          {/* Auth details */}
          <div className="grid grid-cols-2 gap-4">
            {form.auth === "password" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">密码</span>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="········" className="h-9 text-sm" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">代理</span>
                  <Input value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} placeholder="socks5://127.0.0.1:1080" className="h-9 text-sm" />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">私钥路径</span>
                  <div className="flex gap-1.5">
                    <Input value={form.private_key_path} onChange={(e) => setForm({ ...form, private_key_path: e.target.value })} placeholder="~/.ssh/id_ed25519" className="h-9 text-sm flex-1" />
                    <button onClick={handleBrowseKey} className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">密钥密码</span>
                  <Input type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} placeholder="(可选)" className="h-9 text-sm" />
                </label>
              </>
            )}
          </div>
          </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <button onClick={handleSaveAndConnect} disabled={!isValid} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-[rgb(var(--accent-rgb)/0.90)] text-white text-sm font-medium hover:bg-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]">
              保存并连接
            </button>
            <button onClick={handleSave} disabled={!isValid || saving} className="flex-1 h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--surface-active)] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              保存
            </button>
            <button onClick={onClose} className="h-10 px-4 rounded-lg bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm hover:bg-[var(--surface-active)] transition-all">
              取消
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
