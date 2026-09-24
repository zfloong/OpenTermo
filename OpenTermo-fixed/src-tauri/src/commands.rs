//! Tauri IPC commands exposed to the frontend.

use std::collections::HashMap;
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;

use meatshell::command::{CommandEntry, CommandStore};
use meatshell::config::{ConfigStore, Session as SessionConfig};
use meatshell::system::{SystemSampler, SystemSnapshot};
use parking_lot::Mutex;
use tauri::{Manager, State};

use crate::prompts::PromptManager;
use crate::session::{
    abort_mount, commit_mount, in_flight_drives, mount_in_flight, reserve_mount, MountInfo,
    SessionManager, MOUNT_OP,
};

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

/// Insert `entry`, or replace the entry that carries its id.
fn upsert_entry(store: &mut CommandStore, entry: CommandEntry) -> Result<(), String> {
    let id = entry.id.clone();
    if store.entries().iter().any(|e| e.id == id) {
        store.update(&id, entry).map_err(|e| e.to_string())?;
    } else {
        store.add(entry);
    }
    Ok(())
}

#[tauri::command]
pub fn save_command(entry: CommandEntry) -> Result<CommandEntry, String> {
    let mut store = CommandStore::load().map_err(|e| e.to_string())?;
    // The store keeps the entry exactly as handed to it, so there is nothing to
    // read back — this used to do a second full load just to echo the entry.
    let saved = entry.clone();
    upsert_entry(&mut store, entry)?;
    store.save().map_err(|e| e.to_string())?;
    Ok(saved)
}

/// Upsert a batch of entries with a single load and a single save.
///
/// Import and folder rename used to loop over `save_command`, which is two full
/// file reads plus a write per entry: importing N commands cost 2N reads.
#[tauri::command]
pub fn save_commands(entries: Vec<CommandEntry>) -> Result<(), String> {
    let mut store = CommandStore::load().map_err(|e| e.to_string())?;
    for entry in entries {
        upsert_entry(&mut store, entry)?;
    }
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
/// `occupied` is the system's drive list, queried by the caller *before* it
/// takes `MOUNT_OP` — the PowerShell query behind it is slow, and nothing about
/// drive letters should be serialized behind it. `used` is the live snapshot of
/// the letters mounts hold, and is read under the lock.
fn pick_free_drive(
    occupied: &std::collections::HashSet<String>,
    used: &std::collections::HashSet<String>,
) -> Result<String, String> {
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

// Every step of this waits on a child process, so the body runs on a blocking
// thread instead of occupying one of the async runtime's workers.
#[tauri::command]
pub async fn rclone_mount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    // Both tables live behind `Arc`s, so the blocking task needs neither the
    // managed state nor a lifetime tie to this invocation.
    let session_configs = mgr.session_configs.clone();
    let mounts = mgr.mounts.clone();
    tokio::task::spawn_blocking(move || mount_blocking(&session_configs, &mounts, &tab_id))
        .await
        .map_err(|e| format!("mount task failed: {e}"))?
}

/// The blocking half of `rclone_mount`: enumerating the system's drive letters,
/// writing the rclone config, starting the process and probing readiness all
/// wait on something external — none of it belongs on an async worker thread.
fn mount_blocking(
    session_configs: &Mutex<HashMap<String, SessionConfig>>,
    mounts: &Mutex<HashMap<String, MountInfo>>,
    tab_id: &str,
) -> Result<String, String> {
    // Snapshot what we need from the session config.
    let (host, port, user, password_opt, key_path_opt) = {
        let configs = session_configs.lock();
        let config = configs
            .get(tab_id)
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

    // Query the system's drive letters up front, before any lock is taken.
    let occupied = get_occupied_drives();

    // Reserve a drive letter and a config name. `MOUNT_OP` is held for this
    // bookkeeping step only — the seconds the rclone process needs to come up
    // run unlocked, so closing the tab (or mounting another one) is not blocked
    // behind it. The reservation is what keeps the letter out of the free list
    // and it doubles as the cancellation flag read at the end.
    let attempt = {
        let _op = MOUNT_OP.lock();

        let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
        {
            let active = mounts.lock();
            if let Some(existing) = active.get(tab_id) {
                return Err(format!("Already mounted at {}", existing.drive_letter));
            }
            used.extend(active.values().map(|m| m.drive_letter.clone()));
        }
        if mount_in_flight(tab_id) {
            return Err("Mount already in progress for this session".into());
        }
        used.extend(in_flight_drives());

        let drive = pick_free_drive(&occupied, &used)?;
        reserve_mount(tab_id, drive)
    };

    // ── Everything below runs unlocked ──────────────────────────────────────
    if let Err(e) = create_rclone_config(
        crate::get_rclone_path(),
        &attempt.config_name,
        &host,
        port,
        &user,
        password_opt.as_ref().map(|s| s.as_str()),
        key_path_opt.as_deref(),
    ) {
        abort_mount(tab_id, &attempt, None);
        return Err(e);
    }

    // Spawn rclone mount as background process
    let mut cmd = Command::new(crate::get_rclone_path());
    cmd.creation_flags(0x08000000);
    cmd.args(["mount", &format!("{}:/", attempt.config_name), &attempt.drive])
        .arg("--volname")
        .arg(format!("ms_{}", &host))
        .arg("--no-check-certificate")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            abort_mount(tab_id, &attempt, None);
            return Err(format!("Failed to start rclone: {}", e));
        }
    };

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
            abort_mount(tab_id, &attempt, Some(pid));
            return Err(format!(
                "[rclone] {} 挂载失败 (exit {})\n{}",
                host, status, stderr_str.trim()
            ));
        }
        Ok(None) => {
            // Process still running — verify the drive is accessible
            if std::fs::read_dir(&attempt.drive).is_err() {
                // Drive not accessible, kill and clean up
                abort_mount(tab_id, &attempt, Some(pid));
                return Err(format!(
                    "[rclone] {} 挂载到 {} 但盘符不可访问，请检查密钥和网络",
                    host, attempt.drive
                ));
            }
        }
        Err(e) => {
            abort_mount(tab_id, &attempt, Some(pid));
            return Err(format!("[rclone] 进程异常: {}", e));
        }
    }

    // The mount is up — hand it over to the mounts table, unless it was
    // cancelled while it was starting (tab closed, unmounted, app closing).
    if !commit_mount(mounts, tab_id, &attempt, pid) {
        abort_mount(tab_id, &attempt, Some(pid));
        return Err("Mount cancelled".into());
    }

    Ok(format!("{} -> {}", attempt.drive, host))
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

/// True if a process with this PID is running. Fail-safe: when `tasklist`
/// can't be run at all, reports alive so a live mount is never pruned.
fn pid_alive(pid: u32) -> bool {
    let Ok(out) = Command::new("tasklist")
        .creation_flags(0x08000000)
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
    else {
        return true;
    };
    // A match prints a CSV row like `"rclone.exe","1234",...`; no match
    // prints a localized info line that never starts with a quote.
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .any(|line| line.starts_with('"'))
}

/// Drop mounts whose rclone process died on its own (crash, or killed from
/// outside the app) and delete their config entries. The session is still
/// alive, so nothing else would ever clean these up; the frontend polls
/// `rclone_list` every few seconds, making it the natural detection point.
fn prune_dead_mounts(mgr: &SessionManager) {
    let snapshot: Vec<(String, u32, String)> = mgr
        .mounts
        .lock()
        .iter()
        .map(|(id, m)| (id.clone(), m.pid, m.config_name.clone()))
        .collect();

    for (tab_id, pid, config_name) in snapshot {
        if pid_alive(pid) {
            continue;
        }
        // Serialize with mount/unmount, then remove only if the entry is
        // still the same one — a remount may have replaced it meanwhile.
        let _op = MOUNT_OP.lock();
        let removed = {
            let mut mounts = mgr.mounts.lock();
            let same_entry = mounts.get(&tab_id).is_some_and(|m| m.pid == pid);
            if same_entry {
                mounts.remove(&tab_id);
            }
            same_entry
        };
        if removed {
            let _ = Command::new(crate::get_rclone_path())
                .creation_flags(0x08000000)
                .args(["config", "delete"])
                .arg(&config_name)
                .output();
        }
    }
}

// Runs on the async runtime: dead-mount probing spawns tasklist.
#[tauri::command(async)]
pub fn rclone_list(
    mgr: State<'_, SessionManager>,
) -> Vec<HashMap<String, String>> {
    prune_dead_mounts(&mgr);
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
    // The only caller is the command export, which always writes JSON picked in
    // the native save dialog. Unconstrained, this command handed the webview a
    // "write any content to any path" primitive.
    let is_json = std::path::Path::new(&path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("只能写入 .json 文件".into());
    }
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败: {}", e))
}

// -- Appearance --------------------------------------------------------------

/// Where the imported background image lives inside the app data directory.
fn background_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建应用数据目录: {}", e))?;
    Ok(dir.join("background.jpg"))
}

fn background_data_url(path: &std::path::Path) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(path).map_err(|e| format!("无法读取背景图: {}", e))?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Import a wallpaper: decode whatever the user picked, downscale it to a
/// sane size, re-encode as JPEG and hand it back as a data URL the webview
/// can paint from CSS. Nothing but the re-encoded copy is ever stored.
#[tauri::command(async)]
pub fn set_background_image(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let dest = background_path(&app)?;
    let img = image::open(&path).map_err(|e| format!("无法读取图片: {}", e))?;
    let img = img
        .resize(2560, 1440, image::imageops::FilterType::Lanczos3)
        .into_rgb8();
    let file = std::fs::File::create(&dest).map_err(|e| format!("无法写入背景图: {}", e))?;
    let mut writer = std::io::BufWriter::new(file);
    img.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, 85))
        .map_err(|e| format!("无法编码背景图: {}", e))?;
    background_data_url(&dest)
}

/// The stored wallpaper as a data URL, or `None` when none was ever imported.
#[tauri::command(async)]
pub fn get_background_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dest = background_path(&app)?;
    if !dest.exists() {
        return Ok(None);
    }
    background_data_url(&dest).map(Some)
}

#[tauri::command]
pub fn clear_background_image(app: tauri::AppHandle) -> Result<(), String> {
    let dest = background_path(&app)?;
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|e| format!("无法删除背景图: {}", e))?;
    }
    Ok(())
}
