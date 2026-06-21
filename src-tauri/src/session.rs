//! Session manager — bridges meatshell backend sessions with the Tauri
//! frontend via event emissions.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use meatshell::config::{Session as SessionConfig, SessionKind};
use meatshell::serial::spawn_serial_session;
use meatshell::sftp::{self, SftpCommand, SftpHandle};
use meatshell::ssh::{self, SessionCommand, SessionEvent, SessionHandle};
use meatshell::telnet::spawn_telnet_session;

use crate::prompts::PromptManager;

/// Manages the tokio runtime and active SSH/Serial/Telnet sessions.
pub struct SessionManager {
    pub runtime: tokio::runtime::Runtime,
    pub sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    pub sftp_handles: Arc<Mutex<HashMap<String, SftpHandle>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            runtime: tokio::runtime::Runtime::new()
                .expect("failed to create tokio runtime"),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            sftp_handles: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn an SSH, serial, or telnet session and start forwarding events to
    /// the frontend via `app.emit(...)`.
    pub fn connect(
        &self,
        app: AppHandle,
        tab_id: &str,
        session: SessionConfig,
        prompts: Arc<PromptManager>,
    ) -> Result<(), String> {
        if self.sessions.lock().contains_key(tab_id) {
            return Err("session already exists".into());
        }

        let tab_id_owned = tab_id.to_string();

        let (handle, rx) = match &session.kind {
            SessionKind::Ssh => {
                ssh::spawn_session(
                    self.runtime.handle(),
                    tab_id_owned.clone(),
                    session,
                    80,
                    24,
                )
            }
            SessionKind::Serial => {
                spawn_serial_session(
                    self.runtime.handle(),
                    tab_id_owned.clone(),
                    session,
                )
            }
            SessionKind::Telnet => {
                spawn_telnet_session(
                    self.runtime.handle(),
                    tab_id_owned.clone(),
                    session,
                    80,
                    24,
                )
            }
        };

        // Store the handle
        self.sessions
            .lock()
            .insert(tab_id_owned.clone(), handle);

        // Spawn a task that forwards SessionEvents to Tauri events
        let sessions = self.sessions.clone();
        let tid = tab_id_owned.clone();
        self.runtime.spawn(async move {
            forward_events(app, sessions, tid, rx, prompts).await;
        });

        Ok(())
    }

    /// Spawn an SFTP worker for an existing SSH session.
    pub fn spawn_sftp(
        &self,
        app: AppHandle,
        tab_id: &str,
        session: SessionConfig,
    ) -> Result<(), String> {
        if self.sftp_handles.lock().contains_key(tab_id) {
            return Ok(()); // already open
        }

        let (events_tx, events_rx) = mpsc::unbounded_channel();
        let handle = sftp::spawn_sftp(self.runtime.handle(), session, events_tx);

        self.sftp_handles
            .lock()
            .insert(tab_id.to_string(), handle);

        let tid = tab_id.to_string();
        self.runtime.spawn(async move {
            forward_sftp_events(app, tid, events_rx).await;
        });

        Ok(())
    }

    /// Send a command to the SFTP worker for a tab.
    pub fn sftp_send(&self, tab_id: &str, cmd: SftpCommand) -> Result<(), String> {
        let handles = self.sftp_handles.lock();
        let handle = handles
            .get(tab_id)
            .ok_or_else(|| format!("SFTP not open for tab {tab_id}"))?;
        let _ = handle.commands.send(cmd);
        Ok(())
    }

    /// Send raw bytes to a session's PTY.
    pub fn send_input(&self, tab_id: &str, data: Vec<u8>) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let handle = sessions
            .get(tab_id)
            .ok_or_else(|| format!("session {tab_id} not found"))?;
        handle.send_raw(data);
        Ok(())
    }

    /// Resize a session's PTY.
    pub fn resize(&self, tab_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let sessions = self.sessions.lock();
        let handle = sessions
            .get(tab_id)
            .ok_or_else(|| format!("session {tab_id} not found"))?;
        let _ = handle
            .commands
            .send(SessionCommand::Resize(cols, rows));
        Ok(())
    }

    /// Disconnect and remove a session.
    pub fn disconnect(&self, tab_id: &str) -> Result<(), String> {
        // Close SFTP first
        if let Some(handle) = self.sftp_handles.lock().remove(tab_id) {
            let _ = handle.commands.send(SftpCommand::Close);
        }
        // Close terminal session
        let mut sessions = self.sessions.lock();
        if let Some(handle) = sessions.remove(tab_id) {
            let _ = handle.commands.send(SessionCommand::Close);
        }
        Ok(())
    }
}

// ── Terminal session event forwarding ──────────────────────────────────

/// Forward events from the meatshell session event stream to Tauri's event bus.
async fn forward_events(
    app: AppHandle,
    sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    tab_id: String,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<SessionEvent>,
    prompts: Arc<PromptManager>,
) {
    while let Some(event) = rx.recv().await {
        match event {
            SessionEvent::Output(text) => {
                let _ = app.emit(&format!("terminal-output:{tab_id}"), text);
            }
            SessionEvent::Status(status) => {
                let _ = app.emit(&format!("terminal-status:{tab_id}"), status);
            }
            SessionEvent::Connected => {
                let _ = app.emit(&format!("terminal-connected:{tab_id}"), true);
            }
            SessionEvent::Closed(reason) => {
                let _ = app.emit(&format!("terminal-closed:{tab_id}"), reason);
                sessions.lock().remove(&tab_id);
                break;
            }
            SessionEvent::HostKeyPrompt {
                host,
                port,
                key_type,
                fingerprint,
                changed,
                responder,
            } => {
                let prompt_id = prompts.register_host_key(responder);
                let _ = app.emit(
                    "host-key-prompt",
                    serde_json::json!({
                        "tab_id": tab_id,
                        "prompt_id": prompt_id,
                        "host": host,
                        "port": port,
                        "key_type": key_type,
                        "fingerprint": fingerprint,
                        "changed": changed,
                    }),
                );
            }
            SessionEvent::CredentialPrompt {
                session_id,
                host,
                user,
                need_user,
                need_password,
                responder,
            } => {
                let prompt_id = prompts.register_credential(responder);
                let _ = app.emit(
                    "credential-prompt",
                    serde_json::json!({
                        "tab_id": tab_id,
                        "prompt_id": prompt_id,
                        "session_id": session_id,
                        "host": host,
                        "user": user,
                        "need_user": need_user,
                        "need_password": need_password,
                    }),
                );
            }
            SessionEvent::ResourceStats {
                cpu_percent,
                mem_used_kib,
                mem_total_kib,
                ..
            } => {
                let _ = app.emit(
                    &format!("remote-stats:{tab_id}"),
                    serde_json::json!({
                        "cpu_percent": cpu_percent,
                        "mem_used_kib": mem_used_kib,
                        "mem_total_kib": mem_total_kib,
                    }),
                );
            }
            SessionEvent::CwdChanged(path) => {
                let _ = app.emit(&format!("terminal-cwd:{tab_id}"), path);
            }
            SessionEvent::SftpStatus(status) => {
                let _ = app.emit(&format!("sftp-status:{tab_id}"), status);
            }
            _ => {
                // Other events handled by SFTP forwarder
            }
        }
    }
}

// ── SFTP event forwarding ──────────────────────────────────────────────

async fn forward_sftp_events(
    app: AppHandle,
    tab_id: String,
    mut rx: mpsc::UnboundedReceiver<SessionEvent>,
) {
    while let Some(event) = rx.recv().await {
        match event {
            SessionEvent::SftpEntries { path, entries } => {
                let _ = app.emit(
                    &format!("sftp-entries:{tab_id}"),
                    serde_json::json!({
                        "path": path,
                        "entries": entries,
                    }),
                );
            }
            SessionEvent::SftpStatus(status) => {
                let _ = app.emit(&format!("sftp-status:{tab_id}"), status);
            }
            SessionEvent::SftpError(msg) => {
                let _ = app.emit(&format!("sftp-error:{tab_id}"), msg);
            }
            SessionEvent::SftpTransfer {
                id,
                name,
                is_upload,
                transferred,
                total,
                state,
                msg,
            } => {
                let _ = app.emit(
                    &format!("sftp-transfer:{tab_id}"),
                    serde_json::json!({
                        "id": id,
                        "name": name,
                        "is_upload": is_upload,
                        "transferred": transferred,
                        "total": total,
                        "state": state,
                        "msg": msg,
                    }),
                );
            }
            _ => {
                // ignore non-SFTP events
            }
        }
    }
}
