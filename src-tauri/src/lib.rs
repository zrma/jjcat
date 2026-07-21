mod commands;
pub mod domain;
pub mod driver;
mod process;
mod registry;
mod ssh_config;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(commands::AppState::new(app_data_dir.join("registry.json")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_registry,
            commands::list_ssh_hosts,
            commands::list_remote_directories,
            commands::register_repository,
            commands::select_repository,
            commands::remove_repository,
            commands::refresh_repository,
            commands::cancel_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jjcat");
}
