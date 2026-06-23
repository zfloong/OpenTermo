//! Session manager — bridges meatshell backend sessions with the Tauri
//! frontend via event emissions.

use std::collections::HashMap;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use meatshell::config::{Session as SessionConfig, SessionKind};
use meatshell::serial::spawn_serial_session;
use meatshell::ssh::{self, SessionCommand, SessionEvent, SessionHandle};
use meatshell::telnet::spawn_telnet_session;

use crate::prompts::PromptManager;

/// Tracks an active rclone FUSE mount.
#[derive(Debug, Clone)]
pub struct MountInfo {
    pub drive_letter: String,
    pub pid: u32,
    /// rclone config name (used to clean up the config entry)
    pub config_name: String,
}

/// Manages the tokio runtime and active SSH/Serial/Telnet sessions.
pub struct SessionManager {
    pub runtime: tokio::runtime::Runtime,
    pub sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    /// Session configs stored for mount auth (keyed by tab_id)
    pub session_configs: Arc<Mutex<HashMap<String, SessionConfig>>>,
    /// Active rclone mounts: tab_id -> MountInfo
    pub mounts: Arc<Mutex<HashMap<String, MountInfo>>>,
    /// Path to rclone.exe (discovered at startup)
    pub rclone_path: String,
}

impl SessionManager {
    pub fn new(rclone_path: String) -> Self {
        Self {
            runtime: tokio::runtime::Runtime::new()
                .expect("failed to create tokio runtime"),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            session_configs: Arc::new(Mutex::new(HashMap::new())),
            mounts: Arc::new(Mutex::new(HashMap::new())),
            rclone_path,
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
        let session_config = session.clone();

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

        // Store the handle and config
        self.sessions
            .lock()
            .insert(tab_id_owned.clone(), handle);
        self.session_configs
            .lock()
            .insert(tab_id_owned.clone(), session_config);

        // Spawn a task that forwards SessionEvents to Tauri events
        let sessions = self.sessions.clone();
        let tid = tab_id_owned.clone();
        self.runtime.spawn(async move {
            forward_events(app, sessions, tid, rx, prompts).await;
        });

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
        // Unmount rclone if mounted for this tab
        if let Some(mount) = self.mounts.lock().remove(tab_id) {
            let _ = Command::new("taskkill").creation_flags(0x08000000)
                .args(["/F", "/PID", &mount.pid.to_string()])
                .output();
            // Brief wait for WinFsp to release
            std::thread::sleep(std::time::Duration::from_millis(500));
            // Clean up rclone config entry
            let _ = Command::new(&self.rclone_path).creation_flags(0x08000000)
                .args(["config", "delete", &mount.config_name])
                .output();
        }
        // Close terminal session
        let mut sessions = self.sessions.lock();
        if let Some(handle) = sessions.remove(tab_id) {
            let _ = handle.commands.send(SessionCommand::Close);
        }
        self.session_configs.lock().remove(tab_id);
        Ok(())
    }

    /// Kill all active rclone mounts. Called on app close.
    pub fn unmount_all(&self) {
        let mounts: Vec<MountInfo> = self.mounts.lock().drain().map(|(_, m)| m).collect();
        for mount in &mounts {
            let _ = Command::new("taskkill").creation_flags(0x08000000)
                .args(["/F", "/PID", &mount.pid.to_string()])
                .output();
            let _ = Command::new(&self.rclone_path).creation_flags(0x08000000)
                .args(["config", "delete", &mount.config_name])
                .output();
        }
        if !mounts.is_empty() {
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
    }
}

// ---------------------------------------------------------------------------
// Terminal session event forwarding
// ---------------------------------------------------------------------------

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
            _ => {}
        }
    }
}