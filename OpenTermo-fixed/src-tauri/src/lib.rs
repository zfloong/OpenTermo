mod commands;
mod prompts;
mod session;

use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::Manager;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use meatshell::system::SystemSampler;
use prompts::PromptManager;
use session::SessionManager;

/// Find rclone.exe on the system.
fn discover_rclone() -> String {
    // 1. Check PATH first
    if let Ok(path) = std::process::Command::new("where").creation_flags(0x08000000)
        .arg("rclone")
        .output()
    {
        let stdout = String::from_utf8_lossy(&path.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let p = std::path::Path::new(trimmed);
                if p.exists() {
                    return p.to_string_lossy().to_string();
                }
            }
        }
    }
    // 2. Walk winget install directory
    let winget_base = format!(
        "{}\\Microsoft\\WinGet\\Packages",
        std::env::var("LOCALAPPDATA").unwrap_or_default()
    );
    if let Ok(entries) = std::fs::read_dir(&winget_base) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("Rclone.Rclone_") {
                if let Some(found) = find_exe_recursive(&entry.path(), "rclone.exe") {
                    return found;
                }
            }
        }
    }
    // 3. Common install paths
    for candidate in &[
        r"C:\Program Files\rclone\rclone.exe",
        r"C:\Program Files (x86)\rclone\rclone.exe",
        r"C:\rclone\rclone.exe",
    ] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "rclone.exe".to_string()
}

fn find_exe_recursive(dir: &std::path::Path, exe_name: &str) -> Option<String> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = find_exe_recursive(&path, exe_name) {
                    return Some(found);
                }
            } else if path.file_name()
                .map(|n| n.to_string_lossy().to_lowercase() == exe_name.to_lowercase())
                .unwrap_or(false)
            {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }
    None
}

static RCLONE_PATH: OnceLock<String> = OnceLock::new();

/// Returns the rclone executable path, discovering it on first call.
pub(crate) fn get_rclone_path() -> &'static str {
    RCLONE_PATH.get_or_init(|| discover_rclone())
}

/// Force-kills rclone mounts left over from a previous run. Only our own
/// mounts match — each is started with `--volname ms_<host>` — so the user's
/// unrelated rclone jobs are never touched.
fn kill_stale_rclone() {
    let script = "Get-CimInstance Win32_Process -Filter \"Name='rclone.exe'\" | Where-Object { $_.CommandLine -like '*--volname ms_*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    let _ = std::process::Command::new("powershell")
        .creation_flags(0x08000000)
        .args(["-NoProfile", "-Command", script])
        .output();
}

/// Removes config entries this app left in rclone.conf when a previous run
/// died before its cleanup. An entry is ours when its name carries the `ms_`
/// prefix and it holds the exact options `create_rclone_config` writes, so a
/// user's own remotes are never touched.
fn clean_stale_rclone_configs() {
    let rclone = get_rclone_path();
    let Ok(out) = std::process::Command::new(rclone)
        .creation_flags(0x08000000)
        .args(["config", "dump"])
        .output()
    else {
        return;
    };
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) else {
        return;
    };
    let Some(entries) = json.as_object() else {
        return;
    };
    for (name, cfg) in entries {
        let ours = name.starts_with("ms_")
            && cfg.get("type").and_then(|v| v.as_str()) == Some("sftp")
            && cfg.get("shell_type").and_then(|v| v.as_str()) == Some("unix")
            && cfg.get("set_modtime").and_then(|v| v.as_str()) == Some("false");
        if ours {
            let _ = std::process::Command::new(rclone)
                .creation_flags(0x08000000)
                .args(["config", "delete"])
                .arg(name)
                .output();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // First, so that the migration below and everything after it can report
    // through tracing (and land in error.log).
    meatshell::init_tracing();

    // Carry over data written by older versions, which lived in a separate
    // `meatshell` directory. Must happen before anything reads sessions,
    // commands, known_hosts or the encryption key.
    meatshell::config::migrate_legacy_data();

    // Prevent re-entrant close (the cleanup thread calls window.close()
    // which re-fires CloseRequested; the flag breaks the cycle).
    let is_closing = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        // Must be registered first: its setup hook runs before all others and
        // turns a second launch away (the newcomer just focuses this window),
        // so the startup sweep in our own setup below can only ever run on
        // the single live instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new())
        .manage(Mutex::new(SystemSampler::new()))
        .manage(Arc::new(PromptManager::new()))
        .setup(|app| {
            // Runs only on the primary instance: a second launch is turned
            // away inside the single-instance plugin's setup, before this
            // point. Also still ahead of the window being shown and of any
            // user input, so nothing this instance spawned can match yet —
            // every hit is a leftover from a previous run.
            kill_stale_rclone();
            clean_stale_rclone_configs();

            let icon_bytes = include_bytes!("../icons/icon.png");
            if let Ok(img) = image::load_from_memory(icon_bytes) {
                let rgba = img.into_rgba8();
                let (w, h) = rgba.dimensions();
                let tauri_icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(tauri_icon);
                }
            }
            // Show window after WebView is ready (eliminates white flash)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event({
            let is_closing = is_closing.clone();
            move |window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if is_closing.swap(true, Ordering::SeqCst) {
                        return;
                    }
                    api.prevent_close();
                    let window_for_state = window.clone();
                    let window_for_close = window.clone();
                    let app_handle = window.app_handle().clone();
                    std::thread::spawn(move || {
                        let mgr = window_for_state.state::<SessionManager>();
                        mgr.unmount_all();
                        let ids: Vec<String> =
                            mgr.sessions.lock().keys().cloned().collect();
                        for id in &ids {
                            let _ = mgr.disconnect(id);
                        }
                        let _ = app_handle.run_on_main_thread(move || {
                            let _ = window_for_close.destroy();
                        });
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session,
            commands::list_commands,
            commands::save_command,
            commands::save_commands,
            commands::delete_command,
            commands::connect_session,
            commands::send_input,
            commands::resize_terminal,
            commands::disconnect_session,
            commands::reply_host_key,
            commands::reply_credential,
            commands::get_system_stats,
            commands::rclone_mount,
            commands::rclone_unmount,
            commands::rclone_list,
            commands::write_text_file,
            commands::set_background_image,
            commands::get_background_image,
            commands::clear_background_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
