//! Typed wrappers around Tauri IPC invoke().
import { invoke } from "@tauri-apps/api/core";

// ── Types matching meatshell::config::Session ─────────────────────────────

/** Rust uses `#[serde(rename_all = "lowercase")]` so these are lowercase. */
type AuthMethod = "password" | "key";

type SessionKind = "ssh" | "serial" | "telnet";

/**
 * One SSH tunnel (#56). `kind` is "local" (-L), "remote" (-R) or "dynamic"
 * (-D / SOCKS5). For local/remote, `host`:`host_port` is the target; for
 * dynamic it is ignored (the SOCKS client picks the destination).
 */
export interface PortForward {
  kind: "local" | "remote" | "dynamic";
  /** Optional label to tell rules apart (#100). Empty = unnamed. */
  name?: string;
  /** Listener bind address (local side for L/D, remote side for R). */
  bind_addr?: string;
  bind_port: number;
  host?: string;
  host_port?: number;
}

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
  /** Serial-only fields, used when kind === "serial". */
  serial_port: string;
  baud_rate: number;
  data_bits: number;
  stop_bits: number;
  parity: string;
  flow_control: string;
  /**
   * Tunnels established automatically on connect. The backend has always sent
   * this field (`#[serde(default)]`); leaving it out of the type only meant the
   * frontend could not see (or round-trip) it. Optional here because the
   * dialogs build a fresh `SessionConfig` for new connections, which has no
   * tunnels yet.
   */
  forwards?: PortForward[];
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
// ── SSHFS remote filesystem ───────────────────────────

export async function rclone_mount(tabId: string): Promise<string> {
  return invoke<string>("rclone_mount", { tabId });
}


export async function rclone_list(): Promise<{ tabId: string; drive: string }[]> {
  return invoke<{ tabId: string; drive: string }[]>("rclone_list");
}
export async function rclone_unmount(tabId: string): Promise<string> {
  return invoke<string>("rclone_unmount", { tabId });
}

// ── Appearance ─────────────────────────────────────────────────────────────

/** Import a wallpaper; returns the stored copy as a data URL. */
export async function setBackgroundImage(path: string): Promise<string> {
  return invoke<string>("set_background_image", { path });
}

/** The stored wallpaper as a data URL, or null when none is set. */
export async function getBackgroundImage(): Promise<string | null> {
  return invoke<string | null>("get_background_image");
}

export async function clearBackgroundImage(): Promise<void> {
  return invoke("clear_background_image");
}

