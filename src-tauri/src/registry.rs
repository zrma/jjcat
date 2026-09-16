use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Deserialize;

use crate::domain::{
    DomainError, REGISTRY_SCHEMA_VERSION, Registry, RepositoryLocation, RepositoryRecord,
};

#[derive(Debug)]
pub struct RegistryLoad {
    pub registry: Registry,
    pub recovered_corrupt_state: bool,
}

#[derive(Debug)]
pub struct RegistryStore {
    path: PathBuf,
    ownership: Mutex<Option<fs::File>>,
}

impl RegistryStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            ownership: Mutex::new(None),
        }
    }

    // 별도 lock 파일을 삭제하지 않는다. rename되는 registry inode를 잠그면 소유권이 분리된다.
    pub(crate) fn ensure_ownership(&self) -> Result<(), RegistryError> {
        let mut ownership = self
            .ownership
            .lock()
            .map_err(|_| RegistryError::LockPoisoned)?;
        if ownership.is_some() {
            return Ok(());
        }
        let parent = self.path.parent().ok_or(RegistryError::MissingParent)?;
        fs::create_dir_all(parent)?;
        let file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.path.with_extension("json.lock"))?;
        fs2::FileExt::try_lock_exclusive(&file).map_err(|error| {
            if error.kind() == std::io::ErrorKind::WouldBlock {
                RegistryError::AlreadyInUse
            } else {
                RegistryError::Io(error)
            }
        })?;
        *ownership = Some(file);
        Ok(())
    }

    pub fn load(&self) -> Result<RegistryLoad, RegistryError> {
        self.ensure_ownership()?;
        let source = match fs::read_to_string(&self.path) {
            Ok(source) => source,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(RegistryLoad {
                    registry: Registry::default(),
                    recovered_corrupt_state: false,
                });
            }
            Err(error) => return Err(RegistryError::Io(error)),
        };

        match parse_registry(&source) {
            Ok(registry) => Ok(RegistryLoad {
                registry,
                recovered_corrupt_state: false,
            }),
            Err(RegistryError::UnsupportedSchema(version)) => {
                Err(RegistryError::UnsupportedSchema(version))
            }
            Err(_) => {
                self.preserve_corrupt_state()?;
                Ok(RegistryLoad {
                    registry: Registry::default(),
                    recovered_corrupt_state: true,
                })
            }
        }
    }

    pub fn save(&self, registry: &Registry) -> Result<(), RegistryError> {
        self.ensure_ownership()?;
        registry.validate()?;
        let parent = self.path.parent().ok_or(RegistryError::MissingParent)?;
        let encoded = serde_json::to_vec_pretty(registry)?;
        // 호출마다 같은 filesystem에 고유 임시 파일을 만들고 완성된 내용만 교체한다.
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        temporary.write_all(&encoded)?;
        temporary.write_all(b"\n")?;
        temporary.as_file().sync_all()?;
        temporary
            .persist(&self.path)
            .map_err(|error| RegistryError::Io(error.error))?;
        #[cfg(unix)]
        fs::File::open(parent)?.sync_all()?;
        Ok(())
    }

    fn preserve_corrupt_state(&self) -> Result<(), RegistryError> {
        let mut backup = self.path.with_extension("json.corrupt");
        let mut suffix = 1;
        while backup.exists() {
            backup = self.path.with_extension(format!("json.corrupt.{suffix}"));
            suffix += 1;
        }
        fs::rename(&self.path, backup)?;
        Ok(())
    }
}

fn parse_registry(source: &str) -> Result<Registry, RegistryError> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Envelope {
        schema_version: u32,
    }

    let envelope: Envelope = serde_json::from_str(source)?;
    let registry = match envelope.schema_version {
        REGISTRY_SCHEMA_VERSION => serde_json::from_str(source)?,
        3 => migrate_v3(serde_json::from_str(source)?)?,
        2 => migrate_v2(serde_json::from_str(source)?)?,
        1 => migrate_v1(serde_json::from_str(source)?)?,
        0 => migrate_v0(serde_json::from_str(source)?)?,
        version => return Err(RegistryError::UnsupportedSchema(version)),
    };
    registry.validate()?;
    Ok(registry)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryV0 {
    repositories: Vec<RepositoryV0>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryV0 {
    display_name: String,
    location: RepositoryLocation,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryV2 {
    selected_repository: Option<crate::domain::RepositoryId>,
    open_repository_ids: Vec<crate::domain::RepositoryId>,
    repositories: Vec<RepositoryRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryV3 {
    selected_repository: Option<crate::domain::RepositoryId>,
    open_repository_ids: Vec<crate::domain::RepositoryId>,
    repositories: Vec<RepositoryRecord>,
    cached_projections: BTreeMap<crate::domain::RepositoryId, crate::domain::CachedProjection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryV1 {
    selected_repository: Option<crate::domain::RepositoryId>,
    repositories: Vec<RepositoryRecord>,
    cached_projections: BTreeMap<crate::domain::RepositoryId, crate::domain::CachedProjection>,
}

fn migrate_v2(legacy: RegistryV2) -> Result<Registry, DomainError> {
    let registry = Registry {
        selected_repository: legacy.selected_repository,
        open_repository_ids: legacy.open_repository_ids,
        repositories: legacy.repositories,
        // Schema v2 stored display-formatted rename paths in projections. They are
        // not valid exact fileset selectors, so refresh them under the v3 contract.
        cached_projections: BTreeMap::new(),
        ..Registry::default()
    };
    registry.validate()?;
    Ok(registry)
}

fn migrate_v3(legacy: RegistryV3) -> Result<Registry, DomainError> {
    let registry = Registry {
        selected_repository: legacy.selected_repository,
        open_repository_ids: legacy.open_repository_ids,
        repositories: legacy.repositories,
        cached_projections: legacy.cached_projections,
        ..Registry::default()
    };
    registry.validate()?;
    Ok(registry)
}

fn migrate_v1(legacy: RegistryV1) -> Result<Registry, DomainError> {
    let open_repository_ids = legacy.selected_repository.iter().cloned().collect();
    let registry = Registry {
        selected_repository: legacy.selected_repository,
        open_repository_ids,
        repositories: legacy.repositories,
        cached_projections: legacy.cached_projections,
        ..Registry::default()
    };
    registry.validate()?;
    Ok(registry)
}

fn migrate_v0(legacy: RegistryV0) -> Result<Registry, DomainError> {
    let repositories = legacy
        .repositories
        .into_iter()
        .map(|repository| RepositoryRecord::new(repository.display_name, repository.location))
        .collect::<Result<Vec<_>, _>>()?;
    let selected_repository = repositories.first().map(|repository| repository.id.clone());
    let registry = Registry {
        open_repository_ids: selected_repository.iter().cloned().collect(),
        selected_repository,
        repositories,
        ..Registry::default()
    };
    registry.validate()?;
    Ok(registry)
}

#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("repository registry is already in use by another jjcat instance")]
    AlreadyInUse,
    #[error("registry ownership lock is poisoned")]
    LockPoisoned,
    #[error("registry path has no parent directory")]
    MissingParent,
    #[error("registry schema {0} is newer than this version of jjcat")]
    UnsupportedSchema(u32),
    #[error(transparent)]
    Domain(#[from] DomainError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::RepositoryId;
    use tempfile::tempdir;

    #[test]
    fn competing_store_cannot_read_recover_or_overwrite_until_owner_drops() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("registry.json");
        let owner = RegistryStore::new(path.clone());
        owner.save(&Registry::default()).unwrap();
        let before = fs::read(&path).unwrap();
        let contender = RegistryStore::new(path.clone());
        assert!(matches!(contender.load(), Err(RegistryError::AlreadyInUse)));
        assert!(matches!(
            contender.save(&Registry::default()),
            Err(RegistryError::AlreadyInUse)
        ));
        assert_eq!(fs::read(&path).unwrap(), before);
        fs::write(&path, "invalid JSON").unwrap();
        assert!(matches!(contender.load(), Err(RegistryError::AlreadyInUse)));
        assert_eq!(fs::read_to_string(&path).unwrap(), "invalid JSON");
        assert!(!path.with_extension("json.corrupt").exists());
        owner.save(&Registry::default()).unwrap();
        drop(owner);
        assert!(!contender.load().unwrap().recovered_corrupt_state);
        contender.save(&Registry::default()).unwrap();
    }

    #[test]
    fn atomic_save_replaces_longer_content_and_ignores_legacy_temporary_file() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("registry.json");
        let legacy = path.with_extension("json.tmp");
        fs::write(&legacy, "preserve legacy temporary").unwrap();
        let store = RegistryStore::new(path.clone());
        let mut registry = Registry::default();
        registry.repositories.push(
            RepositoryRecord::new(
                "fixture",
                RepositoryLocation::Local {
                    path: "/fixtures/repository".into(),
                },
            )
            .unwrap(),
        );
        store.save(&registry).unwrap();
        store.save(&Registry::default()).unwrap();
        assert_eq!(store.load().unwrap().registry, Registry::default());
        assert_eq!(
            fs::read_to_string(legacy).unwrap(),
            "preserve legacy temporary"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 3);
    }

    // 별도 process를 강제 종료해도 OS가 소유권을 해제하는지 확인한다.
    #[test]
    fn registry_owner_child() {
        let Some(directory) = std::env::var_os("JJCAT_TEST_REGISTRY_OWNER") else {
            return;
        };
        let directory = PathBuf::from(directory);
        let store = RegistryStore::new(directory.join("registry.json"));
        store.save(&Registry::default()).unwrap();
        fs::write(directory.join("ready"), "ready").unwrap();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    #[test]
    fn process_exit_releases_registry_ownership_without_deleting_lock_file() {
        let directory = tempdir().unwrap();
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "registry::tests::registry_owner_child",
                "--nocapture",
            ])
            .env("JJCAT_TEST_REGISTRY_OWNER", directory.path())
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let ready = directory.path().join("ready");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !ready.exists() && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let store = RegistryStore::new(directory.path().join("registry.json"));
        let contested = store.load();
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(ready.exists(), "child failed to acquire ownership");
        assert!(matches!(contested, Err(RegistryError::AlreadyInUse)));
        assert!(!store.load().unwrap().recovered_corrupt_state);
        store.save(&Registry::default()).unwrap();
    }

    #[test]
    fn registry_round_trips() {
        let directory = tempdir().unwrap();
        let store = RegistryStore::new(directory.path().join("registry.json"));
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/fixtures/repository".into(),
            },
        )
        .unwrap();
        let second = RepositoryRecord::new(
            "second-fixture",
            RepositoryLocation::Local {
                path: "/fixtures/second-repository".into(),
            },
        )
        .unwrap();
        let registry = Registry {
            selected_repository: Some(second.id.clone()),
            open_repository_ids: vec![second.id.clone(), repository.id.clone()],
            repositories: vec![repository, second],
            ..Registry::default()
        };

        store.save(&registry).unwrap();
        let loaded = store.load().unwrap();

        assert_eq!(loaded.registry, registry);
        assert!(!loaded.recovered_corrupt_state);
    }

    #[test]
    fn version_zero_fixture_migrates_to_current_schema() {
        let migrated = parse_registry(include_str!("../tests/fixtures/registry-v0.json")).unwrap();

        assert_eq!(migrated.schema_version, REGISTRY_SCHEMA_VERSION);
        assert_eq!(migrated.repositories.len(), 2);
        assert_eq!(
            migrated.selected_repository,
            Some(migrated.repositories[0].id.clone())
        );
        assert_ne!(
            migrated.repositories[0].id,
            RepositoryId("legacy-index".into())
        );
        assert_eq!(
            migrated.open_repository_ids,
            vec![migrated.repositories[0].id.clone()]
        );
    }

    #[test]
    fn version_one_fixture_migrates_open_tab_and_selection() {
        let migrated = parse_registry(include_str!("../tests/fixtures/registry-v1.json")).unwrap();

        assert_eq!(migrated.schema_version, REGISTRY_SCHEMA_VERSION);
        assert_eq!(
            migrated.selected_repository,
            Some(migrated.repositories[1].id.clone())
        );
        assert_eq!(
            migrated.open_repository_ids,
            vec![migrated.repositories[1].id.clone()]
        );
        assert_eq!(migrated.repositories[1].last_opened_at, None);
    }

    #[test]
    fn version_two_fixture_preserves_shell_state_and_invalidates_projection_cache() {
        let migrated = parse_registry(include_str!("../tests/fixtures/registry-v2.json")).unwrap();

        assert_eq!(migrated.schema_version, REGISTRY_SCHEMA_VERSION);
        assert_eq!(migrated.repositories.len(), 1);
        assert_eq!(
            migrated.selected_repository,
            Some(migrated.repositories[0].id.clone())
        );
        assert_eq!(
            migrated.open_repository_ids,
            vec![migrated.repositories[0].id.clone()]
        );
        assert!(migrated.repositories[0].pinned);
        assert!(migrated.cached_projections.is_empty());
    }

    #[test]
    fn version_three_fixture_adds_empty_repository_source_state() {
        let migrated = parse_registry(include_str!("../tests/fixtures/registry-v3.json")).unwrap();

        assert_eq!(migrated.schema_version, REGISTRY_SCHEMA_VERSION);
        assert_eq!(migrated.repositories.len(), 1);
        assert_eq!(migrated.cached_projections.len(), 1);
        assert!(migrated.repository_sources.is_empty());
        assert!(migrated.source_catalogs.is_empty());
    }

    #[test]
    fn corrupt_state_is_preserved_and_recovered() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("registry.json");
        fs::write(&path, "{not-json").unwrap();
        let store = RegistryStore::new(path.clone());

        let loaded = store.load().unwrap();

        assert_eq!(loaded.registry, Registry::default());
        assert!(loaded.recovered_corrupt_state);
        assert!(path.with_extension("json.corrupt").exists());
        assert!(!path.exists());
    }

    #[test]
    fn future_schema_is_not_rewritten_as_corruption() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("registry.json");
        fs::write(&path, r#"{"schemaVersion":99}"#).unwrap();
        let store = RegistryStore::new(path.clone());

        assert!(matches!(
            store.load(),
            Err(RegistryError::UnsupportedSchema(99))
        ));
        assert!(path.exists());
        assert!(!path.with_extension("json.corrupt").exists());
    }
}
