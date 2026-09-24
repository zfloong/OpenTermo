//! Session manager — bridges meatshell backend sessions with the Tauri
//! frontend via event emissions.

use std::collections::HashMap;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::{const_mutex, Mutex};
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

/// Reserved drive letter of a mount that has not come up yet.
///
/// The rclone config, the process start and the readiness probe together take
/// seconds, and all of that runs with `MOUNT_OP` released — that is the whole
/// point of the reservation. It keeps the letter out of the free list, keeps a
/// second mount of the same tab from starting, and acts as the cancellation
/// flag: unmounting (or closing the tab) drops it, and the attempt notices at
/// commit time that it no longer owns its reservation.
#[derive(Clone)]
pub(crate) struct MountAttempt {
    pub drive: String,
    /// Unique per attempt; also the rclone config name, so a cancelled attempt
    /// can never delete the config entry of the mount replacing it.
    pub config_name: String,
}

/// Serializes rclone mount lifecycle operations (mount / unmount / disconnect
/// cleanup / app close) — they all mutate the mounts table, the reservations
/// and drive letters. Held only for the short bookkeeping steps; see
/// `MountAttempt` for what deliberately runs outside it.
pub(crate) static MOUNT_OP: Mutex<()> = const_mutex(());

/// Mounts that have a drive letter reserved but are still coming up, by tab id.
/// Mutated only while `MOUNT_OP` is held.
static MOUNT_IN_FLIGHT: Mutex<Option<HashMap<String, MountAttempt>>> = const_mutex(None);

/// Bumped once per attempt so no two attempts share a config name.
static MOUNT_ATTEMPTS: AtomicU64 = AtomicU64::new(0);

/// Reserve `drive` for a mount about to start and mint its config name.
///
/// The name carries the full tab id — a 12-char truncation made two tabs of the
/// same session share one config entry, so unmounting one deleted the entry the
/// other still referenced — plus the attempt number, so a cancelled attempt
/// cannot delete its replacement's entry either.
/// Caller must hold `MOUNT_OP`.
pub(crate) fn reserve_mount(tab_id: &str, drive: String) -> MountAttempt {
    let attempt = MountAttempt {
        drive,
        config_name: format!("ms_{tab_id}_{}", MOUNT_ATTEMPTS.fetch_add(1, Ordering::Relaxed)),
    };
    MOUNT_IN_FLIGHT
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(tab_id.to_string(), attempt.clone());
    attempt
}

/// True while a mount for `tab_id` is still coming up.
pub(crate) fn mount_in_flight(tab_id: &str) -> bool {
    MOUNT_IN_FLIGHT
        .lock()
        .as_ref()
        .is_some_and(|m| m.contains_key(tab_id))
}

/// Drive letters held by mounts that are still coming up, so a new mount does
/// not pick one of them.
pub(crate) fn in_flight_drives() -> Vec<String> {
    MOUNT_IN_FLIGHT
        .lock()
        .as_ref()
        .map(|m| m.values().map(|a| a.drive.clone()).collect())
        .unwrap_or_default()
}

/// Remove `tab_id`'s reservation if it is still the one `config_name`
/// identifies. Returns whether it was: an attempt that no longer owns its
/// reservation was cancelled and must not drop the reservation that replaced
/// it. Caller must hold `MOUNT_OP`.
fn take_own_reservation(tab_id: &str, config_name: &str) -> bool {
    let mut in_flight = MOUNT_IN_FLIGHT.lock();
    let Some(map) = in_flight.as_mut() else {
        return false;
    };
    if map.get(tab_id).is_some_and(|a| a.config_name == config_name) {
        map.remove(tab_id);
        true
    } else {
        false
    }
}

/// Kill an rclone process and delete the config entry it was started with.
fn kill_rclone(pid: u32, config_name: &str) {
    let _ = Command::new("taskkill").creation_flags(0x08000000)
        .args(["/F", "/PID", &pid.to_string()])
        .output();
    let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
        .args(["config", "delete", config_name])
        .output();
}

/// Hand a mount that has come up over to the mounts table — unless it was
/// cancelled meanwhile (tab closed, unmounted, app closing), in which case the
/// caller has to tear it down instead of committing.
pub(crate) fn commit_mount(
    mounts: &Mutex<HashMap<String, MountInfo>>,
    tab_id: &str,
    attempt: &MountAttempt,
    pid: u32,
) -> bool {
    let _op = MOUNT_OP.lock();
    if !take_own_reservation(tab_id, &attempt.config_name) {
        return false;
    }
    mounts.lock().insert(
        tab_id.to_string(),
        MountInfo {
            drive_letter: attempt.drive.clone(),
            pid,
            config_name: attempt.config_name.clone(),
        },
    );
    true
}

/// Give up a mount attempt: kill the process it started (when it got that far),
/// delete its config entry and release its reservation.
pub(crate) fn abort_mount(tab_id: &str, attempt: &MountAttempt, pid: Option<u32>) {
    match pid {
        Some(pid) => kill_rclone(pid, &attempt.config_name),
        None => {
            let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
                .args(["config", "delete", &attempt.config_name])
                .output();
        }
    }
    let _op = MOUNT_OP.lock();
    take_own_reservation(tab_id, &attempt.config_name);
}

/// Remove `tab_id`'s mount entry and tear the mount down: kill the rclone
/// process and delete its config entry. A mount for the same tab that is still
/// coming up is cancelled too. Caller must hold `MOUNT_OP`.
fn unmount_locked(mounts: &Mutex<HashMap<String, MountInfo>>, tab_id: &str) {
    // Bound first so the mounts lock is released before the taskkill wait.
    let mount = mounts.lock().remove(tab_id);
    if let Some(in_flight) = MOUNT_IN_FLIGHT.lock().as_mut() {
        in_flight.remove(tab_id);
    }
    if let Some(mount) = mount {
        kill_rclone(mount.pid, &mount.config_name);
        // Brief wait for WinFsp to release the drive
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

/// Manages the tokio runtime and active SSH/Serial/Telnet sessions.
pub struct SessionManager {
    pub runtime: tokio::runtime::Runtime,
    pub sessions: Arc<Mutex<HashMap<String, SessionHandle>>>,
    /// Session configs stored for mount auth (keyed by tab_id)
    pub session_configs: Arc<Mutex<HashMap<String, SessionConfig>>>,
    /// Active rclone mounts: tab_id -> MountInfo
    pub mounts: Arc<Mutex<HashMap<String, MountInfo>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            runtime: tokio::runtime::Runtime::new()
                .expect("failed to create tokio runtime"),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            session_configs: Arc::new(Mutex::new(HashMap::new())),
            mounts: Arc::new(Mutex::new(HashMap::new())),
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
        let mounts = self.mounts.clone();
        let tid = tab_id_owned.clone();
        self.runtime.spawn(async move {
            forward_events(app, sessions, mounts, tid, rx, prompts).await;
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
        // Serialize with mount/unmount; `unmount_locked` also cancels a mount
        // for this tab that is still coming up, so a half-finished mount never
        // outlives its tab.
        let _op = MOUNT_OP.lock();
        // Unmount rclone if mounted for this tab
        unmount_locked(&self.mounts, tab_id);
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
        // Cancel the mounts that are still coming up: they tear themselves down
        // at commit time instead of mounting after the app is gone.
        {
            let _op = MOUNT_OP.lock();
            if let Some(in_flight) = MOUNT_IN_FLIGHT.lock().as_mut() {
                in_flight.clear();
            }
        }
        // ...then wait for them to finish, so nothing is left mounted behind us.
        // The lock is released above on purpose — a cancelled attempt needs it
        // to release its own reservation. Bounded: the attempts are at most one
        // readiness probe away from noticing.
        for _ in 0..100 {
            if in_flight_drives().is_empty() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let mounts: Vec<MountInfo> = self.mounts.lock().drain().map(|(_, m)| m).collect();
        for mount in &mounts {
            kill_rclone(mount.pid, &mount.config_name);
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
    mounts: Arc<Mutex<HashMap<String, MountInfo>>>,
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
                // The frontend drops the tab on this event, so a mount left
                // behind would have no way to be unmounted — tear it down.
                let mounts = mounts.clone();
                let tid = tab_id.clone();
                tokio::task::spawn_blocking(move || {
                    let _op = MOUNT_OP.lock();
                    unmount_locked(&mounts, &tid);
                });
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
            // ── Kernel events this layer does not forward ─────────────────
            // Spelled out variant by variant rather than `_ => {}`: a wildcard
            // let new `SessionEvent` variants vanish without a trace — seven of
            // them had been dropped unnoticed (five were dead variants and one
            // was a leftover of a removed feature; all six have since been
            // deleted from the kernel). With this shape, adding a variant fails
            // to compile until someone decides to forward it or to ignore it on
            // purpose.
            //
            // intentionally ignored: ZMODEM download progress. This one *is*
            // produced (`zmodem.rs`), but nothing in the UI renders progress
            // yet; wiring it up is its own piece of work.
            SessionEvent::TransferProgress { .. } => {}
        }
    }
}