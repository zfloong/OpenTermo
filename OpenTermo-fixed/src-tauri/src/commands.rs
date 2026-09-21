//! Tauri IPC commands exposed to the frontend.

use std::collections::HashMap;
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;

use meatshell::command::{CommandEntry, CommandStore};
use meatshell::config::{ConfigStore, Session as SessionConfig};
use meatshell::system::{SystemSampler, SystemSnapshot};
use tauri::State;

use crate::prompts::PromptManager;
use crate::session::{MountInfo, SessionManager, MOUNT_OP};

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

// Runs on the async runtime: disconnecting a mounted tab can wait ~1s.
#[tauri::command(async)]
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
    // Only (None, None) means cancel; a half-filled reply is valid because
    // meatshell applies just the fields flagged by need_user/need_password.
    let reply = match (user, password) {
        (None, None) => None,
        (u, p) => Some((
            u.unwrap_or_default(),
            p.unwrap_or_default(),
            remember.unwrap_or(false),
        )),
    };
    prompts.reply_credential(&id, reply)
}

#[tauri::command]
pub fn get_system_stats(
    sampler: State<'_, std::sync::Mutex<SystemSampler>>,
) -> SystemSnapshot {
    sampler.lock().unwrap().sample()

}


/// Find the first free drive letter from M: through Z:.
///
/// `used` is a caller-provided snapshot so the mounts lock is not held across
/// the PowerShell query below.
fn find_free_drive(used: &std::collections::HashSet<String>) -> Result<String, String> {
    // Query real physical/network drives via WMI (handles drives with no media)
    let occupied = get_occupied_drives();

    for letter in 'M'..='Z' {
        let drive = format!("{}:", letter);
        if used.contains(&drive) || occupied.contains(&drive) {
            continue;
        }
        return Ok(drive);
    }
    Err("No free drive letter available (M:-Z:)".into())
}

/// Query Windows for all occupied drive letters via WMI.
fn get_occupied_drives() -> std::collections::HashSet<String> {
    let mut set = std::collections::HashSet::new();
    if let Ok(out) = Command::new("powershell").creation_flags(0x08000000)
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
    cmd.creation_flags(0x08000000);
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

// Runs on the async runtime: the rclone/PowerShell work below takes seconds.
#[tauri::command(async)]
pub fn rclone_mount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    // Serialize with unmount/disconnect/close cleanup so the mounts table and
    // drive letters can't race (main-thread execution used to provide this).
    let _op = MOUNT_OP.lock();

    // Snapshot what we need, then release the lock before the slow work.
    let (host, port, user, password_opt, key_path_opt) = {
        let configs = mgr.session_configs.lock();
        let config = configs
            .get(&tab_id)
            .ok_or_else(|| format!("session {tab_id} not found"))?;

        // Password vs key auth
        let password_opt = if matches!(config.auth, meatshell::config::AuthMethod::Password) {
            Some(config.password.clone())
        } else {
            None
        };
        let key_path_opt = if matches!(config.auth, meatshell::config::AuthMethod::Key) && !config.private_key_path.is_empty() {
            Some(config.private_key_path.clone())
        } else {
            None
        };

        (config.host.clone(), config.port, config.user.clone(), password_opt, key_path_opt)
    };

    // Already mounted?
    let already_mounted = mgr
        .mounts
        .lock()
        .get(&tab_id)
        .map(|m| m.drive_letter.clone());
    if let Some(existing) = already_mounted {
        return Err(format!("Already mounted at {}", existing));
    }

    // Find free drive letter from a snapshot (the drive query below is slow)
    let used: std::collections::HashSet<String> = mgr
        .mounts
        .lock()
        .values()
        .map(|m| m.drive_letter.clone())
        .collect();
    let drive_letter = find_free_drive(&used)?;

    // Unique rclone config name per tab. Uses the full tab id: the old
    // 12-char truncation made two tabs of the same session share one config
    // entry, so unmounting one deleted the entry the other still referenced.
    let config_name = format!("ms_{tab_id}");

    create_rclone_config(
        crate::get_rclone_path(),
        &config_name,
        &host,
        port,
        &user,
        password_opt.as_ref().map(|s| s.as_str()),
        key_path_opt.as_deref(),
    )?;

    // Spawn rclone mount as background process
    let mut cmd = Command::new(crate::get_rclone_path());
    cmd.creation_flags(0x08000000);
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
            let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
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
                    let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
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
            let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
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

#[tauri::command(async)]
pub fn rclone_unmount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    let _op = MOUNT_OP.lock();

    let mount = {
        let mut mounts = mgr.mounts.lock();
        mounts.remove(&tab_id)
            .ok_or_else(|| "No active mount for this session".to_string())?
    };

    let drive = mount.drive_letter.clone();

    let _ = Command::new("taskkill").creation_flags(0x08000000)
        .args(["/F", "/PID", &mount.pid.to_string()])
        .output();

    std::thread::sleep(std::time::Duration::from_millis(300));

    let _ = Command::new(crate::get_rclone_path()).creation_flags(0x08000000)
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
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}
