import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
  const [form, setForm] = useState<SessionConfig>(() => emptySession());
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  const handleBrowseKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SSH Keys", extensions: ["pem", "key", "ppk"] }],
      });
      if (selected) {
        setForm({ ...form, private_key_path: selected as string });
      }
    } catch {}
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl h-auto max-h-[85vh] p-0 overflow-hidden rounded-2xl flex flex-col" style={{
        background: "var(--surface-container-low)",
        border: "1px solid var(--outline-variant)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
      }}>
        <div className="px-5 py-2.5 border-b border-outline-variant/20 flex items-center justify-between shrink-0" style={{ background: "var(--surface-container)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">新建连接</h2>
              <p className="text-[10px] text-on-surface-variant">配置并保存新的终端会话参数</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">badge</span> 基本信息
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">会话名称</label>
                  <div className="relative">
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] placeholder-[#8e9098] text-[14px] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all"
                      placeholder="例如：生产环境数据库、个人博客服务器..."
                      type="text"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-on-surface-variant/50">
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">language</span> 网络配置
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
                <div className="md:col-span-3">
                  <label className="block text-[12px] text-on-surface-variant mb-1.5">协议</label>
                  <div className="relative">
                    <select
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as SessionConfig["kind"], port: e.target.value === "ssh" ? 22 : e.target.value === "telnet" ? 23 : 0 })}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono pl-9 appearance-none focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                      style={{
                        backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238e9098' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                        backgroundPosition: "right 0.5rem center",
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "1.25em 1.25em",
                      }}
                    >
                      <option value="ssh">SSH</option>
                      <option value="sftp">SFTP</option>
                      <option value="telnet">Telnet</option>
                    </select>
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-secondary">
                      <span className="material-symbols-outlined text-[16px]">terminal</span>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-6">
                  <label className="block text-[12px] text-on-surface-variant mb-1.5">主机 / IP 地址</label>
                  <input
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-secondary text-terminal-mono font-terminal-mono placeholder-[#8e9098] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                    placeholder="192.168.1.1"
                    type="text"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[12px] text-on-surface-variant mb-1.5">端口</label>
                  <input
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono text-center focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px]">key</span> 身份验证
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">用户名</label>
                  <div className="relative">
                    <input
                      value={form.user}
                      onChange={(e) => setForm({ ...form, user: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono placeholder-[#8e9098] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                      placeholder="root"
                      type="text"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-on-surface-variant/50">
                      <span className="material-symbols-outlined text-[16px]">person</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] text-on-surface-variant mb-1.5">认证方式</label>
                  <select
                    value={form.auth}
                    onChange={(e) => setForm({ ...form, auth: e.target.value as SessionConfig["auth"] })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-[13px] appearance-none focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all"
                    style={{
                      backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238e9098' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                      backgroundPosition: "right 0.5rem center",
                      backgroundRepeat: "no-repeat",
                      backgroundSize: "1.25em 1.25em",
                    }}
                  >
                    <option value="password">密码</option>
                    <option value="key">SSH 密钥</option>
                  </select>
                </div>

                {form.auth === "password" ? (
                  <div className="md:col-span-2">
                    <label className="block text-[13px] text-on-surface-variant mb-1.5">密码</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono placeholder-[#8e9098] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                        placeholder="••••••••"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-white transition-colors"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">{showPassword ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-[13px] text-on-surface-variant mb-1.5">私钥路径</label>
                      <div className="relative">
                        <input
                          value={form.private_key_path}
                          onChange={(e) => setForm({ ...form, private_key_path: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono placeholder-[#8e9098] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px] pr-12"
                          placeholder="~/.ssh/id_ed25519"
                          type="text"
                        />
                        <button
                          onClick={handleBrowseKey}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">folder_open</span>
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[13px] text-on-surface-variant mb-1.5">密钥密码</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={keyPassphrase}
                          onChange={(e) => setKeyPassphrase(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-[#1c1b1b] border border-[#44474e] text-[#e5e2e1] text-terminal-mono font-terminal-mono placeholder-[#8e9098] focus:outline-none focus:border-[#4de082] focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)] focus:bg-[#201f1f] transition-all text-[13px]"
                          placeholder="(可选)"
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-white transition-colors"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[16px]">{showPassword ? "visibility_off" : "visibility"}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>


          </div>
        </div>

        <div className="px-5 py-3 border-t border-outline-variant/20 flex justify-end gap-2.5 items-center shrink-0" style={{ background: "var(--surface-container)" }}>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-on-surface-variant hover:text-white transition-colors text-[13px] font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-5 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            仅保存
          </button>
          <button
            onClick={handleConnect}
            disabled={!isValid}
            className="px-6 py-2 rounded-lg bg-secondary text-black font-semibold hover:bg-secondary/90 transition-all text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: "0 0 10px rgba(77, 224, 130, 0.25)" }}
          >
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            连接并保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
