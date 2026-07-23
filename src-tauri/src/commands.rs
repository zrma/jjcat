use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::domain::{
    CachedProjection, FileDiffProjection, OperationLogProjection, Registry, RemoteDirectoryListing,
    RepositoryId, RepositoryLocation, RepositoryRecord, WhitespaceMode,
};
use crate::driver::{DriverError, DriverErrorKind, JjDriver};
use crate::handoff::{self, HandoffPreview, HandoffTarget};
use crate::mutation::{
    ExecuteMutationRequest, MutationExecution, MutationIntent, MutationPreview,
    MutationValidationError, verify_postcondition,
};
use crate::registry::{RegistryError, RegistryStore};
use crate::ssh_config::explicit_host_aliases;

pub struct AppState {
    store: Mutex<RegistryStore>,
    driver: JjDriver,
    active_refreshes: Mutex<ActiveRefreshes>,
    active_mutations: Mutex<ActiveMutations>,
    mutation_previews: Mutex<MutationPreviews>,
}

#[derive(Default)]
struct ActiveRefreshes {
    by_repository: HashMap<RepositoryId, ActiveRefresh>,
}

struct ActiveRefresh {
    request_id: String,
    cancellation: CancellationToken,
}

#[derive(Default)]
struct ActiveMutations {
    repositories: HashSet<RepositoryId>,
}

impl ActiveMutations {
    fn start(&mut self, repository_id: RepositoryId) -> Result<(), ()> {
        if !self.repositories.insert(repository_id) {
            return Err(());
        }
        Ok(())
    }

    fn finish(&mut self, repository_id: &RepositoryId) {
        self.repositories.remove(repository_id);
    }

    fn contains(&self, repository_id: &RepositoryId) -> bool {
        self.repositories.contains(repository_id)
    }
}

#[derive(Clone)]
struct StoredMutationPreview {
    preview: MutationPreview,
    intent: MutationIntent,
}

#[derive(Default)]
struct MutationPreviews {
    by_token: HashMap<String, StoredMutationPreview>,
    by_repository: HashMap<RepositoryId, String>,
}

impl MutationPreviews {
    fn insert(&mut self, stored: StoredMutationPreview) {
        if let Some(previous) = self.by_repository.insert(
            stored.preview.repository_id.clone(),
            stored.preview.token.clone(),
        ) {
            self.by_token.remove(&previous);
        }
        self.by_token.insert(stored.preview.token.clone(), stored);
    }

    fn repository_id(&self, token: &str) -> Option<RepositoryId> {
        self.by_token
            .get(token)
            .map(|stored| stored.preview.repository_id.clone())
    }

    fn take_confirmed(
        &mut self,
        request: &ExecuteMutationRequest,
    ) -> Result<StoredMutationPreview, AppError> {
        let stored = self.by_token.get(&request.token).ok_or_else(|| AppError {
            kind: AppErrorKind::Stale,
            message: "mutation preview is missing, expired, or already used".into(),
        })?;
        if !request.confirmed {
            return Err(AppError {
                kind: AppErrorKind::Confirmation,
                message: "mutation execution requires explicit confirmation".into(),
            });
        }
        if stored.preview.requires_typed_confirmation
            && request.confirmation.as_deref() != Some(stored.preview.confirmation_phrase.as_str())
        {
            return Err(AppError {
                kind: AppErrorKind::Confirmation,
                message: "typed confirmation does not match the mutation preview".into(),
            });
        }

        let stored = self
            .by_token
            .remove(&request.token)
            .expect("preview existence was checked");
        self.by_repository.remove(&stored.preview.repository_id);
        Ok(stored)
    }
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
            active_mutations: Mutex::new(ActiveMutations::default()),
            mutation_previews: Mutex::new(MutationPreviews::default()),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffRequest {
    repository_id: RepositoryId,
    change_id: String,
    commit_id: String,
    path: String,
    #[serde(default)]
    whitespace_mode: WhitespaceMode,
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
    Stale,
    Confirmation,
    Recovery,
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
pub async fn load_file_diff(
    request: FileDiffRequest,
    state: State<'_, AppState>,
) -> Result<FileDiffProjection, AppError> {
    let (repository, file) = {
        let store = state.store.lock().await;
        let loaded = store.load().map_err(storage_error)?;
        let repository = loaded
            .registry
            .repositories
            .iter()
            .find(|repository| repository.id == request.repository_id)
            .cloned()
            .ok_or_else(|| AppError {
                kind: AppErrorKind::NotFound,
                message: "repository is not registered".into(),
            })?;
        let projection = loaded
            .registry
            .cached_projections
            .get(&request.repository_id)
            .ok_or_else(|| AppError {
                kind: AppErrorKind::InvalidInput,
                message: "refresh the repository before loading a diff".into(),
            })?;
        let change = projection
            .projection
            .changes
            .iter()
            .find(|change| {
                change.change_id == request.change_id && change.commit_id == request.commit_id
            })
            .ok_or_else(|| AppError {
                kind: AppErrorKind::InvalidInput,
                message: "the selected revision is no longer in the cached projection".into(),
            })?;
        let file = change
            .files
            .iter()
            .find(|file| file.path == request.path)
            .cloned()
            .ok_or_else(|| AppError {
                kind: AppErrorKind::InvalidInput,
                message: "the selected file is not part of this revision".into(),
            })?;
        (repository, file)
    };

    state
        .driver
        .file_diff(
            &repository,
            request.change_id,
            request.commit_id,
            file,
            request.whitespace_mode,
            CancellationToken::new(),
        )
        .await
        .map_err(driver_error)
}

#[tauri::command]
pub async fn load_operation_log(
    repository_id: RepositoryId,
    state: State<'_, AppState>,
) -> Result<OperationLogProjection, AppError> {
    let repository = find_repository(&repository_id, &state).await?;
    state
        .driver
        .operation_log(&repository, CancellationToken::new())
        .await
        .map_err(driver_error)
}

#[tauri::command]
pub async fn preview_mutation(
    repository_id: RepositoryId,
    intent: MutationIntent,
    state: State<'_, AppState>,
) -> Result<MutationPreview, AppError> {
    intent.validate().map_err(mutation_validation_error)?;
    let repository = find_repository(&repository_id, &state).await?;
    let context = state
        .driver
        .mutation_context(&repository, &intent, CancellationToken::new())
        .await
        .map_err(driver_error)?;
    let preview = MutationPreview::build(
        uuid::Uuid::new_v4().to_string(),
        &repository,
        &intent,
        context.operation_id,
        context.candidates,
    )
    .map_err(mutation_validation_error)?;
    state
        .mutation_previews
        .lock()
        .await
        .insert(StoredMutationPreview {
            preview: preview.clone(),
            intent,
        });
    Ok(preview)
}

#[tauri::command]
pub async fn execute_mutation(
    request: ExecuteMutationRequest,
    state: State<'_, AppState>,
) -> Result<MutationExecution, AppError> {
    if request.token.trim() != request.token || request.token.len() > 80 {
        return Err(AppError {
            kind: AppErrorKind::InvalidInput,
            message: "mutation preview token is invalid".into(),
        });
    }
    let repository_id = state
        .mutation_previews
        .lock()
        .await
        .repository_id(&request.token)
        .ok_or_else(|| AppError {
            kind: AppErrorKind::Stale,
            message: "mutation preview is missing, expired, or already used".into(),
        })?;

    {
        let mut mutations = state.active_mutations.lock().await;
        let refreshes = state.active_refreshes.lock().await;
        if refreshes.by_repository.contains_key(&repository_id) {
            return Err(AppError {
                kind: AppErrorKind::Busy,
                message: "wait for the active repository refresh before changing history".into(),
            });
        }
        mutations
            .start(repository_id.clone())
            .map_err(|_| AppError {
                kind: AppErrorKind::Busy,
                message: "another repository mutation is already active".into(),
            })?;
    }

    let result = execute_mutation_inner(request, repository_id.clone(), &state).await;
    state.active_mutations.lock().await.finish(&repository_id);
    result
}

async fn execute_mutation_inner(
    request: ExecuteMutationRequest,
    repository_id: RepositoryId,
    state: &State<'_, AppState>,
) -> Result<MutationExecution, AppError> {
    let stored = state
        .mutation_previews
        .lock()
        .await
        .take_confirmed(&request)?;
    if stored.preview.repository_id != repository_id {
        return Err(AppError {
            kind: AppErrorKind::Stale,
            message: "mutation preview repository identity changed".into(),
        });
    }
    if matches!(stored.intent, MutationIntent::PruneEmpty) && stored.preview.candidates.is_empty() {
        return Err(AppError {
            kind: AppErrorKind::InvalidInput,
            message: "there are no unreferenced empty changes to prune".into(),
        });
    }
    let repository = find_repository(&repository_id, state).await?;
    let current = state
        .driver
        .mutation_context(&repository, &stored.intent, CancellationToken::new())
        .await
        .map_err(driver_error)?;
    if !stored
        .preview
        .matches_context(&current.operation_id, &current.candidates)
    {
        return Err(AppError {
            kind: AppErrorKind::Stale,
            message: "repository changed after preview; review the mutation again".into(),
        });
    }

    if let Err(error) = state
        .driver
        .execute_mutation(
            &repository,
            &stored.intent,
            &stored.preview.candidates,
            CancellationToken::new(),
        )
        .await
    {
        let operation_changed = state
            .driver
            .current_operation_id(&repository, CancellationToken::new())
            .await
            .is_ok_and(|operation_id| operation_id != current.operation_id);
        if operation_changed {
            return Err(AppError {
                kind: AppErrorKind::Recovery,
                message:
                    "the mutation failed after repository state changed; refresh and inspect Operations before continuing"
                        .into(),
            });
        }
        return Err(driver_error(error));
    }

    let operation_id = state
        .driver
        .current_operation_id(&repository, CancellationToken::new())
        .await
        .map_err(driver_error)?;
    let projection = state
        .driver
        .project(&repository, CancellationToken::new())
        .await
        .map_err(driver_error)?;
    let operation_log = state
        .driver
        .operation_log(&repository, CancellationToken::new())
        .await
        .map_err(driver_error)?;
    let cached = CachedProjection {
        cached_at: projection.refreshed_at.clone(),
        projection: projection.clone(),
    };
    {
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
                message: "repository was removed while mutation was running".into(),
            });
        }
        registry
            .cached_projections
            .insert(repository.id.clone(), cached);
        store.save(&registry).map_err(storage_error)?;
    }
    verify_postcondition(
        &stored.intent,
        &stored.preview.candidates,
        &projection,
    )
    .map_err(|detail| AppError {
        kind: AppErrorKind::Recovery,
        message: format!(
            "the mutation completed but its postcondition was not verified ({detail}); inspect Operations before continuing"
        ),
    })?;

    Ok(MutationExecution {
        preview_token: stored.preview.token,
        repository_id,
        kind: stored.preview.kind,
        previous_operation_id: current.operation_id,
        operation_id: operation_id.clone(),
        message: if operation_id == stored.preview.expected_operation_id {
            format!(
                "{} completed without a repository state change",
                stored.preview.title
            )
        } else {
            format!("{} completed", stored.preview.title)
        },
        recovery_required: false,
        projection,
        operation_log,
    })
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
        let mutations = state.active_mutations.lock().await;
        let mut active = state.active_refreshes.lock().await;
        if mutations.contains(&repository.id) {
            return Err(AppError {
                kind: AppErrorKind::Busy,
                message: "repository mutation is active".into(),
            });
        }
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
        kind: if error.kind == DriverErrorKind::StaleOperation {
            AppErrorKind::Stale
        } else {
            AppErrorKind::Driver
        },
        message: error.message,
    }
}

fn mutation_validation_error(error: MutationValidationError) -> AppError {
    AppError {
        kind: AppErrorKind::InvalidInput,
        message: error.to_string(),
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

    #[test]
    fn mutation_previews_are_latest_per_repository_and_single_use() {
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/fixtures/repository".into(),
            },
        )
        .unwrap();
        let intent = MutationIntent::Edit {
            target_commit_id: "0123456789abcdef0123456789abcdef01234567".into(),
        };
        let first = MutationPreview::build(
            "first-token".into(),
            &repository,
            &intent,
            "abcdef0123456789".into(),
            Vec::new(),
        )
        .unwrap();
        let second = MutationPreview::build(
            "second-token".into(),
            &repository,
            &intent,
            "abcdef0123456789".into(),
            Vec::new(),
        )
        .unwrap();
        let mut previews = MutationPreviews::default();
        previews.insert(StoredMutationPreview {
            preview: first,
            intent: intent.clone(),
        });
        previews.insert(StoredMutationPreview {
            preview: second,
            intent,
        });

        assert!(previews.repository_id("first-token").is_none());
        let request = ExecuteMutationRequest {
            token: "second-token".into(),
            confirmed: true,
            confirmation: None,
        };
        previews.take_confirmed(&request).unwrap();
        assert!(previews.take_confirmed(&request).is_err());
    }

    #[test]
    fn typed_confirmation_mismatch_keeps_preview_available() {
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/fixtures/repository".into(),
            },
        )
        .unwrap();
        let intent = MutationIntent::Push {
            name: "main".into(),
            remote: "origin".into(),
        };
        let preview = MutationPreview::build(
            "push-token".into(),
            &repository,
            &intent,
            "abcdef0123456789".into(),
            Vec::new(),
        )
        .unwrap();
        let mut previews = MutationPreviews::default();
        previews.insert(StoredMutationPreview { preview, intent });
        let request = ExecuteMutationRequest {
            token: "push-token".into(),
            confirmed: true,
            confirmation: Some("wrong".into()),
        };

        assert!(previews.take_confirmed(&request).is_err());
        assert!(previews.repository_id("push-token").is_some());
    }

    #[test]
    fn active_mutations_are_repository_scoped() {
        let first = RepositoryId("first".into());
        let second = RepositoryId("second".into());
        let mut active = ActiveMutations::default();

        active.start(first.clone()).unwrap();
        assert!(active.start(first.clone()).is_err());
        assert!(active.start(second.clone()).is_ok());
        active.finish(&first);
        assert!(!active.contains(&first));
        assert!(active.contains(&second));
    }
}
