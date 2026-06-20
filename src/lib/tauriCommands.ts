//! Typed wrappers around Tauri IPC invoke().
import { invoke } from "@tauri-apps/api/core";

// ── Types matching meatshell::config::Session ─────────────────────────────

export type AuthMethod = "password" | "key" | "both";

export type SessionKind = "Ssh" | "Serial" | "Telnet";

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

// ── Command wrappers ──────────────────────────────────────────────────────

/** Load saved sessions from the config store. */
export async function listSessions(): Promise<SessionConfig[]> {
  return invoke<SessionConfig[]>("list_sessions");
}

/** Save (insert or update) a session. */
export async function saveSession(session: SessionConfig): Promise<void> {
  return invoke("save_session", { session });
}

/** Delete a session by id. */
export async function deleteSession(id: string): Promise<void> {
  return invoke("delete_session", { id });
}

/** Start an SSH / serial / telnet session. */
export async function connectSession(
  tabId: string,
  session: SessionConfig,
): Promise<void> {
  return invoke("connect_session", { tabId, session });
}

/** Send raw input bytes to the running session. */
export async function sendInput(tabId: string, data: string): Promise<void> {
  return invoke("send_input", { tabId, data });
}

/** Notify the remote PTY of a resize. */
export async function resizeTerminal(
  tabId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_terminal", { tabId, cols, rows });
}

/** Disconnect a session. */
export async function disconnectSession(tabId: string): Promise<void> {
  return invoke("disconnect_session", { tabId });
}

/** Poll the local machine's CPU/memory snapshot. */
export async function getSystemStats(): Promise<SystemSnapshot> {
  return invoke<SystemSnapshot>("get_system_stats");
}
