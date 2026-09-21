import { useState } from "react";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SessionConfig } from "@/lib/tauriCommands";

interface ConnectDialogProps {
  sessions: SessionConfig[];
  onClose: () => void;
  onConnect: (session: SessionConfig) => void;
  onSave: (session: SessionConfig) => void;
  onDelete: (id: string) => void;
}

function emptySession(): SessionConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "",
    port: 22,
    user: "root",
    auth: "password",
    password: "",
    private_key_path: "",
    proxy: "",
    last_used: null,
    group: "",
    kind: "ssh",
    serial_port: "",
    baud_rate: 115200,
    data_bits: 8,
    stop_bits: 1,
    parity: "none",
    flow_control: "none",
  };
}

export default function ConnectDialog({
  sessions,
  onClose,
  onConnect,
  onSave,
  onDelete,
}: ConnectDialogProps) {
  // Edit mode is handled by EditSessionDialog — ConnectDialog is always new connection
  const [form, setForm] = useState<SessionConfig>(() =>
    emptySession()
  );
  const [keyPassphrase, setKeyPassphrase] = useState(() =>
    ""
  );
  // EditSessionDialog handles editing separately
  const [saving, setSaving] = useState(false);

  const isValid = form.kind === "serial"
    ? form.serial_port.trim().length > 0
    : form.host.trim().length > 0;

  const withAutoName = (s: SessionConfig): SessionConfig =>
    s.kind === "serial" && !s.name.trim()
      ? { ...s, name: `${s.serial_port.trim()} @${s.baud_rate}` }
      : s;

  const handleConnect = () => {
    if (!isValid) return;
    const session = withAutoName(
      form.auth === "key" ? { ...form, password: keyPassphrase } : form
    );
    onSave(session);
    onConnect(session);
    onClose();
  };

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const session = withAutoName(
        form.auth === "key" ? { ...form, password: keyPassphrase } : form
      );
      onSave(session);
      setForm(emptySession());
      setKeyPassphrase("");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectSession = (s: SessionConfig) => {
    onConnect(s);
    onClose();
  };

  const handleBrowseKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        defaultPath: form.private_key_path || undefined,
        filters: [{
          name: "SSH Keys",
          extensions: ["pem", "key", "ppk"],
        }],
      });
      if (selected) {
        setForm({ ...form, private_key_path: selected as string });
      }
    } catch {
      // dialog plugin may not be available
    }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[560px] p-0 mx-4">
        <DialogHeader className="px-5 py-3 border-b border-[var(--border-subtle)]">
          <DialogTitle className="text-lg">新建连接</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden" style={{ maxHeight: "calc(85vh - 60px)" }}>
          {/* Right: form */}
          <div className="flex-1 flex flex-col gap-3 p-5 overflow-auto">
            {/* Name + Protocol */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">会话名称</span>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" className="h-8 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-[var(--text-secondary)]">分组</span>
                <select
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
                >
                  <option value="">Default</option>
                  {[...new Set(sessions.map((s) => s.group).filter(Boolean))].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <span className="text-xs font-medium text-[var(--text-secondary)]">协议</span>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as SessionConfig["kind"], port: e.target.value === "ssh" ? 22 : e.target.value === "telnet" ? 23 : 0 })}
                  className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
                >
                  <option value="ssh">SSH</option>
                  <option value="telnet">Telnet</option>
                  <option value="serial">Serial</option>
                </select>
              </label>
            </div>

            {form.kind === "serial" && (
              <>
                <div className="grid grid-cols-[1fr_120px] gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">串口号</span>
                    <Input value={form.serial_port} onChange={(e) => setForm({ ...form, serial_port: e.target.value })} placeholder="COM3" className="h-8 text-sm" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">波特率</span>
                    <Input type="number" list="baud-presets" value={form.baud_rate} onChange={(e) => setForm({ ...form, baud_rate: Number(e.target.value) || 115200 })} className="h-8 text-sm" />
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">数据位</span>
                    <select value={form.data_bits} onChange={(e) => setForm({ ...form, data_bits: Number(e.target.value) })} className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                      <option value={8}>8</option>
                      <option value={7}>7</option>
                      <option value={6}>6</option>
                      <option value={5}>5</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">停止位</span>
                    <select value={form.stop_bits} onChange={(e) => setForm({ ...form, stop_bits: Number(e.target.value) })} className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">校验</span>
                    <select value={form.parity} onChange={(e) => setForm({ ...form, parity: e.target.value })} className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
                      <option value="none">无</option>
                      <option value="odd">奇</option>
                      <option value="even">偶</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">流控</span>
                    <select value={form.flow_control} onChange={(e) => setForm({ ...form, flow_control: e.target.value })} className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all">
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
                <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.1" className="h-8 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">端口</span>
                <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })} className="h-8 text-sm" />
              </label>
            </div>

            {/* User + Auth */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">用户名</span>
                <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="root" className="h-8 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">认证方式</span>
                <select
                  value={form.auth}
                  onChange={(e) => setForm({ ...form, auth: e.target.value as SessionConfig["auth"] })}
                  className="h-8 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
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
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="········" className="h-8 text-sm" />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">代理</span>
                    <Input value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} placeholder="socks5://127.0.0.1:1080" className="h-8 text-sm" />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">私钥路径</span>
                    <div className="flex gap-1.5">
                      <Input value={form.private_key_path} onChange={(e) => setForm({ ...form, private_key_path: e.target.value })} placeholder="~/.ssh/id_ed25519" className="h-8 text-sm flex-1" />
                      <button
                        onClick={handleBrowseKey}
                        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <FolderOpen size={14} />
                      </button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">密钥密码</span>
                    <Input type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} placeholder="(可选)" className="h-8 text-sm" />
                  </label>
                </>
              )}
            </div>
            </>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-1 pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={handleConnect}
                disabled={!isValid}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-[rgb(var(--accent-rgb)/0.90)] text-white text-sm font-medium hover:bg-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
              >
                <Plus size={15} />
                连接并保存
              </button>
              <button
                onClick={handleSave}
                disabled={!isValid || saving}
                className="flex-1 h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm font-medium hover:bg-[var(--surface-active)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                仅保存
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
