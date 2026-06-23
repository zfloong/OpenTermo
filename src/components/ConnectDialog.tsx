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

  const isValid = form.host.trim().length > 0;

  const handleConnect = () => {
    if (!isValid) return;
    const session = form.auth === "key"
      ? { ...form, password: keyPassphrase }
      : form;
    onSave(session);
    onConnect(session);
    onClose();
  };

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const session = form.auth === "key"
        ? { ...form, password: keyPassphrase }
        : form;
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
      <DialogContent className="max-w-[820px] max-h-[85vh] p-0">
        <DialogHeader className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <DialogTitle className="text-lg">新建连接</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden" style={{ maxHeight: "calc(85vh - 60px)" }}>
          {/* Left: saved sessions */}
          <div className="w-[200px] border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-base)]/40 shrink-0">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                已保存的会话
              </span>
            </div>
            <div className="flex-1 overflow-auto">
              {sessions.length === 0 ? (
                <div className="px-4 py-10 text-sm text-center text-[var(--text-muted)]">
                  暂无保存的会话
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSession(s)}
                    className="flex items-center gap-2 px-4 py-3 hover:bg-[var(--surface-hover)] cursor-pointer border-b border-[var(--border-subtle)]/50 group transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--text-primary)] truncate font-medium">
                        {s.name || s.host}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {s.user}@{s.host}:{s.port}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: form */}
          <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
            {/* Name + Protocol */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">会话名称</span>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" className="h-9 text-sm" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">协议</span>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as SessionConfig["kind"], port: e.target.value === "ssh" ? 22 : e.target.value === "telnet" ? 23 : 0 })}
                  className="h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[rgb(var(--accent-rgb)/0.60)] transition-all"
                >
                  <option value="ssh">SSH</option>
                  <option value="telnet">Telnet</option>
                  <option value="serial">Serial</option>
                </select>
              </label>
            </div>

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
                    <Input type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} placeholder="(可选)" className="h-9 text-sm" />
                  </label>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2 pt-4 border-t border-[var(--border-subtle)]">
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
