use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

const REPOSITORY_NAMESPACE: Uuid = Uuid::from_u128(0xa851f5bc_59be_4a98_a18a_9598116b7b9d);

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
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
                if path.trim() != path || !Path::new(path).is_absolute() {
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
}

fn is_safe_host(host: &str) -> bool {
    !host.is_empty()
        && !host.starts_with('-')
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

fn is_safe_remote_path(path: &str) -> bool {
    let has_supported_root = path.starts_with('/') || path.starts_with("~/");
    has_supported_root && path.len() > 2 && !path.chars().any(char::is_control)
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRecord {
    pub id: RepositoryId,
    pub display_name: String,
    pub location: RepositoryLocation,
    pub pinned: bool,
}

impl RepositoryRecord {
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

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRow {
    pub change_id: String,
    pub commit_id: String,
    pub summary: String,
    pub author: String,
    pub updated_at: String,
    pub bookmarks: Vec<String>,
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
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedProjection {
    pub cached_at: String,
    pub projection: RepositoryProjection,
}

pub const REGISTRY_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    pub schema_version: u32,
    pub selected_repository: Option<RepositoryId>,
    pub repositories: Vec<RepositoryRecord>,
    pub cached_projections: BTreeMap<RepositoryId, CachedProjection>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            schema_version: REGISTRY_SCHEMA_VERSION,
            selected_repository: None,
            repositories: Vec::new(),
            cached_projections: BTreeMap::new(),
        }
    }
}

impl Registry {
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
            .is_some_and(|selected| !unique.contains(selected))
        {
            return Err(DomainError::UnknownSelectedRepository);
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
    #[error("local repository paths must be absolute")]
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
}
