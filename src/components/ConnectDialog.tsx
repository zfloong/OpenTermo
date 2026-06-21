import { useState } from "react";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
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
  const [form, setForm] = useState<SessionConfig>(emptySession());
  const [keyPassphrase, setKeyPassphrase] = useState("");
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
    const selected = await open({
      multiple: false,
      filters: [{
        name: "SSH Keys",
        extensions: ["pem", "key", "ppk", "id_rsa", "id_ecdsa", "id_ed25519", "id_dsa"],
      }],
    });
    if (selected) {
      setForm({ ...form, private_key_path: selected as string });
    }
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts?: { type?: string; placeholder?: string },
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <Input
        type={opts?.type ?? "text"}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={opts?.placeholder}
        className="h-9 text-sm"
      />
    </label>
  );

  const selectClass =
    "h-9 text-sm bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-md px-2.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/60 focus:ring-2 focus:ring-[var(--accent)]/15 transition-all duration-150";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col max-w-[820px] max-h-[85vh] p-0">
        <DialogHeader className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <DialogTitle>新建连接</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: saved sessions */}
          <div className="w-[300px] border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-base)]/40">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                已保存的会话
              </span>
            </div>
            <div className="flex-1 overflow-auto">
              {sessions.length === 0 ? (
                <div className="px-4 py-8 text-xs text-center text-[var(--text-muted)]">
                  暂无保存的会话
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--surface-hover)] cursor-pointer border-b border-[var(--border-subtle)]/50 group transition-colors"
                    onClick={() => handleSelectSession(s)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--text-primary)] truncate font-medium">{s.name || s.host}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {s.user}@{s.host}:{s.port}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 text-[var(--text-secondary)] hover:text-[var(--color-danger)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: connection form */}
          <div className="flex-1 flex flex-col gap-4 p-5 overflow-auto">
            <div className="grid grid-cols-2 gap-4">
              {field("会话名称", form.name, (v) => setForm({ ...form, name: v }), { placeholder: "我的服务器" })}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">协议</span>
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as SessionConfig["kind"], port: e.target.value === "ssh" ? 22 : e.target.value === "telnet" ? 23 : 0 })}
                  className={selectClass}
                >
                  <option value="ssh">SSH</option>
                  <option value="telnet">Telnet</option>
                  <option value="serial">Serial</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-[1fr_100px] gap-4">
              {field("主机", form.host, (v) => setForm({ ...form, host: v }), { placeholder: "192.168.1.1" })}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">端口</span>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })}
                  className="h-9 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {field("用户名", form.user, (v) => setForm({ ...form, user: v }), { placeholder: "root" })}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">认证方式</span>
                <select
                  value={form.auth}
                  onChange={(e) => setForm({ ...form, auth: e.target.value as SessionConfig["auth"] })}
                  className={selectClass}
                >
                  <option value="password">密码</option>
                  <option value="key">Private Key</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {form.auth === "password" ? (
                field("密码", form.password, (v) => setForm({ ...form, password: v }), { type: "password", placeholder: "········" })
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">私钥路径</span>
                  <div className="flex gap-1.5">
                    <Input
                      value={form.private_key_path}
                      onChange={(e) => setForm({ ...form, private_key_path: e.target.value })}
                      placeholder="~/.ssh/id_ed25519"
                      className="h-9 text-sm flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={handleBrowseKey}
                    >
                      <FolderOpen size={14} />
                    </Button>
                  </div>
                </label>
              )}
              {form.auth === "key" ? (
                field("密钥密码", keyPassphrase, setKeyPassphrase, { type: "password", placeholder: "(可选)" })
              ) : (
                field("代理", form.proxy, (v) => setForm({ ...form, proxy: v }), { placeholder: "socks5://127.0.0.1:1080" })
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2 pt-4 border-t border-[var(--border-subtle)]">
              <Button
                variant="primary"
                className="flex-1 gap-2"
                onClick={handleConnect}
                disabled={!isValid}
              >
                <Plus size={15} />
                连接并保存
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={handleSave}
                disabled={!isValid || saving}
              >
                仅保存
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
