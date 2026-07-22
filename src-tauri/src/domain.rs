use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const REPOSITORY_NAMESPACE: Uuid = Uuid::from_u128(0xa851f5bc_59be_4a98_a18a_9598116b7b9d);

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RepositoryId(pub String);

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RepositoryLocation {
    Local { path: String },
    Ssh { host: String, path: String },
}

impl RepositoryLocation {
    pub fn validate(&self) -> Result<(), DomainError> {
        match self {
            Self::Local { path } => {
                if path.trim() != path
                    || path.chars().any(char::is_control)
                    || !Path::new(path).is_absolute()
                {
                    return Err(DomainError::InvalidLocalPath);
                }
            }
            Self::Ssh { host, path } => {
                if !is_safe_host(host) {
                    return Err(DomainError::InvalidSshHost);
                }
                if !is_safe_remote_path(path) {
                    return Err(DomainError::InvalidRemotePath);
                }
            }
        }
        Ok(())
    }

    fn identity_seed(&self) -> String {
        match self {
            Self::Local { path } => format!("local\0{path}"),
            Self::Ssh { host, path } => format!("ssh\0{}\0{path}", host.to_ascii_lowercase()),
        }
    }

    fn into_normalized_user_input(self, home_dir: &Path) -> Result<Self, DomainError> {
        match self {
            Self::Local { path } => {
                if path.trim() != path || path.chars().any(char::is_control) {
                    return Err(DomainError::InvalidLocalPath);
                }
                let input = if let Some(suffix) = path.strip_prefix("~/") {
                    if suffix.is_empty() || !home_dir.is_absolute() {
                        return Err(DomainError::InvalidLocalPath);
                    }
                    home_dir.join(suffix)
                } else {
                    PathBuf::from(path)
                };
                if !input.is_absolute() {
                    return Err(DomainError::InvalidLocalPath);
                }
                let normalized = normalize_absolute_path(&input);
                Ok(Self::Local {
                    path: normalized.to_string_lossy().into_owned(),
                })
            }
            ssh @ Self::Ssh { .. } => Ok(ssh),
        }
    }
}

fn normalize_absolute_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }
    normalized
}

pub(crate) fn is_safe_host(host: &str) -> bool {
    !host.is_empty()
        && !host.starts_with('-')
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

fn is_safe_remote_path(path: &str) -> bool {
    let has_supported_root =
        path == "/" || path == "~/" || path.starts_with('/') || path.starts_with("~/");
    has_supported_root && !path.chars().any(char::is_control)
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRecord {
    pub id: RepositoryId,
    pub display_name: String,
    pub location: RepositoryLocation,
    pub pinned: bool,
    #[serde(default)]
    pub last_opened_at: Option<String>,
}

impl RepositoryRecord {
    pub fn from_user_input(
        display_name: impl Into<String>,
        location: RepositoryLocation,
        home_dir: &Path,
    ) -> Result<Self, DomainError> {
        Self::new(display_name, location.into_normalized_user_input(home_dir)?)
    }

    pub fn new(
        display_name: impl Into<String>,
        location: RepositoryLocation,
    ) -> Result<Self, DomainError> {
        location.validate()?;
        let display_name = display_name.into();
        let display_name = display_name.trim();
        if display_name.is_empty() || display_name.chars().count() > 80 {
            return Err(DomainError::InvalidDisplayName);
        }
        let id = RepositoryId(
            Uuid::new_v5(&REPOSITORY_NAMESPACE, location.identity_seed().as_bytes()).to_string(),
        );
        Ok(Self {
            id,
            display_name: display_name.to_owned(),
            location,
            pinned: false,
            last_opened_at: None,
        })
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        let rebuilt = Self::new(self.display_name.clone(), self.location.clone())?;
        if rebuilt.id != self.id {
            return Err(DomainError::RepositoryIdentityMismatch);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JjCapability {
    pub detected_version: String,
    pub minimum_version: String,
    pub supported: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub status: String,
    pub path: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WhitespaceMode {
    #[default]
    Preserve,
    IgnoreAll,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Context,
    Addition,
    Deletion,
    Metadata,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub content: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffProjection {
    pub repository_id: RepositoryId,
    pub change_id: String,
    pub commit_id: String,
    pub file: ChangedFile,
    pub whitespace_mode: WhitespaceMode,
    pub hunks: Vec<DiffHunk>,
    pub binary: bool,
    pub truncated: bool,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkRef {
    pub name: String,
    pub remote: Option<String>,
}

impl<'de> Deserialize<'de> for BookmarkRef {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BookmarkObject {
            name: String,
            #[serde(default)]
            remote: Option<String>,
        }

        #[derive(Deserialize)]
        #[serde(untagged)]
        enum BookmarkWire {
            Legacy(String),
            Object(BookmarkObject),
        }

        Ok(match BookmarkWire::deserialize(deserializer)? {
            BookmarkWire::Legacy(name) => Self { name, remote: None },
            BookmarkWire::Object(bookmark) => Self {
                name: bookmark.name,
                remote: bookmark.remote,
            },
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub directories: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRow {
    pub change_id: String,
    pub commit_id: String,
    pub summary: String,
    pub author: String,
    pub updated_at: String,
    pub bookmarks: Vec<BookmarkRef>,
    pub parents: Vec<String>,
    pub files: Vec<ChangedFile>,
    pub conflict: bool,
    pub working_copy: bool,
    pub empty: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryProjection {
    pub repository_id: RepositoryId,
    pub refreshed_at: String,
    pub capability: JjCapability,
    pub changes: Vec<ChangeRow>,
    pub conflicts: usize,
    pub working_copy_has_changes: bool,
    #[serde(default)]
    pub sync_status: SyncStatus,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub available: bool,
    pub remote_heads: usize,
    pub outgoing: usize,
    pub behind: usize,
    #[serde(default = "last_fetched_basis")]
    pub basis: String,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            available: false,
            remote_heads: 0,
            outgoing: 0,
            behind: 0,
            basis: last_fetched_basis(),
        }
    }
}

fn last_fetched_basis() -> String {
    "lastFetched".into()
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedProjection {
    pub cached_at: String,
    pub projection: RepositoryProjection,
}

pub const REGISTRY_SCHEMA_VERSION: u32 = 2;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub schema_version: u32,
    pub selected_repository: Option<RepositoryId>,
    pub open_repository_ids: Vec<RepositoryId>,
    pub repositories: Vec<RepositoryRecord>,
    pub cached_projections: BTreeMap<RepositoryId, CachedProjection>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            schema_version: REGISTRY_SCHEMA_VERSION,
            selected_repository: None,
            open_repository_ids: Vec::new(),
            repositories: Vec::new(),
            cached_projections: BTreeMap::new(),
        }
    }
}

impl Registry {
    pub fn open_repository(
        &mut self,
        repository_id: &RepositoryId,
        opened_at: String,
    ) -> Result<(), DomainError> {
        let repository = self
            .repositories
            .iter_mut()
            .find(|repository| &repository.id == repository_id)
            .ok_or(DomainError::UnknownOpenRepository)?;
        repository.last_opened_at = Some(opened_at);
        if !self.open_repository_ids.contains(repository_id) {
            self.open_repository_ids.push(repository_id.clone());
        }
        self.selected_repository = Some(repository_id.clone());
        Ok(())
    }

    pub fn set_open_repositories(
        &mut self,
        open_repository_ids: Vec<RepositoryId>,
        selected_repository: Option<RepositoryId>,
    ) -> Result<(), DomainError> {
        let previous_open = std::mem::replace(&mut self.open_repository_ids, open_repository_ids);
        let previous_selected =
            std::mem::replace(&mut self.selected_repository, selected_repository);
        if let Err(error) = self.validate() {
            self.open_repository_ids = previous_open;
            self.selected_repository = previous_selected;
            return Err(error);
        }
        Ok(())
    }

    pub fn set_repository_pinned(
        &mut self,
        repository_id: &RepositoryId,
        pinned: bool,
    ) -> Result<(), DomainError> {
        let repository = self
            .repositories
            .iter_mut()
            .find(|repository| &repository.id == repository_id)
            .ok_or(DomainError::UnknownOpenRepository)?;
        repository.pinned = pinned;
        Ok(())
    }

    pub fn remove_repository(&mut self, repository_id: &RepositoryId) -> bool {
        let Some(index) = self
            .repositories
            .iter()
            .position(|repository| &repository.id == repository_id)
        else {
            return false;
        };

        let open_index = self
            .open_repository_ids
            .iter()
            .position(|open_id| open_id == repository_id);
        self.repositories.remove(index);
        self.cached_projections.remove(repository_id);
        self.open_repository_ids
            .retain(|open_id| open_id != repository_id);
        if self.selected_repository.as_ref() == Some(repository_id) {
            self.selected_repository = open_index.and_then(|open_index| {
                self.open_repository_ids
                    .get(open_index)
                    .or_else(|| {
                        open_index
                            .checked_sub(1)
                            .and_then(|previous| self.open_repository_ids.get(previous))
                    })
                    .cloned()
            });
        }
        true
    }

    pub fn validate(&self) -> Result<(), DomainError> {
        if self.schema_version != REGISTRY_SCHEMA_VERSION {
            return Err(DomainError::UnsupportedRegistrySchema(self.schema_version));
        }
        for repository in &self.repositories {
            repository.validate()?;
        }
        let unique = self
            .repositories
            .iter()
            .map(|repository| &repository.id)
            .collect::<std::collections::BTreeSet<_>>();
        if unique.len() != self.repositories.len() {
            return Err(DomainError::DuplicateRepository);
        }
        if self
            .selected_repository
            .as_ref()
            .is_some_and(|selected| !self.open_repository_ids.contains(selected))
        {
            return Err(DomainError::UnknownSelectedRepository);
        }
        let unique_open = self
            .open_repository_ids
            .iter()
            .collect::<std::collections::BTreeSet<_>>();
        if unique_open.len() != self.open_repository_ids.len() {
            return Err(DomainError::DuplicateOpenRepository);
        }
        if unique_open
            .iter()
            .any(|repository_id| !unique.contains(repository_id))
        {
            return Err(DomainError::UnknownOpenRepository);
        }
        if self
            .cached_projections
            .keys()
            .any(|repository_id| !unique.contains(repository_id))
        {
            return Err(DomainError::UnknownCachedRepository);
        }
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("local repository paths must be absolute or start with ~/")]
    InvalidLocalPath,
    #[error("SSH host aliases may contain only letters, digits, dots, underscores, and hyphens")]
    InvalidSshHost,
    #[error("SSH paths must be absolute or home-relative and use portable path characters")]
    InvalidRemotePath,
    #[error("repository display names must contain between 1 and 80 characters")]
    InvalidDisplayName,
    #[error("repository identity does not match its location")]
    RepositoryIdentityMismatch,
    #[error("repository registry contains duplicate identities")]
    DuplicateRepository,
    #[error("selected repository is not registered")]
    UnknownSelectedRepository,
    #[error("open repository is not registered")]
    UnknownOpenRepository,
    #[error("open repository list contains duplicate identities")]
    DuplicateOpenRepository,
    #[error("cached projection belongs to an unregistered repository")]
    UnknownCachedRepository,
    #[error("registry schema {0} is newer than this version of jjcat")]
    UnsupportedRegistrySchema(u32),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_is_stable_for_the_same_local_location() {
        let first = RepositoryRecord::new(
            "one",
            RepositoryLocation::Local {
                path: "/work/repo".into(),
            },
        )
        .unwrap();
        let second = RepositoryRecord::new(
            "renamed",
            RepositoryLocation::Local {
                path: "/work/repo".into(),
            },
        )
        .unwrap();

        assert_eq!(first.id, second.id);
    }

    #[test]
    fn home_relative_local_input_normalizes_before_identity() {
        let relative = RepositoryRecord::from_user_input(
            "repo",
            RepositoryLocation::Local {
                path: "~/work/../src/repo".into(),
            },
            Path::new("/home/tester"),
        )
        .unwrap();
        let absolute = RepositoryRecord::new(
            "repo",
            RepositoryLocation::Local {
                path: "/home/tester/src/repo".into(),
            },
        )
        .unwrap();

        assert_eq!(relative, absolute);
    }

    #[test]
    fn local_input_rejects_process_relative_paths() {
        for path in ["relative/repo", "./repo", "~/repo\nnext"] {
            let result = RepositoryRecord::from_user_input(
                "repo",
                RepositoryLocation::Local { path: path.into() },
                Path::new("/home/tester"),
            );
            assert!(result.is_err(), "path should be rejected: {path}");
        }
    }

    #[test]
    fn transport_is_part_of_repository_identity() {
        let local = RepositoryRecord::new(
            "repo",
            RepositoryLocation::Local {
                path: "/srv/repo".into(),
            },
        )
        .unwrap();
        let ssh = RepositoryRecord::new(
            "repo",
            RepositoryLocation::Ssh {
                host: "dev-box".into(),
                path: "/srv/repo".into(),
            },
        )
        .unwrap();

        assert_ne!(local.id, ssh.id);
    }

    #[test]
    fn ssh_location_rejects_option_and_shell_injection() {
        for host in ["-oProxyCommand=bad", "dev box", "dev;bad"] {
            let result = RepositoryRecord::new(
                "repo",
                RepositoryLocation::Ssh {
                    host: host.into(),
                    path: "~/code/repo".into(),
                },
            );
            assert!(result.is_err(), "host should be rejected: {host}");
        }
        for path in ["relative/repo", "~/code/repo\nnext"] {
            let result = RepositoryRecord::new(
                "repo",
                RepositoryLocation::Ssh {
                    host: "dev-box".into(),
                    path: path.into(),
                },
            );
            assert!(result.is_err(), "path should be rejected: {path}");
        }
        RepositoryRecord::new(
            "repo",
            RepositoryLocation::Ssh {
                host: "dev-box".into(),
                path: "~/code/repository with spaces".into(),
            },
        )
        .expect("remote paths are encoded before crossing the SSH shell boundary");
    }

    #[test]
    fn removing_a_repository_only_updates_registry_owned_state() {
        let first = RepositoryRecord::new(
            "first",
            RepositoryLocation::Local {
                path: "/work/first".into(),
            },
        )
        .unwrap();
        let second = RepositoryRecord::new(
            "second",
            RepositoryLocation::Local {
                path: "/work/second".into(),
            },
        )
        .unwrap();
        let mut registry = Registry {
            selected_repository: Some(first.id.clone()),
            open_repository_ids: vec![first.id.clone(), second.id.clone()],
            repositories: vec![first.clone(), second.clone()],
            ..Registry::default()
        };

        assert!(registry.remove_repository(&first.id));
        assert_eq!(registry.repositories, vec![second.clone()]);
        assert_eq!(registry.selected_repository, Some(second.id));
        assert!(!registry.remove_repository(&first.id));
        registry.validate().unwrap();
    }

    #[test]
    fn open_repository_order_and_selection_are_validated_together() {
        let first = RepositoryRecord::new(
            "first",
            RepositoryLocation::Local {
                path: "/work/first".into(),
            },
        )
        .unwrap();
        let second = RepositoryRecord::new(
            "second",
            RepositoryLocation::Local {
                path: "/work/second".into(),
            },
        )
        .unwrap();
        let mut registry = Registry {
            repositories: vec![first.clone(), second.clone()],
            ..Registry::default()
        };

        registry
            .open_repository(&second.id, "2026-01-02T03:04:05Z".into())
            .unwrap();
        registry
            .open_repository(&first.id, "2026-01-02T03:05:05Z".into())
            .unwrap();
        assert_eq!(
            registry.open_repository_ids,
            vec![second.id.clone(), first.id.clone()]
        );
        assert_eq!(registry.selected_repository, Some(first.id.clone()));
        assert_eq!(
            registry.repositories[0].last_opened_at.as_deref(),
            Some("2026-01-02T03:05:05Z")
        );

        let result = registry.set_open_repositories(vec![second.id.clone()], Some(first.id));
        assert!(matches!(
            result,
            Err(DomainError::UnknownSelectedRepository)
        ));
        assert_eq!(
            registry.open_repository_ids,
            vec![second.id.clone(), registry.repositories[0].id.clone()]
        );
    }

    #[test]
    fn pinning_only_changes_registry_metadata() {
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/work/fixture".into(),
            },
        )
        .unwrap();
        let mut registry = Registry {
            repositories: vec![repository.clone()],
            ..Registry::default()
        };

        registry
            .set_repository_pinned(&repository.id, true)
            .unwrap();
        assert!(registry.repositories[0].pinned);
        registry.validate().unwrap();
    }

    #[test]
    fn legacy_bookmark_strings_remain_readable_from_projection_cache() {
        let bookmark: BookmarkRef = serde_json::from_str(r#""main""#).unwrap();

        assert_eq!(
            bookmark,
            BookmarkRef {
                name: "main".into(),
                remote: None,
            }
        );
    }
}
