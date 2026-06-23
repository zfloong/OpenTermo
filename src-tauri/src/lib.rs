mod commands;
mod prompts;
mod session;

use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

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
    let _ = std::process::Command::new("taskkill").creation_flags(0x08000000)
        .args(["/F", "/IM", "rclone.exe"])
        .output();

    // Prevent re-entrant close (the cleanup thread calls window.close()
    // which re-fires CloseRequested; the flag breaks the cycle).
    let is_closing = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new(rclone_path))
        .manage(Mutex::new(SystemSampler::new()))
        .manage(Arc::new(PromptManager::new()))
        .setup(|app| {
            // Set window icon from the icon PNG so the taskbar shows the real icon.
            let icon_bytes = include_bytes!("../icons/icon.png");
            if let Ok(img) = image::load_from_memory(icon_bytes) {
                let rgba = img.into_rgba8();
                let (w, h) = rgba.dimensions();
                let tauri_icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(tauri_icon);
                }
            }
            // Delay showing the window so WebView2 internal init finishes first.
            // This prevents the multiple black-box flickering on startup.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.show();
                }
            });
            Ok(())
        })
        .on_window_event({
            let is_closing = is_closing.clone();
            move |window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if is_closing.swap(true, Ordering::SeqCst) {
                        // Second invocation: cleanup already done, let it close
                        return;
                    }
                    api.prevent_close();

                    // Clone handles before moving into the thread.
                    let window_for_state = window.clone();
                    let window_for_close = window.clone();
                    let app_handle = window.app_handle().clone();

                    std::thread::spawn(move || {
                        // Blocking cleanup (rclone unmount, SSH disconnect)
                        let mgr = window_for_state.state::<SessionManager>();
                        mgr.unmount_all();
                        let ids: Vec<String> =
                            mgr.sessions.lock().keys().cloned().collect();
                        for id in &ids {
                            let _ = mgr.disconnect(id);
                        }
                        // Close must happen on the main thread (WebView2 requirement)
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