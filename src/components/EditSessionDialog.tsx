import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SessionConfig } from "@/lib/tauriCommands";
import { useSessionStore } from "@/stores/sessionStore";

interface EditSessionDialogProps {
  session: SessionConfig;
  onClose: () => void;
}

export default function EditSessionDialog({ session, onClose }: EditSessionDialogProps) {
  const save = useSessionStore((s) => s.save);
  const connect = useSessionStore((s) => s.connect);

  const [form, setForm] = useState<SessionConfig>({ ...session });
  const [keyPassphrase, setKeyPassphrase] = useState(
    session.auth === "key" ? session.password || "" : ""
  );
  const [saving, setSaving] = useState(false);

  const isValid = form.host.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const s = form.auth === "key"
        ? { ...form, password: keyPassphrase }
        : form;
      await save(s);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndConnect = async () => {
    if (!isValid) return;
    const s = form.auth === "key"
      ? { ...form, password: keyPassphrase }
      : form;
    await save(s);
    connect(`tab-${s.id}-${Date.now()}`, s);
    onClose();
  };

  const handleBrowseKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SSH Keys", extensions: ["pem", "key", "ppk"] }],
      });
      if (selected) {
        setForm({ ...form, private_key_path: selected as string });
      }
    } catch { /* dialog plugin may not be available */ }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[540px] p-0">
        <DialogHeader className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <DialogTitle className="text-lg">编辑连接</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 p-6">
          {/* Name + Group */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">会话名称</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" className="h-9 text-sm" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">分组</span>
              <Input value={form.group || ""} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="终端列表" className="h-9 text-sm" />
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
