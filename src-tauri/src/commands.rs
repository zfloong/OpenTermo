//! Tauri IPC commands exposed to the frontend.

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;

use meatshell::command::{CommandEntry, CommandStore};
use meatshell::config::{ConfigStore, Session as SessionConfig};
use meatshell::system::{SystemSampler, SystemSnapshot};
use tauri::State;

use crate::prompts::PromptManager;
use crate::session::{MountInfo, SessionManager};
use meatshell::ssh::ClientHandler;

/// Log a command invocation with its result.
macro_rules! log_command {
    ($name:expr, $result:expr) => {{
        let result = $result;
        match &result {
            Ok(_) => tracing::debug!("[命令] {} 成功", $name),
            Err(e) => tracing::warn!("[命令] {} 失败: {}", $name, e),
        }
        result
    }};
}

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
    tracing::info!(tab_id, kind = ?session.kind, host = %session.host, "正在连接会话");
    let r = mgr.connect(app, &tab_id, session, prompts.inner().clone());
    log_command!("connect_session", r)
}

#[tauri::command]
pub fn send_input(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    tracing::debug!(tab_id, len = data.len(), "发送输入");
    log_command!("send_input", mgr.send_input(&tab_id, data.into_bytes()))
}

#[tauri::command]
pub fn resize_terminal(
    mgr: State<'_, SessionManager>,
    tab_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    tracing::debug!(tab_id, cols, rows, "调整终端大小");
    log_command!("resize_terminal", mgr.resize(&tab_id, cols, rows))
}

#[tauri::command]
pub fn disconnect_session(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<(), String> {
    tracing::info!(tab_id, "正在断开会话");
    log_command!("disconnect_session", mgr.disconnect(&tab_id))
}

// -- System & interactions ---------------------------------------------------

#[tauri::command]
pub fn reply_host_key(
    prompts: State<'_, Arc<PromptManager>>,
    id: String,
    accept: bool,
) -> Result<(), String> {
    tracing::info!(prompt_id = %id, accept, "回复主机密钥");
    log_command!("reply_host_key", prompts.reply_host_key(&id, accept))
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
    tracing::info!(prompt_id = %id, has_reply = reply.is_some(), "回复凭据");
    log_command!("reply_credential", prompts.reply_credential(&id, reply))
}

#[tauri::command]
pub fn get_system_stats(
    sampler: State<'_, std::sync::Mutex<SystemSampler>>,
) -> SystemSnapshot {
    sampler.lock().unwrap().sample()

}


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
    Err("无可用的盘符 (M:-Z:)".into())
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

fn obscure_rclone_password(rclone_path: &str, password: &str) -> Result<String, String> {
    let mut child = Command::new(rclone_path);
    child
        .creation_flags(0x08000000)
        .args(["obscure", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = child
        .spawn()
        .map_err(|e| format!("启动 rclone obscure 失败: {e}。请确保已安装 rclone (https://rclone.org/downloads)"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(password.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .map_err(|e| format!("写入 rclone obscure stdin 失败: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待 rclone obscure 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rclone obscure 失败: {}", stderr.trim()));
    }

    let obscured = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if obscured.is_empty() {
        return Err("rclone obscure 返回了空密码".into());
    }
    Ok(obscured)
}

/// Create a per-session rclone SFTP config file.
fn create_rclone_config(
    runtime_dir: &Path,
    rclone_path: &str,
    config_name: &str,
    host: &str,
    port: u16,
    user: &str,
    password: Option<&str>,
    key_path: Option<&str>,
) -> Result<PathBuf, String> {
    let mut config = String::new();
    config.push_str(&format!("[{config_name}]\n"));
    config.push_str("type = sftp\n");
    config.push_str(&format!("host = {host}\n"));
    config.push_str(&format!("port = {port}\n"));
    config.push_str(&format!("user = {user}\n"));
    config.push_str("shell_type = unix\n");
    config.push_str("set_modtime = false\n");
    if let Some(pw) = password {
        let obscured = obscure_rclone_password(rclone_path, pw)?;
        config.push_str(&format!("pass = {obscured}\n"));
    }
    if let Some(kp) = key_path {
        config.push_str(&format!("key_file = {}\n", kp.replace('\\', "/")));
    }

    fs::create_dir_all(runtime_dir)
        .map_err(|e| format!("创建 rclone 配置目录失败: {e}"))?;
    let config_path = runtime_dir.join(format!("{config_name}.conf"));
    fs::write(&config_path, config)
        .map_err(|e| format!("写入 rclone 配置文件失败: {e}"))?;
    Ok(config_path)
}

#[tauri::command]
pub fn rclone_mount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    tracing::info!(tab_id, "rclone 挂载");
    let r = (|| -> Result<String, String> {
    let configs = mgr.session_configs.lock();
    let config = configs
        .get(&tab_id)
        .ok_or_else(|| format!("会话 {tab_id} 未找到"))?;

    let host = config.host.clone();
    let port = config.port;
    let user = config.user.clone();

    // Already mounted?
    {
        let mounts = mgr.mounts.lock();
        if let Some(existing) = mounts.get(&tab_id) {
            return Err(format!("已在 {} 挂载", existing.drive_letter));
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

    let config_path = create_rclone_config(
        mgr.runtime_dir(),
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
    cmd.creation_flags(0x08000000);
    cmd.arg("--config")
        .arg(&config_path)
        .args(["mount", &format!("{}:/", config_name), &drive_letter])
        .arg("--volname")
        .arg(format!("ms_{}", &host))
        .arg("--no-check-certificate")
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()
        .map_err(|e| format!("启动 rclone 失败: {}。请确保已安装 rclone (https://rclone.org/downloads)", e))?;

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
            let _ = fs::remove_file(&config_path);
            tracing::warn!(tab_id, host, exit = ?status, stderr = %stderr_str.trim(), "rclone 挂载失败（提前退出）");
            return Err(format!(
                "[rclone] {} 挂载失败 (exit {})\n{}",
                host, status, stderr_str.trim()
            ));
        }
        Ok(None) => {
            // Process still running — verify the drive is accessible
            let test = std::fs::read_dir(&drive_letter);
            match test {
                Ok(_) => {
                    tracing::info!(tab_id, host, drive = %drive_letter, "rclone 挂载成功");
                }
                Err(_) => {
                    // Drive not accessible, kill and clean up
                    let _ = child.kill();
                    let _ = fs::remove_file(&config_path);
                    tracing::warn!(tab_id, host, drive = %drive_letter, "rclone 盘符不可访问");
                    return Err(format!(
                        "[rclone] {} 挂载到 {} 但盘符不可访问，请检查密钥和网络",
                        host, drive_letter
                    ));
                }
            }
        }
        Err(e) => {
            let _ = fs::remove_file(&config_path);
            tracing::error!(tab_id, host, error = %e, "rclone 挂载进程异常");
            return Err(format!("[rclone] 进程异常: {}", e));
        }
    }

    mgr.remember_mount(&tab_id, drive_letter.clone(), pid, config_path)?;

    Ok(format!("{} -> {}", drive_letter, host))
    })();
    log_command!("rclone_mount", r)
}

#[tauri::command]
pub fn rclone_unmount(
    mgr: State<'_, SessionManager>,
    tab_id: String,
) -> Result<String, String> {
    tracing::info!(tab_id, "rclone 卸载");
    let r = (|| -> Result<String, String> {
    let mount = {
        let mut mounts = mgr.mounts.lock();
        mounts.remove(&tab_id)
            .ok_or_else(|| "该会话没有活跃的挂载".to_string())?
    };

    let drive = mount.drive_letter.clone();

    mgr.cleanup_mount(&mount);

    tracing::info!(tab_id, drive, "rclone 已卸载");
    Ok(format!("Unmounted {}", drive))
    })();
    log_command!("rclone_unmount", r)
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

// ── Cluster commands ─────────────────────────────────────────────

#[tauri::command]
pub fn list_clusters() -> Result<Vec<meatshell::config::Cluster>, String> {
    let store = ConfigStore::load().map_err(|e| e.to_string())?;
    Ok(store.clusters().to_vec())
}

#[tauri::command]
pub fn save_cluster(cluster: meatshell::config::Cluster) -> Result<(), String> {
    let mut store = ConfigStore::load().map_err(|e| e.to_string())?;
    store.upsert_cluster(cluster);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_cluster(id: String) -> Result<(), String> {
    let mut store = ConfigStore::load().map_err(|e| e.to_string())?;
    store.remove_cluster(&id);
    store.save().map_err(|e| e.to_string())
}

/// Send a command to all sessions in a cluster.
#[tauri::command]
pub fn cluster_batch_command(
    mgr: State<'_, SessionManager>,
    tab_ids: Vec<String>,
    command: String,
) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    for tab_id in &tab_ids {
        match mgr.send_input(tab_id, command.as_bytes().to_vec()) {
            Ok(_) => results.push(format!("{tab_id}: 已发送")),
            Err(e) => results.push(format!("{tab_id}: {e}")),
        }
    }
    Ok(results)
}

/// Get the current status of sessions in a cluster (connected/disconnected + latency).
#[tauri::command]
pub fn cluster_status(
    mgr: State<'_, SessionManager>,
    session_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let sessions = mgr.sessions.lock();
    let statuses: Vec<serde_json::Value> = session_ids.iter().map(|id| {
        let connected = sessions.contains_key(id);
        serde_json::json!({ "session_id": id, "connected": connected })
    }).collect();
    Ok(serde_json::json!({ "statuses": statuses }))
}

// ── Cluster file transfer ────────────────────────────────────────

/// Execute a command on a connected SSH session via exec channel and return stdout.
async fn exec_on_session(
    handle: &russh::client::Handle<ClientHandler>,
    command: &str,
    stdin_data: &str,
) -> Result<String, String> {
    use russh::ChannelMsg;
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("打开 channel 失败: {e}"))?;
    // Request a PTY so interactive scripts (like sb menu) work properly
    let _ = channel
        .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
        .await;
    // Use bash with .bashrc sourcing for aliases/functions like sb
    let escaped = command.replace('\'', "'\\''");
    let wrapped = format!("bash -c 'source ~/.bashrc 2>/dev/null; {}'", escaped);
    channel
        .exec(true, wrapped.as_bytes())
        .await
        .map_err(|e| format!("exec 失败: {e}"))?;

    // Send stdin data (for interactive commands like `sb` → send menu selection)
    if !stdin_data.is_empty() {
        let _ = channel.data(stdin_data.as_bytes()).await;
        let _ = channel.eof().await;
    }

    let mut output = String::new();
    let mut stderr_buf = String::new();
    use tokio::time::{timeout, Duration};
    loop {
        let timed = timeout(Duration::from_secs(5), channel.wait()).await;
        match timed {
            Ok(Some(ChannelMsg::Data { data })) => {
                let chunk = String::from_utf8_lossy(&data);
                output.push_str(&chunk);
            }
            Ok(Some(ChannelMsg::ExtendedData { data, ext: 1 })) => {
                stderr_buf.push_str(&String::from_utf8_lossy(&data));
            }
            Ok(Some(ChannelMsg::Close)) | Ok(None) => break,
            Ok(_) => {}
            Err(_) => {
                // Timeout: close the channel and return what we have
                let _ = channel.eof().await;
                let _ = channel.close().await;
                break;
            }
        }
    }
    // If stdout is empty, return stderr instead (some tools output to stderr)
    let result = if output.trim().is_empty() && !stderr_buf.trim().is_empty() {
        stderr_buf
    } else {
        output
    };
    let trimmed = result.trim();
    if !trimmed.is_empty() && trimmed.len() < 2000 {
        tracing::debug!(command = %command, output = %trimmed, "exec 命令输出");
    }
    Ok(result)
}

/// Execute a command on multiple connected sessions and return clean stdout.
#[tauri::command]
pub async fn cluster_exec(
    mgr: State<'_, SessionManager>,
    tab_ids: Vec<String>,
    command: String,
    stdin: Option<String>,
) -> Result<Vec<String>, String> {
    let stdin_data = stdin.unwrap_or_default();
    tracing::info!(tab_count = tab_ids.len(), command = %command, has_stdin = !stdin_data.is_empty(), "集群批量执行命令");
    
    // Collect handles first, drop the lock, then exec
    let handles: Vec<(String, Option<(String, Arc<russh::client::Handle<ClientHandler>>)>)> = {
        let sessions = mgr.sessions.lock();
        let configs = mgr.session_configs.lock();
        tab_ids.iter().map(|tid| {
            let host = configs.get(tid).map(|c| format!("{}@{}", c.user, c.host)).unwrap_or_default();
            let h = sessions.get(tid).and_then(|sh| {
                sh.ssh_handle.lock().ok().and_then(|guard| (*guard).clone())
            });
            let info = h.map(|handle| (host, handle));
            (tid.clone(), info)
        }).collect()
    };
    let mut results = Vec::new();
    for (tid, info) in handles {
        match info {
            Some((host, h)) => match exec_on_session(&h, &command, &stdin_data).await {
                Ok(out) => {
                    tracing::info!(tab_id = %tid, host = %host, output_len = out.len(), "集群命令执行成功");
                    results.push(out)
                }
                Err(e) => {
                    tracing::warn!(tab_id = %tid, host = %host, error = %e, "集群命令执行失败");
                    results.push(format!("[错误] {e}"))
                }
            },
            None => {
                tracing::warn!(tab_id = %tid, "集群命令跳过：会话未连接");
                results.push(format!("[{tid}] 会话未连接或 SSH handle 不可用"))
            }
        }
    }
    tracing::info!(ok = results.iter().filter(|r| !r.starts_with("[错误]")).count(), err = results.iter().filter(|r| r.starts_with("[错误]")).count(), "集群批量命令完成");
    Ok(results)
}

/// Upload a local file to multiple servers via SCP.
/// `targets` is a list of `(host, port, user, private_key_path, remote_path)`.
#[tauri::command]
pub fn cluster_upload(
    local_path: String,
    targets: Vec<(String, u16, String, String, String)>,
) -> Result<Vec<String>, String> {
    tracing::info!(local_path, target_count = targets.len(), "集群上传文件");
    let mut results = Vec::new();
    for (host, port, user, key_path, remote_path) in &targets {
        let mut cmd = std::process::Command::new("scp");
        cmd.arg("-P").arg(port.to_string())
            .arg("-o").arg("StrictHostKeyChecking=no")
            .arg("-o").arg("ConnectTimeout=10");
        if !key_path.is_empty() {
            cmd.arg("-i").arg(key_path);
        }
        cmd.arg(&local_path)
            .arg(format!("{}@{}:{}", user, host, remote_path));

        let output = cmd.output().map_err(|e| format!("scp 启动失败: {e}"))?;
        if output.status.success() {
            results.push(format!("{host}: ✓ 上传成功"));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            results.push(format!("{host}: ✗ {stderr}"));
        }
    }
    Ok(results)
}

/// Download a remote file from multiple servers via SCP.
/// `targets` is a list of `(host, port, user, private_key_path, remote_path, local_path)`.
#[tauri::command]
pub fn cluster_download(
    targets: Vec<(String, u16, String, String, String, String)>,
) -> Result<Vec<String>, String> {
    tracing::info!(target_count = targets.len(), "集群下载文件");
    let mut results = Vec::new();
    for (host, port, user, key_path, remote_path, local_path) in &targets {
        let mut cmd = std::process::Command::new("scp");
        cmd.arg("-P").arg(port.to_string())
            .arg("-o").arg("StrictHostKeyChecking=no")
            .arg("-o").arg("ConnectTimeout=10");
        if !key_path.is_empty() {
            cmd.arg("-i").arg(key_path);
        }
        cmd.arg(format!("{}@{}:{}", user, host, remote_path))
            .arg(&local_path);

        let output = cmd.output().map_err(|e| format!("scp 启动失败: {e}"))?;
        if output.status.success() {
            results.push(format!("{host}: ✓ 下载成功 → {local_path}"));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            results.push(format!("{host}: ✗ {stderr}"));
        }
    }
    Ok(results)
}

/// List files and directories in a local path.
#[tauri::command]
pub fn list_local_dir(path: String) -> Result<Vec<serde_json::Value>, String> {
    let entries = std::fs::read_dir(&path)
        .map_err(|e| format!("读取目录失败: {e}"))?;
    let mut items: Vec<serde_json::Value> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        if !name.starts_with('.') {
            items.push(serde_json::json!({
                "name": name,
                "is_dir": is_dir,
                "size": size,
            }));
        }
    }
    items.sort_by(|a, b| {
        let a_dir = a["is_dir"].as_bool().unwrap_or(false);
        let b_dir = b["is_dir"].as_bool().unwrap_or(false);
        if a_dir != b_dir { return if a_dir { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater }; }
        a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or(""))
    });
    Ok(items)
}

/// Open a URL in the default system browser.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    Ok(())
}

/// 获取本机 Windows 用户名和计算机名
#[tauri::command]
pub fn get_local_user_info() -> serde_json::Value {
    let username = std::env::var("USERNAME").unwrap_or_else(|_| "unknown".into());
    let computer = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into());
    serde_json::json!({
        "username": username,
        "computer": computer
    })
}

/// A single log entry.
#[derive(serde::Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

/// List available log files with metadata.
#[derive(serde::Serialize)]
pub struct LogFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: String,
}

/// Read the latest log file and return parsed entries, plus available log files.
#[tauri::command]
pub fn read_logs() -> Result<serde_json::Value, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "无法找到配置目录".to_string())?
        .join("OpenTermo")
        .join("logs");

    if !dir.exists() {
        return Ok(serde_json::json!({ "files": [], "entries": [] }));
    }

    // List log files sorted by modified time (newest first)
    let mut files: Vec<LogFileInfo> = Vec::new();
    let mut entries: Vec<LogEntry> = Vec::new();

    if let Ok(read_dir) = fs::read_dir(&dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("log") {
                let meta = entry.metadata().ok();
                files.push(LogFileInfo {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified: meta
                        .and_then(|m| m.modified().ok())
                        .map(|t| {
                            let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                            chrono::DateTime::from_timestamp(dur.as_secs() as i64, 0)
                                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                                .unwrap_or_default()
                        })
                        .unwrap_or_default(),
                });
            }
        }
    }

    // Sort newest first by name (which is YYYYMMDD-HHMMSS.log)
    files.sort_by(|a, b| b.name.cmp(&a.name));

    // Read the latest log file and parse entries
    if let Some(latest) = files.first() {
        if let Ok(content) = fs::read_to_string(&latest.path) {
            for line in content.lines().rev().take(500) {
                let line = line.trim();
                if line.is_empty() { continue; }
                // Parse tracing format: "2025-01-01T12:00:00.000+08:00  INFO target: message"
                let level = if line.contains(" ERROR ") { "ERROR" }
                    else if line.contains(" WARN ") { "WARN" }
                    else if line.contains(" INFO ") { "INFO" }
                    else if line.contains(" DEBUG ") { "DEBUG" }
                    else if line.contains(" TRACE ") { "TRACE" }
                    else { "INFO" };

                // Extract timestamp (before first space after the timezone)
                let timestamp = line.chars().take(28).collect::<String>().trim().to_string();

                entries.push(LogEntry {
                    timestamp,
                    level: level.to_string(),
                    target: String::new(),
                    message: line.to_string(),
                });
            }
            entries.reverse();
        }
    }

    Ok(serde_json::json!({ "files": files, "entries": entries }))
}

/// Ping a host via the system `ping` command (ICMP echo) and return the
/// round-trip time in milliseconds.  Returns `-1` if the host is unreachable
/// or the ping timed out.
#[tauri::command]
pub fn ping_host(host: String) -> Result<i64, String> {
    let output = std::process::Command::new("ping")
        .arg("-n")
        .arg("1")        // send 1 echo request
        .arg("-w")
        .arg("5000")     // 5s timeout
        .arg(&host)
        .output()
        .map_err(|e| format!("启动 ping 失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse: "时间=47ms" (Chinese) or "time=47ms" (English) or "time<1ms"
    // Also handles "time=47.5ms" (decimal)
    for line in stdout.lines() {
        // Try Chinese format: 时间=47ms
        if let Some(ms) = extract_ping_time(line, "时间=") {
            return Ok(ms);
        }
        // Try English format: time=47ms
        if let Some(ms) = extract_ping_time(line, "time=") {
            return Ok(ms);
        }
        // "time<1ms" or "时间<1ms"
        if line.contains("time<1ms") || line.contains("时间<1ms") {
            return Ok(1);
        }
    }

    // No valid reply found
    Ok(-1)
}

/// Extract the numeric milliseconds value from a ping reply line after `prefix`.
/// Handles "time=47ms", "time=47.5ms", "time=47ms "
fn extract_ping_time(line: &str, prefix: &str) -> Option<i64> {
    let after = line.split(prefix).nth(1)?;
    let num_str: String = after.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let ms: f64 = num_str.parse().ok()?;
    Some((ms * 1000.0) as i64) // return microseconds for consistency
}
