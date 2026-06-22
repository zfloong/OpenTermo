mod commands;
mod prompts;
mod session;

use std::sync::{Arc, Mutex};

use tauri::Manager;

use meatshell::system::SystemSampler;
use prompts::PromptManager;
use session::SessionManager;

/// Find rclone.exe on the system.
fn discover_rclone() -> String {
    // 1. Check PATH first
    if let Ok(path) = std::process::Command::new("where")
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
                // Recursively search for rclone.exe inside
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
    // Fallback
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let rclone_path = discover_rclone();
    // Kill any stale rclone processes from previous runs
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "rclone.exe"])
        .output();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new(rclone_path))
        .manage(Mutex::new(SystemSampler::new()))
        .manage(Arc::new(PromptManager::new()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Gracefully disconnect all active sessions and unmount rclone
                api.prevent_close();
                let mgr = window.state::<SessionManager>();
                mgr.unmount_all();
                let ids: Vec<String> = mgr.sessions.lock().keys().cloned().collect();
                for id in &ids {
                    let _ = mgr.disconnect(id);
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
                window.close().ok();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session,
            commands::reorder_sessions,
            commands::list_commands,
            commands::save_command,
            commands::reorder_commands,
            commands::delete_command,
            commands::connect_session,
            commands::send_input,
            commands::resize_terminal,
            commands::disconnect_session,
            commands::reply_host_key,
            commands::reply_credential,
            commands::get_system_stats,
            commands::write_text_file,
            commands::rclone_mount,
            commands::rclone_unmount,
            commands::rclone_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}