//! Tauri IPC commands exposed to the frontend.

use std::sync::Arc;

use meatshell::command::{CommandEntry, CommandStore};
use meatshell::config::{ConfigStore, PortForward, Session as SessionConfig};
use meatshell::sftp::SftpCommand;
use meatshell::ssh::PortForwardInfo;
use meatshell::system::{SystemSampler, SystemSnapshot};
use tauri::{Manager, State};

use crate::prompts::PromptManager;
use crate::session::SessionManager;

// ── Session CRUD ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionConfig>, String> {
    let store = ConfigStore::load().map_err(|e| e.to_string())?;
    Ok(store.sessions().to_vec())
}

#[tauri::command]
pub fn save_session(session: SessionConfig) -> Result<(), String> {
    let mut store = ConfigStore::load().map_err(|e| e.to_string())?;
    store.upsert(session);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(id: String) -> Result<(), String> {
    let mut store = ConfigStore::load().map_err(|e| e.to_string())?;
    store.remove(&id);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_sessions(ids: Vec<String>) -> Result<(), String> {
    let mut store = ConfigStore::load().map_err(|e| e.to_string())?;
    let sessions = store.sessions_mut();
    // Build a map from id → session, then reconstruct in new order.
    // Sessions not in the id list keep their relative order at the end.
    let mut map: std::collections::HashMap<String, SessionConfig> = sessions
        .drain(..)
        .map(|s| (s.id.clone(), s))
        .collect();
    let mut reordered = Vec::with_capacity(map.len());
    for id in &ids {
        if let Some(s) = map.remove(id) {
            reordered.push(s);
        }
    }
    // Append any remaining (not in id list) in their original relative order
    for (_k, s) in map {
        reordered.push(s);
    }
    *sessions = reordered;
    store.save().map_err(|e| e.to_string())
}

// ── Quick-command snippets ─────────────────────────────────────────────────

#[tauri::command]
pub fn list_commands() -> Result<Vec<CommandEntry>, String> {
    let store = CommandStore::load().map_err(|e| e.to_string())?;
    Ok(store.entries().to_vec())
}

#[tauri::command]
pub fn save_command(entry: CommandEntry) -> Result<CommandEntry, String> {
    let id = entry.id.clone();
    let mut store = CommandStore::load().map_err(|e| e.to_string())?;
    let existing = store.entries().iter().any(|e| e.id == id);
    if existing {
        store.update(&id, entry).map_err(|e| e.to_string())?;
    } else {
        store.add(entry);
    }
    store.save().map_err(|e| e.to_string())?;
    // Reload so the returned entry is canonical
    let store2 = CommandStore::load().map_err(|e| e.to_string())?;
    Ok(store2.entries().iter()
        .find(|e| e.id == id)
        .cloned()
        .unwrap_or_else(|| CommandEntry {
            id: String::new(),
            label: String::new(),
            command: String::new(),
            category: String::new(),
            pinned: false,
            last_used: None,
            icon: None,
            description: None,
            order: None,
        }))
}

#[tauri::command]
pub fn reorder_commands(ids: Vec<String>) -> Result<(), String> {
    let mut store = CommandStore::load().map_err(|e| e.to_string())?;
    store.reorder(&ids);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_command(id: String) -> Result<(), String> {
    let mut store = CommandStore::load().map_err(|e| e.to_string())?;
    store.remove(&id);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Terminal session lifecycle ────────────────────────────────────────────

#[tauri::command]
pub fn connect_session(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    session: SessionConfig,
    app: tauri::AppHandle,
    prompts: State<'_, Arc<PromptManager>>,
) -> Result<(), String> {
    mgr.connect(app, &tab_id, session, prompts.inner().clone())
}

#[tauri::command]
pub fn send_input(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    mgr.send_input(&tab_id, data.into_bytes())
}

#[tauri::command]
pub fn resize_terminal(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    mgr.resize(&tab_id, cols, rows)
}

#[tauri::command]
pub fn disconnect_session(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    mgr.disconnect(&tab_id)
}

// ── Prompt replies ────────────────────────────────────────────────────────

#[tauri::command]
pub fn reply_host_key(
    prompts: State<'_, Arc<PromptManager>>,
    id: String,
    accept: bool,
) -> Result<(), String> {
    prompts.reply_host_key(&id, accept)
}

#[tauri::command]
pub fn reply_credential(
    prompts: State<'_, Arc<PromptManager>>,
    id: String,
    user: Option<String>,
    password: Option<String>,
    remember: Option<bool>,
) -> Result<(), String> {
    let reply = match (user, password) {
        (Some(u), Some(p)) => Some((u, p, remember.unwrap_or(false))),
        _ => None,
    };
    prompts.reply_credential(&id, reply)
}

// ── Local system monitor ──────────────────────────────────────────────────

#[tauri::command]
pub fn get_system_stats(
    sampler: State<'_, std::sync::Mutex<SystemSampler>>,
) -> SystemSnapshot {
    sampler.lock().unwrap().sample()
}

// ── SFTP ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn sftp_spawn(
    mgr: State<'_, SessionManager>,
    app: tauri::AppHandle,
    tab_id: String,
    session: SessionConfig,
) -> Result<(), String> {
    mgr.spawn_sftp(app, &tab_id, session)
}

#[tauri::command]
pub fn sftp_list_dir(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    path: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::ListDir(path))
}

#[tauri::command]
pub fn sftp_download(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    remote: String,
    local_dir: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::Download { remote, local_dir })
}

#[tauri::command]
pub fn sftp_upload(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    local: String,
    remote_dir: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::Upload { local, remote_dir })
}

#[tauri::command]
pub fn sftp_mkdir(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    path: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::MkDir(path))
}

#[tauri::command]
pub fn sftp_delete(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    path: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::Delete(path))
}

#[tauri::command]
pub fn sftp_rename(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    mgr.sftp_send(&tab_id, SftpCommand::Rename { from, to })
}

#[tauri::command]
pub fn reveal_in_explorer(mut path: String) {
    #[cfg(target_os = "windows")]
    {
        // Replace forward slashes with backslashes for Windows explorer
        path = path.replace('/', "\\");
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn();
    }
}

/// Returns the default download directory:
/// - Windows: tries `D:\meatshell-downloads` first, falls back to app-local data dir
/// - Linux/macOS: user's download directory
#[tauri::command]
pub fn get_download_dir(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let d_drive = "D:\\meatshell-downloads";
        let candidate = std::path::Path::new(d_drive);
        // If D: drive exists, use it
        if std::path::Path::new("D:\\").exists() {
            let _ = std::fs::create_dir_all(candidate);
            return Ok(d_drive.to_string());
        }
        // Fall back to the app's local data directory
        let data_dir = app
            .path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."));
        let dl = data_dir.join("downloads");
        let _ = std::fs::create_dir_all(&dl);
        Ok(dl.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let data_dir = app
            .path()
            .app_local_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."));
        let dl = data_dir.join("downloads");
        let _ = std::fs::create_dir_all(&dl);
        Ok(dl.to_string_lossy().to_string())
    }
}

#[tauri::command]
pub fn open_in_editor(path: String) {
    // Open file with its default Windows application
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .ok();
}

// ── Port forwarding ──────────────────────────────────────────────────────

#[tauri::command]
pub fn port_forward_start(
    mgr: State<'_, SessionManager>,
    app: tauri::AppHandle,
    tab_id: String,
    forward: PortForward,
) -> Result<PortForwardInfo, String> {
    mgr.start_forward(&app, &tab_id, forward)
}

#[tauri::command]
pub fn port_forward_stop(
    mgr: State<'_, SessionManager>,
    app: tauri::AppHandle,
    tab_id: String,
    forward_id: String,
) -> Result<(), String> {
    mgr.stop_forward(&app, &tab_id, &forward_id)
}

#[tauri::command]
pub fn port_forward_list(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Vec<PortForwardInfo> {
    mgr.list_forwards(&tab_id)
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}