mod commands;
mod session;

use std::sync::Mutex;

use meatshell::system::SystemSampler;
use session::SessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SessionManager::new())
        .manage(Mutex::new(SystemSampler::new()))
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::save_session,
            commands::delete_session,
            commands::connect_session,
            commands::send_input,
            commands::resize_terminal,
            commands::disconnect_session,
            commands::get_system_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
