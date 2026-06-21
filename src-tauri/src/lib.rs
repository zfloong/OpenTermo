mod commands;
mod prompts;
mod session;

use std::sync::{Arc, Mutex};

use tauri::Manager;

use meatshell::system::SystemSampler;
use prompts::PromptManager;
use session::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new())
        .manage(Mutex::new(SystemSampler::new()))
        .manage(Arc::new(PromptManager::new()))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Gracefully disconnect all active sessions before exit
                api.prevent_close();
                let mgr = window.state::<SessionManager>();
                let ids: Vec<String> = mgr.sessions.lock().keys().cloned().collect();
                for id in &ids {
                    let _ = mgr.disconnect(id);
                }
                // Brief pause so the tokio runtime can flush
                // SSH_MSG_DISCONNECT via channel.eof().
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
            commands::sftp_spawn,
            commands::sftp_list_dir,
            commands::sftp_download,
            commands::sftp_upload,
            commands::sftp_mkdir,
            commands::sftp_delete,
            commands::sftp_rename,
            commands::get_download_dir,
            commands::reveal_in_explorer,
            commands::open_in_editor,
            commands::port_forward_start,
            commands::port_forward_stop,
            commands::port_forward_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
