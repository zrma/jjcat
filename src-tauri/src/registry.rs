use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

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
}

impl RegistryStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Result<RegistryLoad, RegistryError> {
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
        registry.validate()?;
        let parent = self.path.parent().ok_or(RegistryError::MissingParent)?;
        fs::create_dir_all(parent)?;
        let temporary = temporary_path(&self.path);
        let encoded = serde_json::to_vec_pretty(registry)?;
        {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&encoded)?;
            file.write_all(b"\n")?;
            file.sync_all()?;
        }
        fs::rename(&temporary, &self.path)?;
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

fn temporary_path(path: &Path) -> PathBuf {
    path.with_extension("json.tmp")
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
struct RegistryV1 {
    selected_repository: Option<crate::domain::RepositoryId>,
    repositories: Vec<RepositoryRecord>,
    cached_projections: BTreeMap<crate::domain::RepositoryId, crate::domain::CachedProjection>,
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
