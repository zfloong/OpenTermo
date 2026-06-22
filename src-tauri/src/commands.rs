//! Tauri IPC commands exposed to the frontend.

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::Arc;

use meatshell::command::{CommandEntry, CommandStore};
use meatshell::config::{ConfigStore, Session as SessionConfig};
use meatshell::system::{SystemSampler, SystemSnapshot};
use tauri::State;

use crate::prompts::PromptManager;
use crate::session::{MountInfo, SessionManager};

// -- Session CRUD -----------------------------------------------------------

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
    let mut map: HashMap<String, SessionConfig> = sessions
        .drain(..)
        .map(|s| (s.id.clone(), s))
        .collect();
    let mut reordered = Vec::with_capacity(map.len());
    for id in &ids {
        if let Some(s) = map.remove(id) {
            reordered.push(s);
        }
    }
    for (_k, s) in map {
        reordered.push(s);
    }
    *sessions = reordered;
    store.save().map_err(|e| e.to_string())
}

// -- Quick-command snippets --------------------------------------------------

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

// -- Terminal session lifecycle ----------------------------------------------

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

// -- System & interactions ---------------------------------------------------

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

#[tauri::command]
pub fn get_system_stats(
    sampler: State<'_, std::sync::Mutex<SystemSampler>>,
) -> SystemSnapshot {
    sampler.lock().unwrap().sample()
}

#[tauri::command]
pub fn get_download_dir() -> String {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
    Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// -- Rclone remote filesystem mount ------------------------------------------

/// Find the first free drive letter from M: through Z:.
fn find_free_drive(mounts: &HashMap<String, MountInfo>) -> Result<String, String> {
    let used: std::collections::HashSet<&str> = mounts
        .values()
        .map(|m| m.drive_letter.as_str())
        .collect();

    // Query real physical/network drives via WMI (handles drives with no media)
    let occupied = get_occupied_drives();

    for letter in 'M'..='Z' {
        let drive = format!("{}:", letter);
        if used.contains(drive.as_str()) || occupied.contains(&drive) {
            continue;
        }
        return Ok(drive);
    }
    Err("No free drive letter available (M:-Z:)".into())
}

/// Query Windows for all occupied drive letters via WMI.
fn get_occupied_drives() -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    if let Ok(out) = Command::new("powershell")
        .args(["-NoProfile", "-Command",
            "(Get-CimInstance Win32_LogicalDisk).DeviceID -join ' '"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for word in stdout.split_whitespace() {
            let trimmed = word.trim();
            if trimmed.len() == 2 && trimmed.ends_with(':') {
                set.insert(trimmed.to_uppercase());
            }
        }
    }
    set
}

/// Create a per-session rclone SFTP config entry.
fn create_rclone_config(
    rclone_path: &str,
    config_name: &str,
    host: &str,
    port: u16,
    user: &str,
    password: Option<&str>,
    key_path: Option<&str>,
) -> Result<(), String> {
    let mut cmd = Command::new(rclone_path);
    cmd.args(["config", "create", config_name, "sftp"])
        .arg("host").arg(host)
        .arg("port").arg(port.to_string())
        .arg("user").arg(user)
        .arg("shell_type").arg("unix")
        .arg("set_modtime").arg("false")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(kp) = key_path {
        let fixed = kp.replace('\\', "/");
        cmd.arg("key_file").arg(&fixed);
    }

    if let Some(pw) = password {
        cmd.arg("pass").arg(pw);
    }

    let output = cmd.output().map_err(|e| format!("Failed to run rclone config: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rclone config failed: {}", stderr.trim()));
    }
    Ok(())
}

#[tauri::command]
pub fn rclone_mount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    let configs = mgr.session_configs.lock();
    let config = configs
        .get(&tab_id)
        .ok_or_else(|| format!("session {tab_id} not found"))?;

    let host = config.host.clone();
    let port = config.port;
    let user = config.user.clone();

    // Already mounted?
    {
        let mounts = mgr.mounts.lock();
        if let Some(existing) = mounts.get(&tab_id) {
            return Err(format!("Already mounted at {}", existing.drive_letter));
        }
    }

    // Find free drive letter
    let drive_letter = {
        let mounts = mgr.mounts.lock();
        find_free_drive(&mounts)?
    };

    // Unique rclone config name per tab
    let config_name = format!("ms_{}", &tab_id[..tab_id.len().min(12)]);

    // Password vs key auth
    let password_opt = if matches!(config.auth, meatshell::config::AuthMethod::Password) {
        Some(config.password.as_str())
    } else {
        None
    };
    let key_path_opt = if matches!(config.auth, meatshell::config::AuthMethod::Key) && !config.private_key_path.is_empty() {
        Some(config.private_key_path.as_str())
    } else {
        None
    };

    create_rclone_config(
        &mgr.rclone_path,
        &config_name,
        &host,
        port,
        &user,
        password_opt,
        key_path_opt,
    )?;

    // Spawn rclone mount as background process
    let mut cmd = Command::new(&mgr.rclone_path);
    cmd.args(["mount", &format!("{}:/", config_name), &drive_letter])
        .arg("--volname")
        .arg(format!("ms_{}", &host))
        .arg("--no-check-certificate")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start rclone: {}", e))?;

    let pid = child.id();

    // Wait and verify the mount actually works
    std::thread::sleep(std::time::Duration::from_secs(2));
    match child.try_wait() {
        Ok(Some(status)) => {
            use std::io::Read;
            let mut stderr_str = String::new();
            if let Some(ref mut s) = child.stderr {
                let _ = s.read_to_string(&mut stderr_str);
            }
            let _ = Command::new(&mgr.rclone_path)
                .args(["config", "delete", &config_name])
                .output();
            return Err(format!(
                "[rclone] {} 挂载失败 (exit {})\n{}",
                host, status, stderr_str.trim()
            ));
        }
        Ok(None) => {
            // Process still running — verify the drive is accessible
            let test = std::fs::read_dir(&drive_letter);
            match test {
                Ok(_) => {} // Success
                Err(_) => {
                    // Drive not accessible, kill and clean up
                    let _ = child.kill();
                    let _ = Command::new(&mgr.rclone_path)
                        .args(["config", "delete", &config_name])
                        .output();
                    return Err(format!(
                        "[rclone] {} 挂载到 {} 但盘符不可访问，请检查密钥和网络",
                        host, drive_letter
                    ));
                }
            }
        }
        Err(e) => {
            let _ = Command::new(&mgr.rclone_path)
                .args(["config", "delete", &config_name])
                .output();
            return Err(format!("[rclone] 进程异常: {}", e));
        }
    }

    mgr.mounts.lock().insert(tab_id, MountInfo {
        drive_letter: drive_letter.clone(),
        pid,
        config_name,
    });

    Ok(format!("{} -> {}", drive_letter, host))
}

#[tauri::command]
pub fn rclone_unmount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    let mount = {
        let mut mounts = mgr.mounts.lock();
        mounts.remove(&tab_id)
            .ok_or_else(|| "No active mount for this session".to_string())?
    };

    let drive = mount.drive_letter.clone();

    let _ = Command::new("taskkill")
        .args(["/F", "/PID", &mount.pid.to_string()])
        .output();

    std::thread::sleep(std::time::Duration::from_millis(300));

    let _ = Command::new(&mgr.rclone_path)
        .args(["config", "delete", &mount.config_name])
        .output();

    Ok(format!("Unmounted {}", drive))
}

#[tauri::command]
pub fn rclone_list(
    mgr: State<'_, SessionManager>,
) -> Vec<HashMap<String, String>> {
    mgr.mounts.lock().iter().map(|(id, m)| {
        let mut map = HashMap::new();
        map.insert("tabId".into(), id.clone());
        map.insert("drive".into(), m.drive_letter.clone());
        map
    }).collect()
}

// -- Utility -----------------------------------------------------------------

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}