mod commands;
mod prompts;
mod session;

use std::sync::{Arc, Mutex};

use meatshell::system::SystemSampler;
use prompts::PromptManager;
use session::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SessionManager::new())
        .manage(Mutex::new(SystemSampler::new()))
        .manage(Arc::new(PromptManager::new()))
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session,
            commands::list_commands,
            commands::save_command,
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
            commands::reveal_in_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
