use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::domain::{OperationLogProjection, RepositoryId, RepositoryProjection, RepositoryRecord};

const MAX_DESCRIPTION_BYTES: usize = 64 * 1024;
const MAX_TARGETS: usize = 64;
const MAX_SPLIT_PATHS: usize = 256;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MutationIntent {
    New {
        parent_commit_ids: Vec<String>,
    },
    Edit {
        target_commit_id: String,
    },
    Describe {
        target_commit_id: String,
        message: String,
    },
    Fetch {
        remote: Option<String>,
    },
    Rebase {
        source_commit_id: String,
        destination_commit_id: String,
    },
    Squash {
        source_commit_id: String,
        destination_commit_id: String,
    },
    Split {
        source_commit_id: String,
        paths: Vec<String>,
        message: String,
    },
    Abandon {
        target_commit_ids: Vec<String>,
    },
    PruneEmpty,
    Undo {
        operation_id: String,
    },
    BookmarkMove {
        name: String,
        target_commit_id: String,
    },
    Push {
        name: String,
        remote: String,
    },
}

impl MutationIntent {
    pub fn validate(&self) -> Result<(), MutationValidationError> {
        match self {
            Self::New { parent_commit_ids } => validate_commit_ids(parent_commit_ids, false),
            Self::Edit { target_commit_id } => validate_commit_id(target_commit_id),
            Self::Describe {
                target_commit_id,
                message,
            } => {
                validate_commit_id(target_commit_id)?;
                validate_message(message)
            }
            Self::Fetch { remote } => {
                if let Some(remote) = remote {
                    validate_remote(remote)?;
                }
                Ok(())
            }
            Self::Rebase {
                source_commit_id,
                destination_commit_id,
            }
            | Self::Squash {
                source_commit_id,
                destination_commit_id,
            } => {
                validate_commit_id(source_commit_id)?;
                validate_commit_id(destination_commit_id)?;
                if source_commit_id == destination_commit_id {
                    return Err(MutationValidationError::SameSourceAndDestination);
                }
                Ok(())
            }
            Self::Split {
                source_commit_id,
                paths,
                message,
            } => {
                validate_commit_id(source_commit_id)?;
                validate_paths(paths)?;
                validate_message(message)
            }
            Self::Abandon { target_commit_ids } => validate_commit_ids(target_commit_ids, false),
            Self::PruneEmpty => Ok(()),
            Self::Undo { operation_id } => validate_operation_id(operation_id),
            Self::BookmarkMove {
                name,
                target_commit_id,
            } => {
                validate_bookmark(name)?;
                validate_commit_id(target_commit_id)
            }
            Self::Push { name, remote } => {
                validate_bookmark(name)?;
                validate_remote(remote)
            }
        }
    }

    pub fn kind(&self) -> MutationKind {
        match self {
            Self::New { .. } => MutationKind::New,
            Self::Edit { .. } => MutationKind::Edit,
            Self::Describe { .. } => MutationKind::Describe,
            Self::Fetch { .. } => MutationKind::Fetch,
            Self::Rebase { .. } => MutationKind::Rebase,
            Self::Squash { .. } => MutationKind::Squash,
            Self::Split { .. } => MutationKind::Split,
            Self::Abandon { .. } => MutationKind::Abandon,
            Self::PruneEmpty => MutationKind::PruneEmpty,
            Self::Undo { .. } => MutationKind::Undo,
            Self::BookmarkMove { .. } => MutationKind::BookmarkMove,
            Self::Push { .. } => MutationKind::Push,
        }
    }

    pub fn commit_ids(&self) -> Vec<&str> {
        match self {
            Self::New { parent_commit_ids } => {
                parent_commit_ids.iter().map(String::as_str).collect()
            }
            Self::Edit { target_commit_id }
            | Self::Describe {
                target_commit_id, ..
            }
            | Self::BookmarkMove {
                target_commit_id, ..
            } => vec![target_commit_id],
            Self::Rebase {
                source_commit_id,
                destination_commit_id,
            }
            | Self::Squash {
                source_commit_id,
                destination_commit_id,
            } => vec![source_commit_id, destination_commit_id],
            Self::Split {
                source_commit_id, ..
            } => vec![source_commit_id],
            Self::Abandon { target_commit_ids } => {
                target_commit_ids.iter().map(String::as_str).collect()
            }
            Self::Fetch { .. } | Self::PruneEmpty | Self::Undo { .. } | Self::Push { .. } => {
                Vec::new()
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MutationKind {
    New,
    Edit,
    Describe,
    Fetch,
    Rebase,
    Squash,
    Split,
    Abandon,
    PruneEmpty,
    Undo,
    BookmarkMove,
    Push,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MutationRisk {
    WorkingCopy,
    Network,
    Rewrite,
    Destructive,
    Recovery,
    RemoteWrite,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationCandidate {
    #[serde(alias = "change_id")]
    pub change_id: String,
    #[serde(alias = "commit_id")]
    pub commit_id: String,
    pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationTarget {
    pub label: String,
    pub value: String,
    pub commit_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationPreview {
    pub token: String,
    pub repository_id: RepositoryId,
    pub repository_display_name: String,
    pub kind: MutationKind,
    pub title: String,
    pub effect: String,
    pub risk: MutationRisk,
    pub expected_operation_id: String,
    pub targets: Vec<MutationTarget>,
    pub candidates: Vec<MutationCandidate>,
    pub requires_typed_confirmation: bool,
    pub confirmation_phrase: String,
}

impl MutationPreview {
    pub(crate) fn build(
        token: String,
        repository: &RepositoryRecord,
        intent: &MutationIntent,
        expected_operation_id: String,
        candidates: Vec<MutationCandidate>,
    ) -> Result<Self, MutationValidationError> {
        intent.validate()?;
        validate_operation_id(&expected_operation_id)?;
        if intent.kind() != MutationKind::PruneEmpty && !candidates.is_empty() {
            return Err(MutationValidationError::UnexpectedCandidates);
        }
        if intent.kind() == MutationKind::PruneEmpty {
            validate_candidates(&candidates)?;
        }

        let (title, effect, risk, targets) = preview_content(intent, &candidates);
        let (requires_typed_confirmation, confirmation_phrase) =
            confirmation(intent, candidates.len());
        Ok(Self {
            token,
            repository_id: repository.id.clone(),
            repository_display_name: repository.display_name.clone(),
            kind: intent.kind(),
            title,
            effect,
            risk,
            expected_operation_id,
            targets,
            candidates,
            requires_typed_confirmation,
            confirmation_phrase,
        })
    }

    pub fn matches_context(&self, operation_id: &str, candidates: &[MutationCandidate]) -> bool {
        self.expected_operation_id == operation_id && self.candidates == candidates
    }
}

pub fn verify_postcondition(
    intent: &MutationIntent,
    candidates: &[MutationCandidate],
    projection: &RepositoryProjection,
) -> Result<(), &'static str> {
    let changes = &projection.changes;
    let commit_exists =
        |commit_id: &str| changes.iter().any(|change| change.commit_id == commit_id);
    match intent {
        MutationIntent::New { parent_commit_ids } => changes
            .iter()
            .find(|change| change.working_copy)
            .filter(|change| {
                let mut actual = change.parent_commit_ids.clone();
                let mut expected = parent_commit_ids.clone();
                actual.sort();
                expected.sort();
                actual == expected
            })
            .map(|_| ())
            .ok_or("new working-copy parent does not match the preview"),
        MutationIntent::Edit { target_commit_id } => changes
            .iter()
            .find(|change| change.working_copy)
            .filter(|change| change.commit_id == *target_commit_id)
            .map(|_| ())
            .ok_or("working copy does not point to the previewed edit target"),
        MutationIntent::Describe { message, .. } => changes
            .iter()
            .any(|change| change.description.trim_end().eq(message.trim_end()))
            .then_some(())
            .ok_or("fresh projection does not contain the exact description"),
        MutationIntent::Rebase {
            source_commit_id, ..
        }
        | MutationIntent::Squash {
            source_commit_id, ..
        } => (!commit_exists(source_commit_id))
            .then_some(())
            .ok_or("source commit identity was not rewritten"),
        MutationIntent::Split { message, .. } => changes
            .iter()
            .any(|change| change.description.trim_end().eq(message.trim_end()))
            .then_some(())
            .ok_or("fresh projection does not contain the split change"),
        MutationIntent::Abandon { target_commit_ids } => target_commit_ids
            .iter()
            .all(|commit_id| !commit_exists(commit_id))
            .then_some(())
            .ok_or("an abandoned target remains in the fresh projection"),
        MutationIntent::PruneEmpty => candidates
            .iter()
            .all(|candidate| !commit_exists(&candidate.commit_id))
            .then_some(())
            .ok_or("a previewed empty-change candidate remains after pruning"),
        MutationIntent::BookmarkMove {
            name,
            target_commit_id,
        } => changes
            .iter()
            .find(|change| change.commit_id == *target_commit_id)
            .filter(|change| {
                change
                    .bookmarks
                    .iter()
                    .any(|bookmark| bookmark.name == *name && bookmark.remote.is_none())
            })
            .map(|_| ())
            .ok_or("local bookmark does not point to the previewed target"),
        MutationIntent::Push { name, remote } => changes
            .iter()
            .any(|change| {
                let local = change
                    .bookmarks
                    .iter()
                    .any(|bookmark| bookmark.name == *name && bookmark.remote.is_none());
                let remote = change.bookmarks.iter().any(|bookmark| {
                    bookmark.name == *name && bookmark.remote.as_deref() == Some(remote)
                });
                local && remote
            })
            .then_some(())
            .ok_or("local and remote bookmark targets are not aligned after push"),
        MutationIntent::Fetch { .. } | MutationIntent::Undo { .. } => Ok(()),
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationExecution {
    pub preview_token: String,
    pub repository_id: RepositoryId,
    pub kind: MutationKind,
    pub previous_operation_id: String,
    pub operation_id: String,
    pub message: String,
    pub recovery_required: bool,
    pub projection: RepositoryProjection,
    pub operation_log: OperationLogProjection,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteMutationRequest {
    pub token: String,
    pub confirmed: bool,
    #[serde(default)]
    pub confirmation: Option<String>,
}

fn preview_content(
    intent: &MutationIntent,
    candidates: &[MutationCandidate],
) -> (String, String, MutationRisk, Vec<MutationTarget>) {
    match intent {
        MutationIntent::New { parent_commit_ids } => (
            "Create change".into(),
            "Create a new working-copy change on the selected parent.".into(),
            MutationRisk::WorkingCopy,
            commit_targets("Parent", parent_commit_ids),
        ),
        MutationIntent::Edit { target_commit_id } => (
            "Edit change".into(),
            "Move the working copy to the selected change.".into(),
            MutationRisk::WorkingCopy,
            vec![commit_target("Edit target", target_commit_id)],
        ),
        MutationIntent::Describe {
            target_commit_id,
            message,
        } => (
            "Describe change".into(),
            format!(
                "Replace the full change description ({} bytes).",
                message.len()
            ),
            MutationRisk::WorkingCopy,
            vec![commit_target("Change", target_commit_id)],
        ),
        MutationIntent::Fetch { remote } => (
            "Fetch remote".into(),
            "Contact the selected Git remote and refresh locally stored remote bookmarks.".into(),
            MutationRisk::Network,
            vec![MutationTarget {
                label: "Remote".into(),
                value: remote
                    .clone()
                    .unwrap_or_else(|| "Configured default".into()),
                commit_id: None,
            }],
        ),
        MutationIntent::Rebase {
            source_commit_id,
            destination_commit_id,
        } => (
            "Rebase change".into(),
            "Move the source change onto the destination while preserving its diff.".into(),
            MutationRisk::Rewrite,
            vec![
                commit_target("Source", source_commit_id),
                commit_target("Destination", destination_commit_id),
            ],
        ),
        MutationIntent::Squash {
            source_commit_id,
            destination_commit_id,
        } => (
            "Squash change".into(),
            "Move the complete source diff into the destination and keep the destination message."
                .into(),
            MutationRisk::Rewrite,
            vec![
                commit_target("Source", source_commit_id),
                commit_target("Destination", destination_commit_id),
            ],
        ),
        MutationIntent::Split {
            source_commit_id,
            paths,
            ..
        } => (
            "Split change".into(),
            format!(
                "Move {} selected file path{} into the first split change.",
                paths.len(),
                if paths.len() == 1 { "" } else { "s" }
            ),
            MutationRisk::Rewrite,
            std::iter::once(commit_target("Source", source_commit_id))
                .chain(paths.iter().map(|path| MutationTarget {
                    label: "Selected path".into(),
                    value: path.clone(),
                    commit_id: None,
                }))
                .collect(),
        ),
        MutationIntent::Abandon { target_commit_ids } => (
            "Abandon changes".into(),
            format!(
                "Remove {} exact change{} and rebase descendants onto their parents.",
                target_commit_ids.len(),
                if target_commit_ids.len() == 1 {
                    ""
                } else {
                    "s"
                }
            ),
            MutationRisk::Destructive,
            commit_targets("Abandon target", target_commit_ids),
        ),
        MutationIntent::PruneEmpty => (
            "Prune empty changes".into(),
            format!(
                "Abandon {} unreferenced empty change{}; the working copy and bookmarked changes stay protected.",
                candidates.len(),
                if candidates.len() == 1 { "" } else { "s" }
            ),
            MutationRisk::Destructive,
            candidates
                .iter()
                .map(|candidate| MutationTarget {
                    label: "Empty change".into(),
                    value: if candidate.summary.is_empty() {
                        candidate.change_id.clone()
                    } else {
                        format!("{} · {}", candidate.change_id, candidate.summary)
                    },
                    commit_id: Some(candidate.commit_id.clone()),
                })
                .collect(),
        ),
        MutationIntent::Undo { operation_id } => (
            "Undo operation".into(),
            "Restore the repository state before the current operation.".into(),
            MutationRisk::Recovery,
            vec![MutationTarget {
                label: "Current operation".into(),
                value: operation_id.clone(),
                commit_id: None,
            }],
        ),
        MutationIntent::BookmarkMove {
            name,
            target_commit_id,
        } => (
            "Move bookmark".into(),
            "Move the local bookmark to the exact selected change.".into(),
            MutationRisk::Rewrite,
            vec![
                MutationTarget {
                    label: "Bookmark".into(),
                    value: name.clone(),
                    commit_id: None,
                },
                commit_target("Destination", target_commit_id),
            ],
        ),
        MutationIntent::Push { name, remote } => (
            "Push bookmark".into(),
            "Update the selected remote bookmark using Jujutsu lease and safety checks.".into(),
            MutationRisk::RemoteWrite,
            vec![
                MutationTarget {
                    label: "Bookmark".into(),
                    value: name.clone(),
                    commit_id: None,
                },
                MutationTarget {
                    label: "Remote".into(),
                    value: remote.clone(),
                    commit_id: None,
                },
            ],
        ),
    }
}

fn confirmation(intent: &MutationIntent, candidate_count: usize) -> (bool, String) {
    match intent {
        MutationIntent::Abandon { target_commit_ids } => {
            (true, format!("Abandon {} changes", target_commit_ids.len()))
        }
        MutationIntent::PruneEmpty => (true, format!("Prune {candidate_count} empty changes")),
        MutationIntent::Undo { .. } => (true, "Undo current operation".into()),
        MutationIntent::Push { name, .. } => (true, format!("Push {name}")),
        _ => (false, "Confirm".into()),
    }
}

fn commit_target(label: &str, commit_id: &str) -> MutationTarget {
    MutationTarget {
        label: label.into(),
        value: commit_id.into(),
        commit_id: Some(commit_id.into()),
    }
}

fn commit_targets(label: &str, commit_ids: &[String]) -> Vec<MutationTarget> {
    commit_ids
        .iter()
        .map(|commit_id| commit_target(label, commit_id))
        .collect()
}

fn validate_message(message: &str) -> Result<(), MutationValidationError> {
    if message.len() > MAX_DESCRIPTION_BYTES || message.contains('\0') {
        return Err(MutationValidationError::InvalidMessage);
    }
    Ok(())
}

fn validate_commit_ids(
    commit_ids: &[String],
    allow_empty: bool,
) -> Result<(), MutationValidationError> {
    if (!allow_empty && commit_ids.is_empty()) || commit_ids.len() > MAX_TARGETS {
        return Err(MutationValidationError::InvalidTargetCount);
    }
    let mut unique = BTreeSet::new();
    for commit_id in commit_ids {
        validate_commit_id(commit_id)?;
        if !unique.insert(commit_id) {
            return Err(MutationValidationError::DuplicateTarget);
        }
    }
    Ok(())
}

fn validate_commit_id(commit_id: &str) -> Result<(), MutationValidationError> {
    if !(16..=128).contains(&commit_id.len())
        || !commit_id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(MutationValidationError::InvalidCommitId);
    }
    Ok(())
}

fn validate_operation_id(operation_id: &str) -> Result<(), MutationValidationError> {
    if !(12..=128).contains(&operation_id.len())
        || !operation_id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(MutationValidationError::InvalidOperationId);
    }
    Ok(())
}

fn validate_paths(paths: &[String]) -> Result<(), MutationValidationError> {
    if paths.is_empty() || paths.len() > MAX_SPLIT_PATHS {
        return Err(MutationValidationError::InvalidPath);
    }
    let mut unique = BTreeSet::new();
    for path in paths {
        if path.len() > 4096
            || path.is_empty()
            || path.starts_with('/')
            || path.chars().any(char::is_control)
            || path
                .split('/')
                .any(|component| component.is_empty() || component == "." || component == "..")
            || !unique.insert(path)
        {
            return Err(MutationValidationError::InvalidPath);
        }
    }
    Ok(())
}

fn validate_bookmark(name: &str) -> Result<(), MutationValidationError> {
    if !valid_reference_component(name, true) {
        return Err(MutationValidationError::InvalidBookmark);
    }
    Ok(())
}

fn validate_remote(remote: &str) -> Result<(), MutationValidationError> {
    if !valid_reference_component(remote, false) {
        return Err(MutationValidationError::InvalidRemote);
    }
    Ok(())
}

fn valid_reference_component(value: &str, allow_slash: bool) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && !value.starts_with('-')
        && !value.starts_with('/')
        && !value.ends_with('/')
        && !value.contains("..")
        && !value.contains("//")
        && !value.contains("@{")
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || b"._-".contains(&byte) || (allow_slash && byte == b'/')
        })
}

fn validate_candidates(candidates: &[MutationCandidate]) -> Result<(), MutationValidationError> {
    if candidates.len() > MAX_TARGETS {
        return Err(MutationValidationError::InvalidTargetCount);
    }
    let mut commits = BTreeSet::new();
    for candidate in candidates {
        validate_commit_id(&candidate.commit_id)?;
        if candidate.change_id.is_empty()
            || candidate.change_id.len() > 128
            || !candidate
                .change_id
                .bytes()
                .all(|byte| byte.is_ascii_alphabetic())
            || !commits.insert(&candidate.commit_id)
        {
            return Err(MutationValidationError::InvalidCandidate);
        }
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum MutationValidationError {
    #[error("mutation contains an invalid commit ID")]
    InvalidCommitId,
    #[error("mutation contains an invalid operation ID")]
    InvalidOperationId,
    #[error("mutation target count is outside the supported range")]
    InvalidTargetCount,
    #[error("mutation contains duplicate targets")]
    DuplicateTarget,
    #[error("source and destination must be different changes")]
    SameSourceAndDestination,
    #[error("change description is too large or contains unsupported data")]
    InvalidMessage,
    #[error("split paths must be unique repository-relative paths")]
    InvalidPath,
    #[error("bookmark name is outside jjcat's safe reference subset")]
    InvalidBookmark,
    #[error("Git remote name is outside jjcat's safe reference subset")]
    InvalidRemote,
    #[error("empty-change candidate is invalid")]
    InvalidCandidate,
    #[error("mutation candidates are only valid for empty pruning")]
    UnexpectedCandidates,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::RepositoryLocation;

    const SOURCE: &str = "0123456789abcdef0123456789abcdef01234567";
    const DESTINATION: &str = "89abcdef0123456789abcdef0123456789abcdef";

    fn repository() -> RepositoryRecord {
        RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/fixtures/repository".into(),
            },
        )
        .unwrap()
    }

    #[test]
    fn validates_exact_targets_and_rejects_ambiguous_inputs() {
        MutationIntent::Rebase {
            source_commit_id: SOURCE.into(),
            destination_commit_id: DESTINATION.into(),
        }
        .validate()
        .unwrap();
        MutationIntent::Split {
            source_commit_id: SOURCE.into(),
            paths: vec!["src/main.rs".into(), "README.md".into()],
            message: "feat: split fixture".into(),
        }
        .validate()
        .unwrap();

        assert_eq!(
            MutationIntent::Rebase {
                source_commit_id: SOURCE.into(),
                destination_commit_id: SOURCE.into(),
            }
            .validate(),
            Err(MutationValidationError::SameSourceAndDestination)
        );
        assert_eq!(
            MutationIntent::Split {
                source_commit_id: SOURCE.into(),
                paths: vec!["../outside".into()],
                message: String::new(),
            }
            .validate(),
            Err(MutationValidationError::InvalidPath)
        );
        assert_eq!(
            MutationIntent::Push {
                name: "main*".into(),
                remote: "origin".into(),
            }
            .validate(),
            Err(MutationValidationError::InvalidBookmark)
        );
    }

    #[test]
    fn preview_never_contains_repository_location_or_command_text() {
        let preview = MutationPreview::build(
            "opaque-token".into(),
            &repository(),
            &MutationIntent::Rebase {
                source_commit_id: SOURCE.into(),
                destination_commit_id: DESTINATION.into(),
            },
            "abcdef0123456789".into(),
            Vec::new(),
        )
        .unwrap();
        let serialized = serde_json::to_string(&preview).unwrap();

        assert!(!serialized.contains("/fixtures/repository"));
        assert!(!serialized.contains("jj rebase"));
        assert_eq!(preview.risk, MutationRisk::Rewrite);
        assert!(!preview.requires_typed_confirmation);
    }

    #[test]
    fn empty_pruning_lists_candidates_and_requires_exact_confirmation() {
        let preview = MutationPreview::build(
            "opaque-token".into(),
            &repository(),
            &MutationIntent::PruneEmpty,
            "abcdef0123456789".into(),
            vec![MutationCandidate {
                change_id: "abcdefghijkl".into(),
                commit_id: SOURCE.into(),
                summary: "empty fixture".into(),
            }],
        )
        .unwrap();

        assert_eq!(preview.kind, MutationKind::PruneEmpty);
        assert_eq!(preview.targets[0].commit_id.as_deref(), Some(SOURCE));
        assert!(preview.requires_typed_confirmation);
        assert_eq!(preview.confirmation_phrase, "Prune 1 empty changes");
        assert!(preview.matches_context(
            "abcdef0123456789",
            &[MutationCandidate {
                change_id: "abcdefghijkl".into(),
                commit_id: SOURCE.into(),
                summary: "empty fixture".into(),
            }]
        ));
        assert!(!preview.matches_context("fedcba9876543210", &preview.candidates));
    }
}
