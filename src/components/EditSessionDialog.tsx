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

  const inputStyle = {
    background: "var(--surface-container-low)",
    border: "1px solid var(--outline-variant)",
    borderRadius: "var(--radius-md)",
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[540px] p-0 overflow-hidden rounded-2xl" style={{
        background: "rgba(19, 19, 19, 0.85)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        border: "1px solid rgba(68, 71, 78, 0.30)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05)",
      }}>
        {/* Header */}
        <DialogHeader className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div>
              <DialogTitle className="text-headline-lg font-headline-lg text-white font-bold tracking-wide">编辑连接</DialogTitle>
              <p className="text-label-sm text-[var(--text-secondary)] mt-0.5">{session.name || session.host}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </DialogHeader>

        <div className="flex flex-col gap-6 p-8">
          {/* Name + Group */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">会话名称</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="我的服务器" className="h-9 text-sm" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">分组</span>
              <Input value={form.group || ""} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="终端列表" className="h-9 text-sm" style={inputStyle} />
            </label>
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-[1fr_100px] gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">主机</span>
              <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.1" className="h-9 text-sm" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">端口</span>
              <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })} className="h-9 text-sm" style={inputStyle} />
            </label>
          </div>

          {/* User + Auth */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">用户名</span>
              <Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="root" className="h-9 text-sm" style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">认证方式</span>
              <select
                value={form.auth}
                onChange={(e) => setForm({ ...form, auth: e.target.value as SessionConfig["auth"] })}
                className="custom-select h-9 w-full text-sm rounded-md px-2.5 font-terminal-mono"
                style={{
                  background: "var(--surface-container-low)",
                  border: "1px solid var(--outline-variant)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="password">密码</option>
                <option value="key">SSH 密钥</option>
              </select>
            </label>
          </div>

          {/* Auth details */}
          <div className="grid grid-cols-2 gap-4">
            {form.auth === "password" ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">密码</span>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="h-9 text-sm" style={inputStyle} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">代理</span>
                  <Input value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} placeholder="socks5://127.0.0.1:1080" className="h-9 text-sm" style={inputStyle} />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">私钥路径</span>
                  <div className="flex gap-1.5">
                    <Input value={form.private_key_path} onChange={(e) => setForm({ ...form, private_key_path: e.target.value })} placeholder="~/.ssh/id_ed25519" className="h-9 text-sm flex-1" style={inputStyle} />
                    <button onClick={handleBrowseKey} className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-[var(--outline-variant)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label-sm font-label-sm text-[var(--text-secondary)]">密钥密码</span>
                  <Input type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} placeholder="(可选)" className="h-9 text-sm" style={inputStyle} />
                </label>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/5">
            <button
              onClick={handleSaveAndConnect}
              disabled={!isValid}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg font-medium text-sm transition-all active:scale-[0.97]"
              style={{
                background: isValid ? "var(--secondary)" : "rgba(255,255,255,0.1)",
                color: isValid ? "#003919" : "var(--text-muted)",
                fontWeight: 600,
                boxShadow: isValid ? "0 0 15px rgba(77, 224, 130, 0.3)" : "none",
                cursor: isValid ? "pointer" : "not-allowed",
              }}
            >
              保存并连接
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 h-10 rounded-lg border font-medium text-sm transition-all"
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: isValid ? "var(--text-primary)" : "var(--text-muted)",
                cursor: isValid ? "pointer" : "not-allowed",
              }}
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="h-10 px-4 rounded-lg border font-medium text-sm transition-all hover:bg-[var(--surface-hover)]"
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background: "transparent",
                color: "var(--text-primary)",
              }}
            >
              取消
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
