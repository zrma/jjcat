use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::domain::{
    CachedProjection, Registry, RepositoryId, RepositoryLocation, RepositoryRecord,
};
use crate::driver::{DriverError, JjDriver};
use crate::registry::{RegistryError, RegistryStore};

pub struct AppState {
    store: Mutex<RegistryStore>,
    driver: JjDriver,
    active_refreshes: Mutex<HashMap<String, CancellationToken>>,
}

impl AppState {
    pub fn new(registry_path: PathBuf) -> Self {
        Self {
            store: Mutex::new(RegistryStore::new(registry_path)),
            driver: JjDriver::default(),
            active_refreshes: Mutex::new(HashMap::new()),
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
}

#[tauri::command]
pub async fn load_registry(state: State<'_, AppState>) -> Result<RegistrySnapshot, AppError> {
    let store = state.store.lock().await;
    snapshot_from_load(store.load().map_err(storage_error)?)
}

#[tauri::command]
pub async fn register_repository(
    draft: RepositoryDraft,
    state: State<'_, AppState>,
) -> Result<RegistrySnapshot, AppError> {
    let repository =
        RepositoryRecord::new(draft.display_name, draft.location).map_err(|error| AppError {
            kind: AppErrorKind::InvalidInput,
            message: error.to_string(),
        })?;
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    if let Some(existing) = registry
        .repositories
        .iter_mut()
        .find(|existing| existing.id == repository.id)
    {
        existing.display_name = repository.display_name;
    } else {
        registry.repositories.push(repository.clone());
    }
    registry.selected_repository = Some(repository.id);
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
) -> Result<(), AppError> {
    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    if !registry
        .repositories
        .iter()
        .any(|repository| repository.id == repository_id)
    {
        return Err(AppError {
            kind: AppErrorKind::NotFound,
            message: "repository is not registered".into(),
        });
    }
    registry.selected_repository = Some(repository_id);
    store.save(&registry).map_err(storage_error)
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

    let cancellation = CancellationToken::new();
    {
        let mut active = state.active_refreshes.lock().await;
        if active.contains_key(&request_id) {
            return Err(AppError {
                kind: AppErrorKind::Busy,
                message: "refresh request ID is already active".into(),
            });
        }
        active.insert(request_id.clone(), cancellation.clone());
    }

    let result = state.driver.project(&repository, cancellation).await;
    state.active_refreshes.lock().await.remove(&request_id);
    let projection = result.map_err(driver_error)?;
    let cached = CachedProjection {
        cached_at: projection.refreshed_at.clone(),
        projection,
    };

    let store = state.store.lock().await;
    let loaded = store.load().map_err(storage_error)?;
    let mut registry = loaded.registry;
    registry
        .cached_projections
        .insert(repository.id.clone(), cached.clone());
    registry.selected_repository = Some(repository.id);
    store.save(&registry).map_err(storage_error)?;
    Ok(cached)
}

#[tauri::command]
pub async fn cancel_refresh(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let active = state.active_refreshes.lock().await;
    let Some(cancellation) = active.get(&request_id) else {
        return Ok(false);
    };
    cancellation.cancel();
    Ok(true)
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

fn driver_error(error: DriverError) -> AppError {
    AppError {
        kind: AppErrorKind::Driver,
        message: error.message,
    }
}
