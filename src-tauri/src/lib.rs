mod commands;
mod discovery;
pub mod domain;
pub mod driver;
mod handoff;
pub mod mutation;
mod process;
mod registry;
mod ssh_config;

use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::menu::{MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{Emitter, menu::Menu};

const CHECK_FOR_UPDATES_MENU_ID: &str = "check-for-updates";
const CHECK_FOR_UPDATES_EVENT: &str = "jjcat://check-for-updates";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .menu(app_menu)
        .on_menu_event(|app, event| {
            if event.id() == CHECK_FOR_UPDATES_MENU_ID {
                let _ = app.emit(CHECK_FOR_UPDATES_EVENT, ());
            }
        })
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(commands::AppState::new(app_data_dir.join("registry.json")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_registry,
            commands::list_ssh_hosts,
            commands::list_remote_directories,
            commands::load_change_details,
            commands::load_file_diff,
            commands::load_operation_log,
            commands::preview_mutation,
            commands::execute_mutation,
            commands::register_repository,
            commands::register_repository_source,
            commands::scan_repository_source,
            commands::open_discovered_repository,
            commands::initialize_repository,
            commands::initialize_discovered_repository,
            commands::remove_repository_source,
            commands::select_repository,
            commands::update_open_repositories,
            commands::set_repository_pinned,
            commands::remove_repository,
            commands::preview_repository_handoff,
            commands::launch_repository_handoff,
            commands::refresh_repository,
            commands::cancel_refresh,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run jjcat");
}

fn app_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    #[cfg(target_os = "macos")]
    if let Some(MenuItemKind::Submenu(app_submenu)) = menu.items()?.first() {
        let check_for_updates = MenuItem::with_id(
            app,
            CHECK_FOR_UPDATES_MENU_ID,
            "Check for Updates…",
            true,
            None::<&str>,
        )?;
        let separator = PredefinedMenuItem::separator(app)?;
        app_submenu.insert_items(&[&check_for_updates, &separator], 1)?;
    }
    Ok(menu)
}
