//! Typed wrappers around Tauri IPC invoke().
import { invoke } from "@tauri-apps/api/core";

// ── Types matching meatshell::config::Session ─────────────────────────────

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

// ── Types matching meatshell::system::SystemSnapshot ──────────────────────

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

// ── Command snippets ─────────────────────────────────────────────────────

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

// ── Prompt event payloads ─────────────────────────────────────────────────

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

// ── Command wrappers ──────────────────────────────────────────────────────

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

// ── SFTP ──────────────────────────────────────────────────────────────────

/** Matches meatshell::ssh::RemoteEntry (serde camelCase on Rust side → snake_case in JSON). */
export interface RemoteEntry {
  name: string;
  full_path: string;
  is_dir: boolean;
  size: number;
  modified: number;
  mode: number;
}

export interface SftpEntriesPayload {
  path: string;
  entries: RemoteEntry[];
}

export interface SftpTransferPayload {
  id: string;
  name: string;
  is_upload: boolean;
  transferred: number;
  total: number;
  state: number; // 0=active, 1=done, 2=error
  msg: string;
}

export async function sftpSpawn(tabId: string, session: SessionConfig): Promise<void> {
  return invoke("sftp_spawn", { tabId, session });
}

export async function sftpListDir(tabId: string, path: string): Promise<void> {
  return invoke("sftp_list_dir", { tabId, path });
}

export async function sftpDownload(tabId: string, remote: string, localDir: string): Promise<void> {
  return invoke("sftp_download", { tabId, remote, localDir });
}

export async function sftpUpload(tabId: string, local: string, remoteDir: string): Promise<void> {
  return invoke("sftp_upload", { tabId, local, remoteDir });
}

export async function sftpMkdir(tabId: string, path: string): Promise<void> {
  return invoke("sftp_mkdir", { tabId, path });
}

export async function sftpDelete(tabId: string, path: string): Promise<void> {
  return invoke("sftp_delete", { tabId, path });
}

export async function sftpRename(tabId: string, from: string, to: string): Promise<void> {
  return invoke("sftp_rename", { tabId, from, to });
}

export async function getDownloadDir(): Promise<string> {
  return invoke<string>("get_download_dir");
}

export async function revealInExplorer(path: string): Promise<void> {
  return invoke("reveal_in_explorer", { path });
}

export async function openInEditor(path: string): Promise<void> {
  return invoke("open_in_editor", { path });
}

// ── Port forwarding ───────────────────────────────────────────────────────

export interface PortForwardConfig {
  kind: string;   // "local" | "remote" | "dynamic"
  name: string;
  bind_addr: string;
  bind_port: number;
  host: string;
  host_port: number;
}

export interface PortForwardInfo {
  id: string;
  kind: string;
  name: string;
  bind_addr: string;
  bind_port: number;
  host: string;
  host_port: number;
}

export async function portForwardStart(
  tabId: string,
  forward: PortForwardConfig,
): Promise<PortForwardInfo> {
  return invoke<PortForwardInfo>("port_forward_start", { tabId, forward });
}

export async function portForwardStop(
  tabId: string,
  forwardId: string,
): Promise<void> {
  return invoke("port_forward_stop", { tabId, forwardId });
}

export async function portForwardList(
  tabId: string,
): Promise<PortForwardInfo[]> {
  return invoke<PortForwardInfo[]>("port_forward_list", { tabId });
}
