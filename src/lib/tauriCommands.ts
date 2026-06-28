//! Typed wrappers around Tauri IPC invoke().
import { invoke } from "@tauri-apps/api/core";

// 鈹€鈹€ Types matching meatshell::config::Session 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

/** Rust uses `#[serde(rename_all = "lowercase")]` so these are lowercase. */
type AuthMethod = "password" | "key";

type SessionKind = "ssh" | "serial" | "telnet";

export interface SessionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: AuthMethod;
  password: string;
  private_key_path: string;
  proxy: string;
  last_used: string | null;
  group: string;
  kind: SessionKind;
}

// 鈹€鈹€ Types matching meatshell::system::SystemSnapshot 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface SystemSnapshot {
  cpuPercent: number;
  memPercent: number;
  swapPercent: number;
  memUsedMib: number;
  memTotalMib: number;
  swapUsedMib: number;
  swapTotalMib: number;
  netBytesPerSec: number;
  netRxPerSec: number;
  netTxPerSec: number;
}

// 鈹€鈹€ Command snippets 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface CommandEntry {
  id: string;
  label: string;
  command: string;
  category: string;
  pinned: boolean;
  last_used: string | null;
  icon?: string | null;
  description?: string | null;
  order?: number | null;
}

// 鈹€鈹€ Prompt event payloads 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export interface HostKeyPromptPayload {
  tab_id: string;
  prompt_id: string;
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  changed: boolean;
}

export interface CredentialPromptPayload {
  tab_id: string;
  prompt_id: string;
  session_id: string;
  host: string;
  user: string;
  need_user: boolean;
  need_password: boolean;
}

// 鈹€鈹€ Command wrappers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export async function listSessions(): Promise<SessionConfig[]> {
  return invoke<SessionConfig[]>("list_sessions");
}

export async function saveSession(session: SessionConfig): Promise<void> {
  return invoke("save_session", { session });
}

export async function deleteSession(id: string): Promise<void> {
  return invoke("delete_session", { id });
}

export async function connectSession(
  tabId: string,
  session: SessionConfig,
): Promise<void> {
  return invoke("connect_session", { tabId, session });
}

export async function sendInput(tabId: string, data: string): Promise<void> {
  return invoke("send_input", { tabId, data });
}

export async function resizeTerminal(
  tabId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_terminal", { tabId, cols, rows });
}

export async function disconnectSession(tabId: string): Promise<void> {
  return invoke("disconnect_session", { tabId });
}

export async function replyHostKey(
  id: string,
  accept: boolean,
): Promise<void> {
  return invoke("reply_host_key", { id, accept });
}

export async function replyCredential(
  id: string,
  user: string | null,
  password: string | null,
  remember: boolean | null,
): Promise<void> {
  return invoke("reply_credential", {
    id,
    user,
    password,
    remember,
  });
}

/** ICMP ping via system ping command — returns microseconds, or -1 on failure. */
export async function pingHost(host: string): Promise<number> {
  return invoke("ping_host", { host });
}

export async function getSystemStats(): Promise<SystemSnapshot> {
  return invoke<SystemSnapshot>("get_system_stats");
}

export async function listCommands(): Promise<CommandEntry[]> {
  return invoke<CommandEntry[]>("list_commands");
}

export async function saveCommand(entry: CommandEntry): Promise<CommandEntry> {
  return invoke<CommandEntry>("save_command", { entry });
}

export async function deleteCommand(id: string): Promise<void> {
  return invoke("delete_command", { id });
}

export async function reorderCommands(ids: string[]): Promise<void> {
  return invoke("reorder_commands", { ids });
}

export async function reorderSessions(ids: string[]): Promise<void> {
  return invoke("reorder_sessions", { ids });
}
// 鈹€鈹€ SSHFS remote filesystem 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export async function rclone_mount(tabId: string): Promise<string> {
  return invoke<string>("rclone_mount", { tabId });
}


export async function rclone_list(): Promise<{ tabId: string; drive: string }[]> {
  return invoke<{ tabId: string; drive: string }[]>("rclone_list");
}
export async function rclone_unmount(tabId: string): Promise<string> {
  return invoke<string>("rclone_unmount", { tabId });
}

