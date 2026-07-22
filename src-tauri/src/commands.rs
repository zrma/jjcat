use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::domain::{
    CachedProjection, Registry, RemoteDirectoryListing, RepositoryId, RepositoryLocation,
    RepositoryRecord,
};
use crate::driver::{DriverError, JjDriver};
use crate::handoff::{self, HandoffPreview, HandoffTarget};
use crate::registry::{RegistryError, RegistryStore};
use crate::ssh_config::explicit_host_aliases;

pub struct AppState {
    store: Mutex<RegistryStore>,
    driver: JjDriver,
    active_refreshes: Mutex<ActiveRefreshes>,
}

#[derive(Default)]
struct ActiveRefreshes {
    by_repository: HashMap<RepositoryId, ActiveRefresh>,
}

struct ActiveRefresh {
    request_id: String,
    cancellation: CancellationToken,
}

impl ActiveRefreshes {
    fn start(
        &mut self,
        repository_id: RepositoryId,
        request_id: String,
    ) -> Result<CancellationToken, ()> {
        if self.by_repository.contains_key(&repository_id)
            || self
                .by_repository
                .values()
                .any(|refresh| refresh.request_id == request_id)
        {
            return Err(());
        }
        let cancellation = CancellationToken::new();
        self.by_repository.insert(
            repository_id,
            ActiveRefresh {
                request_id,
                cancellation: cancellation.clone(),
            },
        );
        Ok(cancellation)
    }

    fn finish(&mut self, repository_id: &RepositoryId, request_id: &str) {
        if self
            .by_repository
            .get(repository_id)
            .is_some_and(|refresh| refresh.request_id == request_id)
        {
            self.by_repository.remove(repository_id);
        }
    }

    fn cancel(&self, request_id: &str) -> bool {
        let Some(refresh) = self
            .by_repository
            .values()
            .find(|refresh| refresh.request_id == request_id)
        else {
            return false;
        };
        refresh.cancellation.cancel();
        true
    }
}

impl AppState {
    pub fn new(registry_path: PathBuf) -> Self {
        Self {
            store: Mutex::new(RegistryStore::new(registry_path)),
            driver: JjDriver::default(),
            active_refreshes: Mutex::new(ActiveRefreshes::default()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySnapshot {
    registry: Registry,
    recovery_notice: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDraft {
    display_name: String,
    location: RepositoryLocation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    kind: AppErrorKind,
    message: String,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum AppErrorKind {
    InvalidInput,
    NotFound,
    Storage,
    Busy,
    Driver,
    Launch,
}

#[tauri::command]
pub async fn load_registry(state: State<'_, AppState>) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    snapshot_from_load(store.load().map_err(storage_error)?)
}

#[tauri::command]
pub async fn list_ssh_hosts(app: AppHandle) -> Result<Vec<String>, AppError> {
    let home_dir = app.path().home_dir().map_err(|_| AppError {
        kind: AppErrorKind::Storage,
        message: "home directory could not be resolved".into(),
    })?;
    explicit_host_aliases(&home_dir.join(".ssh/config"), &home_dir).map_err(|_| AppError {
        kind: AppErrorKind::Storage,
        message: "OpenSSH host aliases could not be read".into(),
    })
}

#[tauri::command]
pub async fn list_remote_directories(
    host: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<RemoteDirectoryListing, AppError> {
    state
        .driver
        .list_remote_directories(host, path, CancellationToken::new())
        .await
        .map_err(driver_error)
}

#[tauri::command]
pub async fn register_repository(
    draft: RepositoryDraft,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let home_dir = app.path().home_dir().map_err(|_| AppError {
        kind: AppErrorKind::Storage,
        message: "home directory could not be resolved".into(),
    })?;
    let repository =
        RepositoryRecord::from_user_input(draft.display_name, draft.location, &home_dir).map_err(
            |error| AppError {
                kind: AppErrorKind::InvalidInput,
                message: error.to_string(),
            },
        )?;
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    let repository_id = repository.id.clone();
    if let Some(existing) = registry
        .repositories
        .iter_mut()
        .find(|existing| existing.id == repository.id)
    {
        existing.display_name = repository.display_name;
    } else {
        registry.repositories.push(repository);
    }
    registry
        .open_repository(&repository_id, current_timestamp())
        .map_err(domain_error)?;
    store.save(&registry).map_err(storage_error)?;
    Ok(RegistrySnapshot {
        registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

#[tauri::command]
pub async fn select_repository(
    repository_id: RepositoryId,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    registry
        .open_repository(&repository_id, current_timestamp())
        .map_err(domain_error)?;
    store.save(&registry).map_err(storage_error)?;
    Ok(RegistrySnapshot {
        registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

#[tauri::command]
pub async fn update_open_repositories(
    open_repository_ids: Vec<RepositoryId>,
    selected_repository: Option<RepositoryId>,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    registry
        .set_open_repositories(open_repository_ids, selected_repository.clone())
        .map_err(domain_error)?;
    if let Some(repository_id) = selected_repository {
        registry
            .open_repository(&repository_id, current_timestamp())
            .map_err(domain_error)?;
    }
    store.save(&registry).map_err(storage_error)?;
    Ok(RegistrySnapshot {
        registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

#[tauri::command]
pub async fn set_repository_pinned(
    repository_id: RepositoryId,
    pinned: bool,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    registry
        .set_repository_pinned(&repository_id, pinned)
        .map_err(domain_error)?;
    store.save(&registry).map_err(storage_error)?;
    Ok(RegistrySnapshot {
        registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

#[tauri::command]
pub async fn remove_repository(
    repository_id: RepositoryId,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    if !registry.remove_repository(&repository_id) {
        return Err(AppError {
            kind: AppErrorKind::NotFound,
            message: "repository is not registered".into(),
        });
    }
    store.save(&registry).map_err(storage_error)?;
    Ok(RegistrySnapshot {
        registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

#[tauri::command]
pub async fn preview_repository_handoff(
    repository_id: RepositoryId,
    target: HandoffTarget,
    state: State<'_, AppState>,
) -> Result<HandoffPreview, AppError> {
    let repository = find_repository(&repository_id, &state).await?;
    Ok(handoff::preview(&repository, target))
}

#[tauri::command]
pub async fn launch_repository_handoff(
    repository_id: RepositoryId,
    target: HandoffTarget,
    state: State<'_, AppState>,
) -> Result<HandoffPreview, AppError> {
    let repository = find_repository(&repository_id, &state).await?;
    handoff::launch(&repository, target).map_err(|_| AppError {
        kind: AppErrorKind::Launch,
        message: "repository handoff application could not be launched".into(),
    })
}

async fn find_repository(
    repository_id: &RepositoryId,
    state: &State<'_, AppState>,
) -> Result<RepositoryRecord, AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    loaded
        .registry
        .repositories
        .into_iter()
        .find(|repository| &repository.id == repository_id)
        .ok_or_else(|| AppError {
            kind: AppErrorKind::NotFound,
            message: "repository is not registered".into(),
        })
}

#[tauri::command]
pub async fn refresh_repository(
    repository_id: RepositoryId,
    request_id: String,
    state: State<'_, AppState>,
) -> Result<CachedProjection, AppError> {
    if request_id.trim().is_empty() || request_id.len() > 80 {
        return Err(AppError {
            kind: AppErrorKind::InvalidInput,
            message: "refresh request ID is invalid".into(),
        });
    }
    let repository = {
        let store = state.store.lock().await;
        let loaded = store.load().map_err(storage_error)?;
        loaded
            .registry
            .repositories
            .into_iter()
            .find(|repository| repository.id == repository_id)
            .ok_or_else(|| AppError {
                kind: AppErrorKind::NotFound,
                message: "repository is not registered".into(),
            })?
    };

    let cancellation = {
        let mut active = state.active_refreshes.lock().await;
        active
            .start(repository.id.clone(), request_id.clone())
            .map_err(|_| AppError {
                kind: AppErrorKind::Busy,
                message: "repository refresh is already active".into(),
            })?
    };

    let result = state.driver.project(&repository, cancellation).await;
    state
        .active_refreshes
        .lock()
        .await
        .finish(&repository.id, &request_id);
    let projection = result.map_err(driver_error)?;
    let cached = CachedProjection {
        cached_at: projection.refreshed_at.clone(),
        projection,
    };

    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    if !registry
        .repositories
        .iter()
        .any(|registered| registered.id == repository.id)
    {
        return Err(AppError {
            kind: AppErrorKind::NotFound,
            message: "repository was removed while refresh was running".into(),
        });
    }
    registry
        .cached_projections
        .insert(repository.id.clone(), cached.clone());
    store.save(&registry).map_err(storage_error)?;
    Ok(cached)
}

#[tauri::command]
pub async fn cancel_refresh(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    Ok(state.active_refreshes.lock().await.cancel(&request_id))
}

fn snapshot_from_load(loaded: crate::registry::RegistryLoad) -> Result<RegistrySnapshot, AppError> {
    Ok(RegistrySnapshot {
        registry: loaded.registry,
        recovery_notice: recovery_notice(loaded.recovered_corrupt_state),
    })
}

fn recovery_notice(recovered: bool) -> Option<String> {
    recovered.then(|| {
        "Invalid registry data was preserved and jjcat started with an empty registry.".into()
    })
}

fn storage_error(error: RegistryError) -> AppError {
    let message = match error {
        RegistryError::UnsupportedSchema(version) => {
            format!("registry schema {version} requires a newer jjcat version")
        }
        _ => "repository registry could not be read or saved".into(),
    };
    AppError {
        kind: AppErrorKind::Storage,
        message,
    }
}

fn domain_error(error: crate::domain::DomainError) -> AppError {
    AppError {
        kind: AppErrorKind::InvalidInput,
        message: error.to_string(),
    }
}

fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .expect("RFC3339 formatting is infallible for the current timestamp")
}

fn driver_error(error: DriverError) -> AppError {
    AppError {
        kind: AppErrorKind::Driver,
        message: error.message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_refreshes_deduplicate_by_repository_and_request() {
        let first = RepositoryId("first".into());
        let second = RepositoryId("second".into());
        let mut active = ActiveRefreshes::default();

        let token = active.start(first.clone(), "request-one".into()).unwrap();
        assert!(active.start(first.clone(), "request-two".into()).is_err());
        assert!(active.start(second.clone(), "request-one".into()).is_err());
        assert!(active.start(second, "request-two".into()).is_ok());
        assert!(active.cancel("request-one"));
        assert!(token.is_cancelled());
        active.finish(&first, "stale-request");
        assert!(active.by_repository.contains_key(&first));
        active.finish(&first, "request-one");
        assert!(!active.by_repository.contains_key(&first));
    }
}
