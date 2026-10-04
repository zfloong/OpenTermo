import { type SessionConfig } from "@/lib/tauriCommands";

/** 四行带标签的会话信息（用户定的格式），供「复制」按钮写入剪贴板；密码登录时包含密码本身 */
export function formatSessionInfo(s: SessionConfig): string {
  return [
    `主机: ${s.host.trim() || "(无)"}`,
    `端口: ${s.port ? String(s.port) : "(无)"}`,
    `用户名: ${s.user.trim() || "(无)"}`,
    s.auth === "key"
      ? `密钥: ${s.private_key_path.trim() || "(无)"}`
      : `密码: ${s.password || "(无)"}`,
  ].join("\n");
}
