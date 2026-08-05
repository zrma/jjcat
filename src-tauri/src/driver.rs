use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use regex::Regex;
use semver::Version;
use serde::Deserialize;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tokio_util::sync::CancellationToken;

use crate::domain::{
    BookmarkRef, ChangeRow, ChangedFile, DiffHunk, DiffLine, DiffLineKind, FileAnnotationLine,
    FileDiffProjection, FileHistoryEntry, FileTimelineProjection, JjCapability,
    OperationLogProjection, OperationRow, RemoteDirectoryListing, RepositoryLocation,
    RepositoryProjection, RepositoryRecord, RevisionFileProjection, RevisionTreeEntry,
    RevisionTreeProjection, SyncStatus, WhitespaceMode, WorkspaceRow,
};
use crate::mutation::{MutationCandidate, MutationIntent, MutationValidationError};
use crate::process::{
    CommandOutput, CommandPlan, DEFAULT_OUTPUT_LIMIT, ProcessError, ProcessFailureKind,
    run_command, run_command_with_limit, run_remote_command, run_remote_command_with_limit,
};

pub const MINIMUM_JJ_VERSION: &str = "0.30.0";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);
const DIFF_OUTPUT_LIMIT: usize = 512 * 1024;
const CHANGE_DETAILS_OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const REVISION_TREE_OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const REVISION_FILE_OUTPUT_LIMIT: usize = 512 * 1024;
const FILE_HISTORY_OUTPUT_LIMIT: usize = 1024 * 1024;
const FILE_ANNOTATION_OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
const HISTORY_CHANGE_LIMIT: &str = "200";
const FILE_HISTORY_LIMIT: &str = "200";
const NETWORK_REMOTE_HEADS: &str = r#"remote_bookmarks(remote=~exact:"git")"#;
const OUTGOING_REVISIONS: &str = r#"remote_bookmarks(remote=~exact:"git")..bookmarks()"#;
const BEHIND_REVISIONS: &str = r#"bookmarks()..remote_bookmarks(remote=~exact:"git")"#;
const OPERATION_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"id\\\":\" ++ stringify(id).escape_json() ++ ",
    "\",\\\"description\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"started_at\\\":\" ++ time.start().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"snapshot\\\":\" ++ if(snapshot, \"true\", \"false\") ++ \"}\\n\"",
);
const WORKSPACE_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"name\\\":\" ++ name.escape_json() ++ ",
    "\",\\\"current_hint\\\":\" ++ if(target.current_working_copy(), \"true\", \"false\") ++ ",
    "\",\\\"change_id\\\":\" ++ target.change_id().short(12).escape_json() ++ ",
    "\",\\\"commit_id\\\":\" ++ stringify(target.commit_id()).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ target.description().first_line().escape_json() ++ ",
    "\",\\\"updated_at\\\":\" ++ target.committer().timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"empty\\\":\" ++ if(target.empty(), \"true\", \"false\") ++ ",
    "\",\\\"conflict\\\":\" ++ if(target.conflict(), \"true\", \"false\") ++ ",
    "\",\\\"file_count\\\":\" ++ target.diff().files().len() ++ \"}\\n\"",
);
const PRUNE_CANDIDATE_REVSET: &str =
    "empty() & mutable() & ~working_copies() & ~root() & ~bookmarks() & ~remote_bookmarks()";
const PRUNE_CANDIDATE_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"change_id\\\":\" ++ change_id.short(12).escape_json() ++ ",
    "\",\\\"commit_id\\\":\" ++ stringify(commit_id).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ description.first_line().escape_json() ++ \"}\\n\"",
);
const LOG_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"change_id\\\":\" ++ change_id.short(12).escape_json() ++ ",
    "\",\\\"commit_id\\\":\" ++ stringify(commit_id).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"description\\\":\" ++ description.escape_json() ++ ",
    "\",\\\"author\\\":\" ++ author.name().escape_json() ++ ",
    "\",\\\"author_email\\\":\" ++ stringify(author.email()).escape_json() ++ ",
    "\",\\\"author_timestamp\\\":\" ++ author.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"committer\\\":\" ++ committer.name().escape_json() ++ ",
    "\",\\\"committer_email\\\":\" ++ stringify(committer.email()).escape_json() ++ ",
    "\",\\\"committer_timestamp\\\":\" ++ committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"updated_at\\\":\" ++ committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"local_bookmarks\\\":\" ++ json(self.local_bookmarks()) ++ ",
    "\",\\\"remote_bookmarks\\\":\" ++ json(self.remote_bookmarks()) ++ ",
    "\",\\\"parents\\\":\" ++ stringify(parents.map(|p| p.change_id().short(12)).join(\",\")).escape_json() ++ ",
    "\",\\\"parent_commit_ids\\\":\" ++ stringify(parents.map(|p| p.commit_id()).join(\",\")).escape_json() ++ ",
    "\",\\\"files\\\":\\\"\\\"\" ++ ",
    "\",\\\"conflict\\\":\" ++ if(conflict, \"true\", \"false\") ++ ",
    "\",\\\"working_copy\\\":\" ++ if(current_working_copy, \"true\", \"false\") ++ ",
    "\",\\\"workspace_copies\\\":\" ++ json(self.working_copies().map(|workspace| workspace.name())) ++ ",
    "\",\\\"empty\\\":\" ++ if(empty, \"true\", \"false\") ++ \"}\\n\"",
);
const CHANGE_DETAILS_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"change_id\\\":\" ++ change_id.short(12).escape_json() ++ ",
    "\",\\\"commit_id\\\":\" ++ stringify(commit_id).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"description\\\":\" ++ description.escape_json() ++ ",
    "\",\\\"author\\\":\" ++ author.name().escape_json() ++ ",
    "\",\\\"author_email\\\":\" ++ stringify(author.email()).escape_json() ++ ",
    "\",\\\"author_timestamp\\\":\" ++ author.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"committer\\\":\" ++ committer.name().escape_json() ++ ",
    "\",\\\"committer_email\\\":\" ++ stringify(committer.email()).escape_json() ++ ",
    "\",\\\"committer_timestamp\\\":\" ++ committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"updated_at\\\":\" ++ committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"local_bookmarks\\\":\" ++ json(self.local_bookmarks()) ++ ",
    "\",\\\"remote_bookmarks\\\":\" ++ json(self.remote_bookmarks()) ++ ",
    "\",\\\"parents\\\":\" ++ stringify(parents.map(|p| p.change_id().short(12)).join(\",\")).escape_json() ++ ",
    "\",\\\"parent_commit_ids\\\":\" ++ stringify(parents.map(|p| p.commit_id()).join(\",\")).escape_json() ++ ",
    "\",\\\"files\\\":\" ++ stringify(self.diff().files().map(|f| f.status_char() ++ \"\\t\" ++ f.path() ++ \"\\t\" ++ f.display_diff_path()).join(\"\\n\")).escape_json() ++ ",
    "\",\\\"conflict\\\":\" ++ if(conflict, \"true\", \"false\") ++ ",
    "\",\\\"working_copy\\\":\" ++ if(current_working_copy, \"true\", \"false\") ++ ",
    "\",\\\"workspace_copies\\\":\" ++ json(self.working_copies().map(|workspace| workspace.name())) ++ ",
    "\",\\\"empty\\\":\" ++ if(empty, \"true\", \"false\") ++ \"}\\n\"",
);
const REVISION_TREE_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"path\\\":\" ++ stringify(path).escape_json() ++ ",
    "\",\\\"fileType\\\":\" ++ file_type.escape_json() ++ ",
    "\",\\\"conflict\\\":\" ++ if(conflict, \"true\", \"false\") ++ ",
    "\",\\\"executable\\\":\" ++ if(executable, \"true\", \"false\") ++ ",
    "\",\\\"status\\\":null}\\n\"",
);
const FILE_HISTORY_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"changeId\\\":\" ++ change_id.short(12).escape_json() ++ ",
    "\",\\\"commitId\\\":\" ++ stringify(commit_id).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"author\\\":\" ++ author.name().escape_json() ++ ",
    "\",\\\"timestamp\\\":\" ++ author.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ \"}\\n\"",
);
const FILE_ANNOTATION_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"lineNumber\\\":\" ++ line_number ++ ",
    "\",\\\"originalLineNumber\\\":\" ++ original_line_number ++ ",
    "\",\\\"firstLineInHunk\\\":\" ++ if(first_line_in_hunk, \"true\", \"false\") ++ ",
    "\",\\\"changeId\\\":\" ++ commit.change_id().short(12).escape_json() ++ ",
    "\",\\\"commitId\\\":\" ++ stringify(commit.commit_id()).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ commit.description().first_line().escape_json() ++ ",
    "\",\\\"author\\\":\" ++ commit.author().name().escape_json() ++ ",
    "\",\\\"timestamp\\\":\" ++ commit.author().timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"content\\\":\" ++ stringify(content).escape_json() ++ \"}\\n\"",
);

#[derive(Clone, Debug)]
pub struct JjDriver {
    jj_program: PathBuf,
    ssh_program: PathBuf,
    timeout: Duration,
}

impl Default for JjDriver {
    fn default() -> Self {
        Self {
            jj_program: "jj".into(),
            ssh_program: "ssh".into(),
            timeout: DEFAULT_TIMEOUT,
        }
    }
}

impl JjDriver {
    pub fn with_programs(jj_program: PathBuf, ssh_program: PathBuf) -> Self {
        Self {
            jj_program,
            ssh_program,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub async fn project(
        &self,
        repository: &RepositoryRecord,
        cancellation: CancellationToken,
    ) -> Result<RepositoryProjection, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;

        let version_output = self
            .run_query(repository, JjQuery::Version, cancellation.child_token())
            .await?;
        let capability = parse_capability(&version_output.stdout)?;
        if !capability.supported {
            return Err(DriverError {
                kind: DriverErrorKind::UnsupportedJj,
                message: format!(
                    "jj {} is not supported; jjcat requires jj {MINIMUM_JJ_VERSION} or newer",
                    capability.detected_version
                ),
            });
        }

        let (
            log_output,
            working_copy_files,
            workspace_output,
            workspace_root,
            remote_heads,
            outgoing,
            behind,
        ) = tokio::try_join!(
            self.run_query(repository, JjQuery::Log, cancellation.child_token()),
            self.run_query(
                repository,
                JjQuery::WorkingCopyFileCount,
                cancellation.child_token()
            ),
            self.run_query(repository, JjQuery::Workspaces, cancellation.child_token()),
            self.run_query(
                repository,
                JjQuery::WorkspaceRoot,
                cancellation.child_token()
            ),
            self.run_query(
                repository,
                JjQuery::SyncMetric(SyncMetric::RemoteHeads),
                cancellation.child_token()
            ),
            self.run_query(
                repository,
                JjQuery::SyncMetric(SyncMetric::Outgoing),
                cancellation.child_token()
            ),
            self.run_query(
                repository,
                JjQuery::SyncMetric(SyncMetric::Behind),
                cancellation.child_token()
            ),
        )?;
        let changes = parse_log(&log_output.stdout)?;
        let conflicts = changes.iter().filter(|change| change.conflict).count();
        let working_copy_has_changes = changes
            .iter()
            .find(|change| change.working_copy)
            .is_some_and(|change| !change.empty);
        let working_copy_file_count = parse_count(&working_copy_files.stdout, "working copy file")?;
        let current_root =
            parse_single_text_line(&workspace_root.stdout, "current workspace root")?;
        let workspaces = self
            .hydrate_workspace_roots(
                repository,
                parse_workspaces(&workspace_output.stdout, &current_root)?,
                &current_root,
                cancellation.child_token(),
            )
            .await?;
        let sync_status =
            parse_sync_status(&remote_heads.stdout, &outgoing.stdout, &behind.stdout)?;

        Ok(RepositoryProjection {
            repository_id: repository.id.clone(),
            refreshed_at: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "unknown".into()),
            capability,
            changes,
            conflicts,
            working_copy_has_changes,
            working_copy_file_count,
            workspaces,
            sync_status,
        })
    }

    pub async fn list_remote_directories(
        &self,
        host: String,
        path: String,
        cancellation: CancellationToken,
    ) -> Result<RemoteDirectoryListing, DriverError> {
        let location = RepositoryLocation::Ssh { host, path };
        location.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        let RepositoryLocation::Ssh { host, path } = &location else {
            unreachable!();
        };
        let plan = CommandPlan {
            program: self.ssh_program.clone(),
            args: ssh_arguments(host),
            current_dir: None,
            stdin: Some(remote_directory_script(path).into_bytes()),
        };
        let repository = RepositoryRecord::new("remote folder browser", location.clone())
            .expect("validated remote browser location must form a repository identity");
        let output = run_remote_command(plan, self.timeout, cancellation)
            .await
            .map_err(|error| process_error(&repository, error))?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: "remote directory listing exceeded the safe capture limit".into(),
            });
        }
        if output.exit_code != Some(0) {
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: redact_error(raw.trim(), &location),
            });
        }
        parse_remote_directories(&output.stdout)
    }

    pub async fn file_diff(
        &self,
        repository: &RepositoryRecord,
        change_id: String,
        commit_id: String,
        file: ChangedFile,
        whitespace_mode: WhitespaceMode,
        cancellation: CancellationToken,
    ) -> Result<FileDiffProjection, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        if !valid_commit_id(&commit_id) || !valid_repository_path(&file.path) {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "diff revision or repository path is invalid".into(),
            });
        }
        let query = JjQuery::Diff {
            commit_id: commit_id.clone(),
            path: file.path.clone(),
            whitespace_mode,
        };
        let plan = self.command_plan(repository, query);
        let output = match repository.location {
            RepositoryLocation::Local { .. } => {
                run_command_with_limit(plan, self.timeout, cancellation, DIFF_OUTPUT_LIMIT).await
            }
            RepositoryLocation::Ssh { .. } => {
                run_remote_command_with_limit(plan, self.timeout, cancellation, DIFF_OUTPUT_LIMIT)
                    .await
            }
        }
        .map_err(|error| process_error(repository, error))?;
        if output.exit_code != Some(0) {
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: redact_error(raw.trim(), &repository.location),
            });
        }
        let parsed = parse_git_diff(&output.stdout, output.truncated)?;
        Ok(FileDiffProjection {
            repository_id: repository.id.clone(),
            change_id,
            commit_id,
            file,
            whitespace_mode,
            hunks: parsed.hunks,
            binary: parsed.binary,
            truncated: parsed.truncated,
            additions: parsed.additions,
            deletions: parsed.deletions,
        })
    }

    pub async fn change_details(
        &self,
        repository: &RepositoryRecord,
        change_id: String,
        commit_id: String,
        cancellation: CancellationToken,
    ) -> Result<ChangeRow, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        if !valid_commit_id(&commit_id) {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "change detail revision is invalid".into(),
            });
        }
        let output = self
            .run_query_with_limit(
                repository,
                JjQuery::ChangeDetails {
                    commit_id: commit_id.clone(),
                },
                cancellation,
                CHANGE_DETAILS_OUTPUT_LIMIT,
            )
            .await?;
        let mut changes = parse_log(&output.stdout)?;
        if changes.len() != 1 {
            return Err(invalid_output(
                "change detail query did not return exactly one revision",
            ));
        }
        let change = changes.remove(0);
        if change.change_id != change_id || change.commit_id != commit_id {
            return Err(invalid_output(
                "change detail query returned a different revision",
            ));
        }
        Ok(change)
    }

    pub async fn revision_tree(
        &self,
        repository: &RepositoryRecord,
        change_id: String,
        commit_id: String,
        changed_files: &[ChangedFile],
        cancellation: CancellationToken,
    ) -> Result<RevisionTreeProjection, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        if !valid_commit_id(&commit_id) {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "revision tree commit is invalid".into(),
            });
        }
        let output = self
            .run_query_capture_with_limit(
                repository,
                JjQuery::RevisionTree {
                    commit_id: commit_id.clone(),
                    path: None,
                },
                cancellation,
                REVISION_TREE_OUTPUT_LIMIT,
            )
            .await?;
        let mut entries = parse_json_lines::<RevisionTreeEntry>(
            &output.stdout,
            "revision tree",
            output.truncated,
        )?;
        let statuses = changed_files
            .iter()
            .map(|file| (file.path.as_str(), file.status.as_str()))
            .collect::<BTreeMap<_, _>>();
        for entry in &mut entries {
            entry.status = statuses
                .get(entry.path.as_str())
                .map(|status| (*status).into());
        }
        Ok(RevisionTreeProjection {
            repository_id: repository.id.clone(),
            change_id,
            commit_id,
            entries,
            truncated: output.truncated,
        })
    }

    pub async fn revision_file(
        &self,
        repository: &RepositoryRecord,
        change_id: String,
        commit_id: String,
        path: String,
        cancellation: CancellationToken,
    ) -> Result<RevisionFileProjection, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        if !valid_commit_id(&commit_id) || !valid_repository_path(&path) {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "revision file commit or repository path is invalid".into(),
            });
        }
        let metadata = self
            .run_query_with_limit(
                repository,
                JjQuery::RevisionTree {
                    commit_id: commit_id.clone(),
                    path: Some(path.clone()),
                },
                cancellation.clone(),
                64 * 1024,
            )
            .await?;
        let mut entries = parse_json_lines::<RevisionTreeEntry>(
            &metadata.stdout,
            "revision file metadata",
            false,
        )?;
        if entries.len() != 1 || entries[0].path != path {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "the selected file is not present in this revision".into(),
            });
        }
        let entry = entries.remove(0);
        let output = self
            .run_query_capture_with_limit(
                repository,
                JjQuery::RevisionFile {
                    commit_id: commit_id.clone(),
                    path,
                },
                cancellation,
                REVISION_FILE_OUTPUT_LIMIT,
            )
            .await?;
        let (content, binary) = decode_revision_file(&output.stdout, output.truncated);
        Ok(RevisionFileProjection {
            repository_id: repository.id.clone(),
            change_id,
            commit_id,
            entry,
            content,
            binary,
            truncated: output.truncated,
        })
    }

    pub async fn file_timeline(
        &self,
        repository: &RepositoryRecord,
        change_id: String,
        commit_id: String,
        path: String,
        cancellation: CancellationToken,
    ) -> Result<FileTimelineProjection, DriverError> {
        let file = self
            .revision_file(
                repository,
                change_id.clone(),
                commit_id.clone(),
                path.clone(),
                cancellation.clone(),
            )
            .await?;
        let history_output = self
            .run_query_with_limit(
                repository,
                JjQuery::FileHistory {
                    commit_id: commit_id.clone(),
                    path: path.clone(),
                },
                cancellation.clone(),
                FILE_HISTORY_OUTPUT_LIMIT,
            )
            .await?;
        let mut history =
            parse_json_lines::<FileHistoryEntry>(&history_output.stdout, "file history", false)?;
        if !history.iter().any(|entry| entry.commit_id == commit_id) {
            let details = self
                .change_details(
                    repository,
                    change_id.clone(),
                    commit_id.clone(),
                    cancellation.clone(),
                )
                .await?;
            history.insert(
                0,
                FileHistoryEntry {
                    change_id: details.change_id,
                    commit_id: details.commit_id,
                    summary: details.summary,
                    author: details.author,
                    timestamp: details.author_timestamp,
                },
            );
        }
        let (lines, annotation_truncated) = if file.binary {
            (Vec::new(), false)
        } else {
            let annotation_output = self
                .run_query_capture_with_limit(
                    repository,
                    JjQuery::FileAnnotation {
                        commit_id: commit_id.clone(),
                        path: path.clone(),
                    },
                    cancellation,
                    FILE_ANNOTATION_OUTPUT_LIMIT,
                )
                .await?;
            (
                parse_json_lines::<FileAnnotationLine>(
                    &annotation_output.stdout,
                    "file annotation",
                    annotation_output.truncated,
                )?,
                annotation_output.truncated,
            )
        };
        Ok(FileTimelineProjection {
            repository_id: repository.id.clone(),
            change_id,
            commit_id,
            path,
            history,
            lines,
            binary: file.binary,
            truncated: file.truncated || annotation_truncated,
        })
    }

    pub async fn operation_log(
        &self,
        repository: &RepositoryRecord,
        cancellation: CancellationToken,
    ) -> Result<OperationLogProjection, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        let output = self
            .run_query(repository, JjQuery::OperationLog, cancellation)
            .await?;
        let operations = parse_operation_log(&output.stdout)?;
        let undo_target = operations
            .iter()
            .find(|operation| operation.undo_eligible)
            .map(|operation| operation.id.clone());
        let redo_target = redo_is_available(&operations)
            .then(|| operations.first().map(|operation| operation.id.clone()))
            .flatten();
        Ok(OperationLogProjection {
            repository_id: repository.id.clone(),
            operations,
            undo_target,
            redo_target,
        })
    }

    pub async fn mutation_context(
        &self,
        repository: &RepositoryRecord,
        intent: &MutationIntent,
        cancellation: CancellationToken,
    ) -> Result<MutationContext, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        intent.validate().map_err(mutation_validation_error)?;

        let operation_id = self
            .current_operation_id(repository, cancellation.child_token())
            .await?;
        if let MutationIntent::Undo {
            operation_id: requested,
        }
        | MutationIntent::Redo {
            operation_id: requested,
        } = intent
            && requested != &operation_id
        {
            return Err(DriverError {
                kind: DriverErrorKind::StaleOperation,
                message: "the selected history step is no longer the current operation".into(),
            });
        }

        let mut workspace_root = None;
        let mut workspace_commit_id = None;
        if matches!(
            intent,
            MutationIntent::RemoveWorkspace { .. } | MutationIntent::Abandon { .. }
        ) {
            let (workspace_output, workspace_root_output) = tokio::try_join!(
                self.run_query(repository, JjQuery::Workspaces, cancellation.child_token()),
                self.run_query(
                    repository,
                    JjQuery::WorkspaceRoot,
                    cancellation.child_token()
                ),
            )?;
            let current_root =
                parse_single_text_line(&workspace_root_output.stdout, "current workspace root")?;
            let workspaces = self
                .hydrate_workspace_roots(
                    repository,
                    parse_workspaces(&workspace_output.stdout, &current_root)?,
                    &current_root,
                    cancellation.child_token(),
                )
                .await?;
            match intent {
                MutationIntent::RemoveWorkspace { name } => {
                    let workspace = workspaces
                        .iter()
                        .find(|workspace| workspace.name == *name)
                        .ok_or_else(|| DriverError {
                            kind: DriverErrorKind::InvalidRepository,
                            message: "the selected workspace is no longer registered".into(),
                        })?;
                    if workspace.current {
                        return Err(DriverError {
                            kind: DriverErrorKind::InvalidRepository,
                            message:
                                "the current workspace cannot be removed; switch to another workspace first"
                            .into(),
                        });
                    }
                    if workspace.root.is_empty() {
                        return Err(DriverError {
                            kind: DriverErrorKind::InvalidRepository,
                            message: "the selected workspace directory could not be resolved"
                                .into(),
                        });
                    }
                    if !workspace.empty {
                        return Err(DriverError {
                            kind: DriverErrorKind::InvalidRepository,
                            message:
                                "the workspace working copy contains changes; review or empty it before removal"
                                    .into(),
                        });
                    }
                    workspace_root = Some(workspace.root.clone());
                    workspace_commit_id = Some(workspace.commit_id.clone());
                }
                MutationIntent::Abandon { target_commit_ids } => {
                    if workspaces.iter().any(|workspace| {
                        target_commit_ids
                            .iter()
                            .any(|commit_id| commit_id == &workspace.commit_id)
                    }) {
                        return Err(DriverError {
                            kind: DriverErrorKind::InvalidRepository,
                            message:
                                "a workspace working-copy change cannot be abandoned; remove the workspace instead"
                                    .into(),
                        });
                    }
                }
                _ => unreachable!(),
            }
        }

        let commit_ids = intent.commit_ids();
        if !commit_ids.is_empty() {
            let inspection = self
                .run_query(
                    repository,
                    JjQuery::InspectCommits {
                        commit_ids: commit_ids.iter().map(|value| (*value).to_owned()).collect(),
                    },
                    cancellation.child_token(),
                )
                .await?;
            let found = parse_lines(&inspection.stdout);
            let expected = commit_ids
                .into_iter()
                .collect::<std::collections::BTreeSet<_>>();
            let actual = found
                .iter()
                .map(String::as_str)
                .collect::<std::collections::BTreeSet<_>>();
            if expected != actual {
                return Err(DriverError {
                    kind: DriverErrorKind::InvalidRepository,
                    message: "one or more mutation targets are no longer present".into(),
                });
            }
        }

        let candidates = if matches!(intent, MutationIntent::PruneEmpty) {
            let output = self
                .run_query(repository, JjQuery::PruneCandidates, cancellation)
                .await?;
            parse_prune_candidates(&output.stdout)?
        } else {
            Vec::new()
        };

        Ok(MutationContext {
            operation_id,
            candidates,
            workspace_root,
            workspace_commit_id,
        })
    }

    pub async fn current_operation_id(
        &self,
        repository: &RepositoryRecord,
        cancellation: CancellationToken,
    ) -> Result<String, DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        let operation = self
            .run_query(repository, JjQuery::OperationId, cancellation)
            .await?;
        parse_single_line(&operation.stdout, "current operation ID")
    }

    pub async fn initialize_git_repository(
        &self,
        repository: &RepositoryRecord,
        cancellation: CancellationToken,
    ) -> Result<(), DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        let plan = self.initialization_plan(repository);
        self.run_mutation_plan(repository, plan, cancellation).await
    }

    fn initialization_plan(&self, repository: &RepositoryRecord) -> CommandPlan {
        let args = vec![
            OsString::from("git"),
            OsString::from("init"),
            OsString::from("--colocate"),
            OsString::from("."),
        ];
        match &repository.location {
            RepositoryLocation::Local { path } => CommandPlan {
                program: self.jj_program.clone(),
                args,
                current_dir: Some(path.into()),
                stdin: None,
            },
            RepositoryLocation::Ssh { host, path } => CommandPlan {
                program: self.ssh_program.clone(),
                args: ssh_arguments(host),
                current_dir: None,
                stdin: Some(remote_initialization_script(path).into_bytes()),
            },
        }
    }

    pub async fn execute_mutation(
        &self,
        repository: &RepositoryRecord,
        intent: &MutationIntent,
        candidates: &[MutationCandidate],
        expected_workspace_root: Option<&str>,
        expected_workspace_commit_id: Option<&str>,
        cancellation: CancellationToken,
    ) -> Result<(), DriverError> {
        repository.validate().map_err(|error| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: error.to_string(),
        })?;
        intent.validate().map_err(mutation_validation_error)?;
        if !matches!(intent, MutationIntent::PruneEmpty) && !candidates.is_empty() {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "mutation candidates are only valid for empty pruning".into(),
            });
        }
        if let MutationIntent::RemoveWorkspace { name } = intent {
            let expected_workspace_root = expected_workspace_root.ok_or_else(|| DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "workspace removal is missing its previewed directory".into(),
            })?;
            let expected_workspace_commit_id =
                expected_workspace_commit_id.ok_or_else(|| DriverError {
                    kind: DriverErrorKind::InvalidRepository,
                    message: "workspace removal is missing its previewed working-copy change"
                        .into(),
                })?;
            return self
                .remove_workspace(
                    repository,
                    name,
                    expected_workspace_root,
                    expected_workspace_commit_id,
                    cancellation,
                )
                .await;
        }
        if expected_workspace_root.is_some() || expected_workspace_commit_id.is_some() {
            return Err(DriverError {
                kind: DriverErrorKind::InvalidRepository,
                message: "workspace context is only valid for workspace removal".into(),
            });
        }
        let args = mutation_args(intent, candidates)?;
        let plan = self.mutation_plan(repository, args);
        let timeout = if matches!(
            intent,
            MutationIntent::Fetch { .. } | MutationIntent::Push { .. }
        ) {
            self.timeout.max(Duration::from_secs(60))
        } else {
            self.timeout
        };
        let output = match repository.location {
            RepositoryLocation::Local { .. } => run_command(plan, timeout, cancellation).await,
            RepositoryLocation::Ssh { .. } => run_remote_command(plan, timeout, cancellation).await,
        }
        .map_err(|error| process_error(repository, error))?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: "mutation output exceeded the safe capture limit".into(),
            });
        }
        if output.exit_code != Some(0) {
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: redact_error(raw.trim(), &repository.location),
            });
        }
        Ok(())
    }

    async fn remove_workspace(
        &self,
        repository: &RepositoryRecord,
        name: &str,
        expected_workspace_root: &str,
        expected_workspace_commit_id: &str,
        cancellation: CancellationToken,
    ) -> Result<(), DriverError> {
        let intent = MutationIntent::RemoveWorkspace {
            name: name.to_owned(),
        };
        let context = self
            .mutation_context(repository, &intent, cancellation.child_token())
            .await?;
        let target_root = context.workspace_root.ok_or_else(|| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: "the selected workspace directory could not be resolved".into(),
        })?;
        let target_commit_id = context.workspace_commit_id.ok_or_else(|| DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: "the workspace working-copy change could not be resolved".into(),
        })?;
        if target_root != expected_workspace_root {
            return Err(DriverError {
                kind: DriverErrorKind::StaleOperation,
                message:
                    "the selected workspace directory changed after preview; review the removal again"
                        .into(),
            });
        }
        if target_commit_id != expected_workspace_commit_id {
            return Err(DriverError {
                kind: DriverErrorKind::StaleOperation,
                message:
                    "the workspace working-copy change changed after preview; review the removal again"
                        .into(),
            });
        }

        match &repository.location {
            RepositoryLocation::Local { .. } => {
                let current_root = self
                    .run_query(
                        repository,
                        JjQuery::WorkspaceRoot,
                        cancellation.child_token(),
                    )
                    .await?;
                let current_root =
                    parse_single_text_line(&current_root.stdout, "current workspace root")?;
                let target = validate_local_workspace_removal(&target_root, &current_root).await?;

                let args = mutation_args(&intent, &[])?;
                self.run_mutation_plan(
                    repository,
                    self.mutation_plan(repository, args),
                    cancellation.child_token(),
                )
                .await?;
                let abandon = MutationIntent::Abandon {
                    target_commit_ids: vec![target_commit_id],
                };
                let args = mutation_args(&abandon, &[])?;
                self.run_mutation_plan(
                    repository,
                    self.mutation_plan(repository, args),
                    cancellation.child_token(),
                )
                .await?;
                tokio::fs::remove_dir_all(&target)
                    .await
                    .map_err(|_| DriverError {
                        kind: DriverErrorKind::CommandFailed,
                        message:
                            "the workspace was unregistered but its directory could not be deleted"
                                .into(),
                    })?;
                if tokio::fs::symlink_metadata(&target).await.is_ok() {
                    return Err(DriverError {
                        kind: DriverErrorKind::CommandFailed,
                        message: "the workspace was unregistered but its directory still exists"
                            .into(),
                    });
                }
                Ok(())
            }
            RepositoryLocation::Ssh { host, path } => {
                let plan = CommandPlan {
                    program: self.ssh_program.clone(),
                    args: ssh_arguments(host),
                    current_dir: None,
                    stdin: Some(
                        remote_workspace_removal_script(
                            path,
                            name,
                            expected_workspace_root,
                            expected_workspace_commit_id,
                        )
                        .into_bytes(),
                    ),
                };
                self.run_mutation_plan(repository, plan, cancellation).await
            }
        }
    }

    async fn run_mutation_plan(
        &self,
        repository: &RepositoryRecord,
        plan: CommandPlan,
        cancellation: CancellationToken,
    ) -> Result<(), DriverError> {
        let output = match repository.location {
            RepositoryLocation::Local { .. } => run_command(plan, self.timeout, cancellation).await,
            RepositoryLocation::Ssh { .. } => {
                run_remote_command(plan, self.timeout, cancellation).await
            }
        }
        .map_err(|error| process_error(repository, error))?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: "mutation output exceeded the safe capture limit".into(),
            });
        }
        if output.exit_code != Some(0) {
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: redact_error(raw.trim(), &repository.location),
            });
        }
        Ok(())
    }

    async fn run_query(
        &self,
        repository: &RepositoryRecord,
        query: JjQuery,
        cancellation: CancellationToken,
    ) -> Result<CommandOutput, DriverError> {
        self.run_query_with_limit(repository, query, cancellation, DEFAULT_OUTPUT_LIMIT)
            .await
    }

    async fn hydrate_workspace_roots(
        &self,
        repository: &RepositoryRecord,
        mut workspaces: Vec<WorkspaceRow>,
        current_root: &str,
        cancellation: CancellationToken,
    ) -> Result<Vec<WorkspaceRow>, DriverError> {
        let mut current_resolved = false;
        for workspace in &mut workspaces {
            match self
                .run_query(
                    repository,
                    JjQuery::WorkspaceRootByName {
                        name: workspace.name.clone(),
                    },
                    cancellation.child_token(),
                )
                .await
            {
                Ok(output) => {
                    let root = parse_single_text_line(&output.stdout, "registered workspace root")?;
                    workspace.current = root == current_root;
                    workspace.root = root;
                    current_resolved |= workspace.current;
                }
                Err(error) if error.kind == DriverErrorKind::Cancelled => return Err(error),
                Err(_) if workspace.current && !current_resolved => {
                    // Older jj repositories can retain a current workspace registration
                    // without a recorded path. `jj root` remains authoritative for that
                    // workspace, while the missing per-workspace root stays non-fatal.
                    workspace.root = current_root.to_owned();
                    current_resolved = true;
                }
                Err(_) => {
                    workspace.current = false;
                }
            }
        }
        workspaces.sort_by(|left, right| {
            right
                .current
                .cmp(&left.current)
                .then_with(|| left.name.cmp(&right.name))
        });
        Ok(workspaces)
    }

    async fn run_query_with_limit(
        &self,
        repository: &RepositoryRecord,
        query: JjQuery,
        cancellation: CancellationToken,
        output_limit: usize,
    ) -> Result<CommandOutput, DriverError> {
        let output_label = query.output_label();
        let output = self
            .run_query_capture_with_limit(repository, query, cancellation, output_limit)
            .await?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: format!(
                    "{output_label} exceeded the {} safe capture limit",
                    format_output_limit(output_limit)
                ),
            });
        }
        Ok(output)
    }

    async fn run_query_capture_with_limit(
        &self,
        repository: &RepositoryRecord,
        query: JjQuery,
        cancellation: CancellationToken,
        output_limit: usize,
    ) -> Result<CommandOutput, DriverError> {
        let plan = self.command_plan(repository, query);
        let output = match repository.location {
            RepositoryLocation::Local { .. } => {
                run_command_with_limit(plan, self.timeout, cancellation, output_limit).await
            }
            RepositoryLocation::Ssh { .. } => {
                run_remote_command_with_limit(plan, self.timeout, cancellation, output_limit).await
            }
        }
        .map_err(|error| process_error(repository, error))?;
        if output.exit_code != Some(0) {
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: redact_error(raw.trim(), &repository.location),
            });
        }
        Ok(output)
    }

    fn command_plan(&self, repository: &RepositoryRecord, query: JjQuery) -> CommandPlan {
        let query_args = query.args();
        match &repository.location {
            RepositoryLocation::Local { path } => CommandPlan {
                program: self.jj_program.clone(),
                args: query_args,
                current_dir: Some(path.into()),
                stdin: None,
            },
            RepositoryLocation::Ssh { host, path } => CommandPlan {
                program: self.ssh_program.clone(),
                args: ssh_arguments(host),
                current_dir: None,
                stdin: Some(remote_script(path, query).into_bytes()),
            },
        }
    }

    fn mutation_plan(&self, repository: &RepositoryRecord, args: Vec<OsString>) -> CommandPlan {
        match &repository.location {
            RepositoryLocation::Local { path } => CommandPlan {
                program: self.jj_program.clone(),
                args,
                current_dir: Some(path.into()),
                stdin: None,
            },
            RepositoryLocation::Ssh { host, path } => CommandPlan {
                program: self.ssh_program.clone(),
                args: ssh_arguments(host),
                current_dir: None,
                stdin: Some(remote_mutation_script(path, &args).into_bytes()),
            },
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MutationContext {
    pub operation_id: String,
    pub candidates: Vec<MutationCandidate>,
    pub workspace_root: Option<String>,
    pub workspace_commit_id: Option<String>,
}

fn ssh_arguments(host: &str) -> Vec<OsString> {
    vec![
        OsString::from("-o"),
        OsString::from("BatchMode=yes"),
        OsString::from("-o"),
        OsString::from("ConnectTimeout=8"),
        OsString::from("-o"),
        OsString::from("ServerAliveInterval=5"),
        OsString::from("-o"),
        OsString::from("ServerAliveCountMax=1"),
        OsString::from("--"),
        OsString::from(host),
        OsString::from("sh"),
        OsString::from("-s"),
    ]
}

fn remote_script(path: &str, query: JjQuery) -> String {
    let encoded_path = path
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let command = match query {
        JjQuery::Version => "exec \"$jj_bin\" --repository \"$repo\" --version".to_owned(),
        JjQuery::Log => format!(
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r 'ancestors(visible_heads())' -n {HISTORY_CHANGE_LIMIT} -T '{LOG_TEMPLATE}'"
        ),
        JjQuery::WorkingCopyFileCount => {
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r @ -T 'self.diff().files().len() ++ \"\\n\"'".into()
        }
        JjQuery::Workspaces => format!(
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy workspace list -T '{WORKSPACE_TEMPLATE}'"
        ),
        JjQuery::WorkspaceRoot => {
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy root".into()
        }
        JjQuery::WorkspaceRootByName { name } => {
            let encoded_name = encode_hex(&name);
            format!(
                "workspace=$(decode_hex '{encoded_name}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy workspace root --name \"$workspace\""
            )
        }
        JjQuery::ChangeDetails { commit_id } => {
            let encoded_commit = encode_hex(&commit_id);
            format!(
                "commit=$(decode_hex '{encoded_commit}')\ncd \"$repo\"\nexec \"$jj_bin\" --ignore-working-copy log --no-graph --color never -r \"$commit\" -T '{CHANGE_DETAILS_TEMPLATE}'"
            )
        }
        JjQuery::RevisionTree { commit_id, path } => {
            let encoded_commit = encode_hex(&commit_id);
            let path_command = path.map_or_else(String::new, |path| {
                let encoded_fileset = encode_hex(&exact_file_fileset(&path));
                format!(
                    "\nfileset=$(decode_hex '{encoded_fileset}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy file list -r \"$commit\" -T '{REVISION_TREE_TEMPLATE}' -- \"$fileset\""
                )
            });
            if path_command.is_empty() {
                format!(
                    "commit=$(decode_hex '{encoded_commit}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy file list -r \"$commit\" -T '{REVISION_TREE_TEMPLATE}'"
                )
            } else {
                format!("commit=$(decode_hex '{encoded_commit}'){path_command}")
            }
        }
        JjQuery::RevisionFile { commit_id, path } => {
            let encoded_commit = encode_hex(&commit_id);
            let encoded_fileset = encode_hex(&exact_file_fileset(&path));
            format!(
                "commit=$(decode_hex '{encoded_commit}')\nfileset=$(decode_hex '{encoded_fileset}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy file show -r \"$commit\" -- \"$fileset\""
            )
        }
        JjQuery::FileHistory { commit_id, path } => {
            let encoded_commit = encode_hex(&commit_id);
            let encoded_fileset = encode_hex(&exact_file_fileset(&path));
            format!(
                "commit=$(decode_hex '{encoded_commit}')\nfileset=$(decode_hex '{encoded_fileset}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r \"ancestors($commit)\" -n {FILE_HISTORY_LIMIT} -T '{FILE_HISTORY_TEMPLATE}' -- \"$fileset\""
            )
        }
        JjQuery::FileAnnotation { commit_id, path } => {
            let encoded_commit = encode_hex(&commit_id);
            let encoded_path = encode_hex(&path);
            format!(
                "commit=$(decode_hex '{encoded_commit}')\npath=$(decode_hex '{encoded_path}')\ncd \"$repo\"\nexec \"$jj_bin\" --ignore-working-copy file annotate -r \"$commit\" -T '{FILE_ANNOTATION_TEMPLATE}' -- \"$path\""
            )
        }
        JjQuery::Diff {
            commit_id,
            path,
            whitespace_mode,
        } => {
            let encoded_commit = encode_hex(&commit_id);
            let encoded_fileset = encode_hex(&exact_file_fileset(&path));
            let whitespace = match whitespace_mode {
                WhitespaceMode::Preserve => "",
                WhitespaceMode::IgnoreAll => " --ignore-all-space",
            };
            format!(
                "commit=$(decode_hex '{encoded_commit}')\nfileset=$(decode_hex '{encoded_fileset}')\ncd \"$repo\"\nexec \"$jj_bin\" --ignore-working-copy diff --color never -r \"$commit\" --git --context 3{whitespace} -- \"$fileset\""
            )
        }
        JjQuery::SyncMetric(metric) => format!(
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --color never --count -r '{}'",
            metric.revset()
        ),
        JjQuery::OperationLog => format!(
            "exec \"$jj_bin\" --repository \"$repo\" --at-op=@ --ignore-working-copy op log --no-graph --color never -n 20 -T '{OPERATION_TEMPLATE}'"
        ),
        JjQuery::OperationId => {
            "exec \"$jj_bin\" --repository \"$repo\" --at-op=@ --ignore-working-copy op log --no-graph --color never -n 1 -T 'id ++ \"\\n\"'".into()
        }
        JjQuery::InspectCommits { commit_ids } => {
            let revset = commit_ids.join("|");
            let encoded_revset = encode_hex(&revset);
            format!(
                "revset=$(decode_hex '{encoded_revset}')\nexec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r \"$revset\" -T 'commit_id ++ \"\\n\"'"
            )
        }
        JjQuery::PruneCandidates => format!(
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r '{PRUNE_CANDIDATE_REVSET}' -T '{PRUNE_CANDIDATE_TEMPLATE}'"
        ),
    };
    format!(
        "set -eu\ndecode_hex() {{\n  encoded=$1\n  decoded=''\n  while [ -n \"$encoded\" ]; do\n    rest=${{encoded#??}}\n    byte=${{encoded%\"$rest\"}}\n    encoded=$rest\n    octal=$(printf '%03o' \"0x$byte\")\n    decoded=\"$decoded$(printf \"\\\\$octal\")\"\n  done\n  printf '%s' \"$decoded\"\n}}\nrepo=$(decode_hex '{encoded_path}')\ncase \"$repo\" in\n  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;\nesac\nfind_jj() {{\n  if command -v jj >/dev/null 2>&1; then\n    command -v jj\n    return 0\n  fi\n  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do\n    if [ -x \"$candidate\" ]; then\n      printf '%s\\n' \"$candidate\"\n      return 0\n    fi\n  done\n  return 127\n}}\njj_bin=$(find_jj) || {{\n  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2\n  exit 127\n}}\n{command}\n"
    )
}

fn remote_mutation_script(path: &str, args: &[OsString]) -> String {
    let encoded_path = encode_hex(path);
    let assignments = args
        .iter()
        .enumerate()
        .map(|(index, argument)| {
            let argument = argument
                .to_str()
                .expect("jjcat mutation arguments must be valid UTF-8");
            format!("arg_{index}=$(decode_hex '{}')", encode_hex(argument))
        })
        .collect::<Vec<_>>()
        .join("\n");
    let invocation = (0..args.len())
        .map(|index| format!("\"$arg_{index}\""))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "set -eu\ndecode_hex() {{\n  encoded=$1\n  decoded=''\n  while [ -n \"$encoded\" ]; do\n    rest=${{encoded#??}}\n    byte=${{encoded%\"$rest\"}}\n    encoded=$rest\n    octal=$(printf '%03o' \"0x$byte\")\n    decoded=\"$decoded$(printf \"\\\\$octal\")\"\n  done\n  printf '%s' \"$decoded\"\n}}\nrepo=$(decode_hex '{encoded_path}')\ncase \"$repo\" in\n  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;\nesac\nfind_jj() {{\n  if command -v jj >/dev/null 2>&1; then\n    command -v jj\n    return 0\n  fi\n  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do\n    if [ -x \"$candidate\" ]; then\n      printf '%s\\n' \"$candidate\"\n      return 0\n    fi\n  done\n  return 127\n}}\njj_bin=$(find_jj) || {{\n  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2\n  exit 127\n}}\n{assignments}\nexec \"$jj_bin\" --repository \"$repo\" {invocation}\n"
    )
}

fn remote_initialization_script(path: &str) -> String {
    let encoded_path = encode_hex(path);
    format!(
        "set -eu\ndecode_hex() {{\n  encoded=$1\n  decoded=''\n  while [ -n \"$encoded\" ]; do\n    rest=${{encoded#??}}\n    byte=${{encoded%\"$rest\"}}\n    encoded=$rest\n    octal=$(printf '%03o' \"0x$byte\")\n    decoded=\"$decoded$(printf \"\\\\$octal\")\"\n  done\n  printf '%s' \"$decoded\"\n}}\nrepo=$(decode_hex '{encoded_path}')\ncase \"$repo\" in\n  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;\nesac\nif [ ! -d \"$repo\" ]; then\n  printf '%s\\n' 'remote repository folder is not available' >&2\n  exit 2\nfi\nfind_jj() {{\n  if command -v jj >/dev/null 2>&1; then\n    command -v jj\n    return 0\n  fi\n  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do\n    if [ -x \"$candidate\" ]; then\n      printf '%s\\n' \"$candidate\"\n      return 0\n    fi\n  done\n  return 127\n}}\njj_bin=$(find_jj) || {{\n  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2\n  exit 127\n}}\ncd \"$repo\"\nexec \"$jj_bin\" git init --colocate .\n"
    )
}

async fn validate_local_workspace_removal(
    target_root: &str,
    current_root: &str,
) -> Result<PathBuf, DriverError> {
    let target = Path::new(target_root);
    let current = Path::new(current_root);
    if !target.is_absolute() || !current.is_absolute() || target.parent().is_none() {
        return Err(unsafe_workspace_removal());
    }
    let metadata = tokio::fs::symlink_metadata(target)
        .await
        .map_err(|_| unsafe_workspace_removal())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(unsafe_workspace_removal());
    }
    let target = tokio::fs::canonicalize(target)
        .await
        .map_err(|_| unsafe_workspace_removal())?;
    let current = tokio::fs::canonicalize(current)
        .await
        .map_err(|_| unsafe_workspace_removal())?;
    if target == current || current.starts_with(&target) {
        return Err(unsafe_workspace_removal());
    }
    Ok(target)
}

fn unsafe_workspace_removal() -> DriverError {
    DriverError {
        kind: DriverErrorKind::InvalidRepository,
        message:
            "the selected workspace directory failed the removal safety checks; no files were deleted"
                .into(),
    }
}

fn remote_workspace_removal_script(
    path: &str,
    name: &str,
    expected_workspace_root: &str,
    expected_workspace_commit_id: &str,
) -> String {
    let encoded_path = encode_hex(path);
    let encoded_name = encode_hex(name);
    let encoded_expected_root = encode_hex(expected_workspace_root);
    let encoded_expected_commit = encode_hex(expected_workspace_commit_id);
    format!(
        "set -eu
decode_hex() {{
  encoded=$1
  decoded=''
  while [ -n \"$encoded\" ]; do
    rest=${{encoded#??}}
    byte=${{encoded%\"$rest\"}}
    encoded=$rest
    octal=$(printf '%03o' \"0x$byte\")
    decoded=\"$decoded$(printf \"\\\\$octal\")\"
  done
  printf '%s' \"$decoded\"
}}
repo=$(decode_hex '{encoded_path}')
workspace=$(decode_hex '{encoded_name}')
expected_root=$(decode_hex '{encoded_expected_root}')
expected_commit=$(decode_hex '{encoded_expected_commit}')
case \"$repo\" in
  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;
esac
find_jj() {{
  if command -v jj >/dev/null 2>&1; then
    command -v jj
    return 0
  fi
  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do
    if [ -x \"$candidate\" ]; then
      printf '%s\\n' \"$candidate\"
      return 0
    fi
  done
  return 127
}}
jj_bin=$(find_jj) || {{
  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2
  exit 127
}}
current_root=$(\"$jj_bin\" --repository \"$repo\" --ignore-working-copy root)
target_root=$(\"$jj_bin\" --repository \"$repo\" --ignore-working-copy workspace root --name \"$workspace\")
workspace_records=$(\"$jj_bin\" --repository \"$repo\" --ignore-working-copy workspace list -T 'name ++ \"\\t\" ++ stringify(target.commit_id()) ++ \"\\t\" ++ if(target.empty(), \"true\", \"false\") ++ \"\\n\"')
target_commit=''
target_empty=''
tab=$(printf '\\t')
while IFS=\"$tab\" read -r listed_name listed_commit listed_empty; do
  if [ \"$listed_name\" = \"$workspace\" ]; then
    target_commit=$listed_commit
    target_empty=$listed_empty
    break
  fi
done <<EOF
$workspace_records
EOF
if [ \"$target_root\" != \"$expected_root\" ]; then
  printf '%s\\n' 'workspace directory changed after preview' >&2
  exit 75
fi
if [ \"$target_commit\" != \"$expected_commit\" ]; then
  printf '%s\\n' 'workspace working-copy change changed after preview' >&2
  exit 75
fi
if [ \"$target_empty\" != 'true' ]; then
  printf '%s\\n' 'workspace working copy contains changes' >&2
  exit 65
fi
case \"$current_root\" in
  /*) ;;
  *) printf '%s\\n' 'current workspace root failed the removal safety checks' >&2; exit 64 ;;
esac
case \"$target_root\" in
  /) printf '%s\\n' 'workspace root failed the removal safety checks' >&2; exit 64 ;;
  /*) ;;
  *) printf '%s\\n' 'workspace root failed the removal safety checks' >&2; exit 64 ;;
esac
if [ ! -d \"$target_root\" ] || [ -L \"$target_root\" ]; then
  printf '%s\\n' 'workspace directory failed the removal safety checks' >&2
  exit 64
fi
current_real=$(CDPATH= cd -- \"$current_root\" && pwd -P)
target_real=$(CDPATH= cd -- \"$target_root\" && pwd -P)
if [ \"$target_real\" = \"$current_real\" ]; then
  printf '%s\\n' 'the current workspace cannot be removed' >&2
  exit 64
fi
case \"$current_real/\" in
  \"$target_real/\"*) printf '%s\\n' 'workspace directory failed the removal safety checks' >&2; exit 64 ;;
esac
\"$jj_bin\" --repository \"$repo\" workspace forget -- \"$workspace\"
\"$jj_bin\" --repository \"$repo\" abandon \"$expected_commit\"
rm -rf -- \"$target_root\"
if [ -e \"$target_root\" ] || [ -L \"$target_root\" ]; then
  printf '%s\\n' 'workspace directory still exists after removal' >&2
  exit 74
fi
"
    )
}

fn encode_hex(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn remote_directory_script(path: &str) -> String {
    let encoded_path = path
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!(
        "set -eu\nencoded='{encoded_path}'\ntarget=''\nwhile [ -n \"$encoded\" ]; do\n  rest=${{encoded#??}}\n  byte=${{encoded%\"$rest\"}}\n  encoded=$rest\n  octal=$(printf '%03o' \"0x$byte\")\n  target=\"$target$(printf \"\\\\$octal\")\"\ndone\ncase \"$target\" in\n  \"~/\"*) target=\"$HOME/${{target#??}}\" ;;\nesac\nif [ ! -d \"$target\" ]; then\n  printf '%s\\n' 'remote folder is not available' >&2\n  exit 2\nfi\ncd \"$target\"\ncurrent=$(pwd -P)\nprintf '%s\\0' \"$current\"\nfind \"$current\" -mindepth 1 -maxdepth 1 \\( -type d -o -type l \\) -exec sh -c 'for directory do if [ -d \"$directory\" ]; then printf \"%s\\0\" \"$directory\"; fi; done' sh {{}} +\n"
    )
}

#[derive(Clone)]
enum JjQuery {
    Version,
    Log,
    WorkingCopyFileCount,
    Workspaces,
    WorkspaceRoot,
    WorkspaceRootByName {
        name: String,
    },
    ChangeDetails {
        commit_id: String,
    },
    RevisionTree {
        commit_id: String,
        path: Option<String>,
    },
    RevisionFile {
        commit_id: String,
        path: String,
    },
    FileHistory {
        commit_id: String,
        path: String,
    },
    FileAnnotation {
        commit_id: String,
        path: String,
    },
    Diff {
        commit_id: String,
        path: String,
        whitespace_mode: WhitespaceMode,
    },
    SyncMetric(SyncMetric),
    OperationLog,
    OperationId,
    InspectCommits {
        commit_ids: Vec<String>,
    },
    PruneCandidates,
}

#[derive(Clone, Copy)]
enum SyncMetric {
    RemoteHeads,
    Outgoing,
    Behind,
}

impl SyncMetric {
    fn revset(self) -> &'static str {
        match self {
            Self::RemoteHeads => NETWORK_REMOTE_HEADS,
            Self::Outgoing => OUTGOING_REVISIONS,
            Self::Behind => BEHIND_REVISIONS,
        }
    }
}

impl JjQuery {
    fn output_label(&self) -> &'static str {
        match self {
            Self::Version => "jj version probe",
            Self::Log => "history projection",
            Self::WorkingCopyFileCount => "working copy file count",
            Self::Workspaces => "workspace inventory",
            Self::WorkspaceRoot => "current workspace root",
            Self::WorkspaceRootByName { .. } => "registered workspace root",
            Self::ChangeDetails { .. } => "selected change details",
            Self::RevisionTree { .. } => "revision file tree",
            Self::RevisionFile { .. } => "revision file content",
            Self::FileHistory { .. } => "file history",
            Self::FileAnnotation { .. } => "file annotation",
            Self::Diff { .. } => "file diff",
            Self::SyncMetric(SyncMetric::RemoteHeads) => "remote bookmark count",
            Self::SyncMetric(SyncMetric::Outgoing) => "outgoing change count",
            Self::SyncMetric(SyncMetric::Behind) => "behind change count",
            Self::OperationLog => "operation history",
            Self::OperationId => "current operation lookup",
            Self::InspectCommits { .. } => "mutation target inspection",
            Self::PruneCandidates => "empty change candidate inspection",
        }
    }

    fn args(&self) -> Vec<OsString> {
        match self {
            Self::Version => vec!["--version".into()],
            Self::Log => [
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                "ancestors(visible_heads())",
                "-n",
                HISTORY_CHANGE_LIMIT,
                "-T",
                LOG_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::WorkingCopyFileCount => [
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                "@",
                "-T",
                "self.diff().files().len() ++ \"\\n\"",
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::Workspaces => [
                "--ignore-working-copy",
                "workspace",
                "list",
                "-T",
                WORKSPACE_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::WorkspaceRoot => ["--ignore-working-copy", "root"]
                .into_iter()
                .map(OsString::from)
                .collect(),
            Self::WorkspaceRootByName { name } => [
                "--ignore-working-copy",
                "workspace",
                "root",
                "--name",
                name.as_str(),
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::ChangeDetails { commit_id } => [
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                commit_id,
                "-T",
                CHANGE_DETAILS_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::RevisionTree { commit_id, path } => {
                let mut args = [
                    "--ignore-working-copy",
                    "file",
                    "list",
                    "-r",
                    commit_id.as_str(),
                    "-T",
                    REVISION_TREE_TEMPLATE,
                ]
                .into_iter()
                .map(OsString::from)
                .collect::<Vec<_>>();
                if let Some(path) = path {
                    args.push("--".into());
                    args.push(exact_file_fileset(path).into());
                }
                args
            }
            Self::RevisionFile { commit_id, path } => [
                "--ignore-working-copy".into(),
                "file".into(),
                "show".into(),
                "-r".into(),
                commit_id.into(),
                "--".into(),
                exact_file_fileset(path).into(),
            ]
            .into_iter()
            .collect(),
            Self::FileHistory { commit_id, path } => [
                "--ignore-working-copy".into(),
                "log".into(),
                "--no-graph".into(),
                "--color".into(),
                "never".into(),
                "-r".into(),
                format!("ancestors({commit_id})").into(),
                "-n".into(),
                FILE_HISTORY_LIMIT.into(),
                "-T".into(),
                FILE_HISTORY_TEMPLATE.into(),
                "--".into(),
                exact_file_fileset(path).into(),
            ]
            .into_iter()
            .collect(),
            Self::FileAnnotation { commit_id, path } => [
                "--ignore-working-copy".into(),
                "file".into(),
                "annotate".into(),
                "-r".into(),
                commit_id.into(),
                "-T".into(),
                FILE_ANNOTATION_TEMPLATE.into(),
                "--".into(),
                path.into(),
            ]
            .into_iter()
            .collect(),
            Self::Diff {
                commit_id,
                path,
                whitespace_mode,
            } => {
                let fileset = exact_file_fileset(path);
                let mut args = vec![
                    "--ignore-working-copy".into(),
                    "diff".into(),
                    "--color".into(),
                    "never".into(),
                    "-r".into(),
                    commit_id.into(),
                    "--git".into(),
                    "--context".into(),
                    "3".into(),
                ];
                if *whitespace_mode == WhitespaceMode::IgnoreAll {
                    args.push("--ignore-all-space".into());
                }
                args.push("--".into());
                args.push(fileset.into());
                args
            }
            Self::SyncMetric(metric) => [
                "--ignore-working-copy",
                "log",
                "--color",
                "never",
                "--count",
                "-r",
                metric.revset(),
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::OperationLog => [
                "--at-op=@",
                "--ignore-working-copy",
                "op",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-n",
                "20",
                "-T",
                OPERATION_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::OperationId => [
                "--at-op=@",
                "--ignore-working-copy",
                "op",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-n",
                "1",
                "-T",
                "id ++ \"\\n\"",
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
            Self::InspectCommits { commit_ids } => {
                let revset = commit_ids.join("|");
                [
                    "--ignore-working-copy",
                    "log",
                    "--no-graph",
                    "--color",
                    "never",
                    "-r",
                    &revset,
                    "-T",
                    "commit_id ++ \"\\n\"",
                ]
                .into_iter()
                .map(OsString::from)
                .collect()
            }
            Self::PruneCandidates => [
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                PRUNE_CANDIDATE_REVSET,
                "-T",
                PRUNE_CANDIDATE_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
            .collect(),
        }
    }
}

fn mutation_args(
    intent: &MutationIntent,
    candidates: &[MutationCandidate],
) -> Result<Vec<OsString>, DriverError> {
    intent.validate().map_err(mutation_validation_error)?;
    let values = match intent {
        MutationIntent::New { parent_commit_ids } => std::iter::once("new".to_owned())
            .chain(std::iter::once("--".to_owned()))
            .chain(parent_commit_ids.iter().cloned())
            .collect(),
        MutationIntent::Edit { target_commit_id } => {
            vec!["edit".into(), target_commit_id.clone()]
        }
        MutationIntent::Describe {
            target_commit_id,
            message,
        } => vec![
            "describe".into(),
            target_commit_id.clone(),
            "--message".into(),
            message.clone(),
        ],
        MutationIntent::Fetch { remote } => {
            let mut values = vec!["git".into(), "fetch".into()];
            if let Some(remote) = remote {
                values.extend(["--remote".into(), format!("exact:{remote}")]);
            } else {
                values.push("--all-remotes".into());
            }
            values
        }
        MutationIntent::Rebase {
            source_commit_id,
            destination_commit_id,
        } => vec![
            "rebase".into(),
            "--revisions".into(),
            source_commit_id.clone(),
            "--onto".into(),
            destination_commit_id.clone(),
        ],
        MutationIntent::Squash {
            source_commit_id,
            destination_commit_id,
        } => vec![
            "squash".into(),
            "--from".into(),
            source_commit_id.clone(),
            "--into".into(),
            destination_commit_id.clone(),
            "--use-destination-message".into(),
        ],
        MutationIntent::Split {
            source_commit_id,
            paths,
            message,
        } => {
            let mut values = vec![
                "split".into(),
                "--revision".into(),
                source_commit_id.clone(),
                "--message".into(),
                message.clone(),
                "--".into(),
            ];
            values.extend(paths.iter().map(|path| exact_file_fileset(path)));
            values
        }
        MutationIntent::Abandon { target_commit_ids } => std::iter::once("abandon".to_owned())
            .chain(std::iter::once("--".to_owned()))
            .chain(target_commit_ids.iter().cloned())
            .collect(),
        MutationIntent::PruneEmpty => {
            if candidates.is_empty() {
                return Err(DriverError {
                    kind: DriverErrorKind::InvalidRepository,
                    message: "there are no unreferenced empty changes to prune".into(),
                });
            }
            std::iter::once("abandon".to_owned())
                .chain(std::iter::once("--".to_owned()))
                .chain(
                    candidates
                        .iter()
                        .map(|candidate| candidate.commit_id.clone()),
                )
                .collect()
        }
        MutationIntent::RemoveWorkspace { name } => vec![
            "workspace".into(),
            "forget".into(),
            "--".into(),
            name.clone(),
        ],
        MutationIntent::Undo { .. } => vec!["undo".into()],
        MutationIntent::Redo { .. } => vec!["redo".into()],
        MutationIntent::BookmarkMove {
            name,
            target_commit_id,
        } => vec![
            "bookmark".into(),
            "set".into(),
            "--allow-backwards".into(),
            "--revision".into(),
            target_commit_id.clone(),
            "--".into(),
            name.clone(),
        ],
        MutationIntent::Push { name, remote } => vec![
            "git".into(),
            "push".into(),
            "--remote".into(),
            remote.clone(),
            "--bookmark".into(),
            format!("exact:{name}"),
        ],
    };
    Ok(values.into_iter().map(OsString::from).collect())
}

#[derive(Debug, Deserialize)]
struct LogRecord {
    change_id: String,
    commit_id: String,
    summary: String,
    description: String,
    author: String,
    author_email: String,
    author_timestamp: String,
    committer: String,
    committer_email: String,
    committer_timestamp: String,
    updated_at: String,
    local_bookmarks: Vec<LogBookmarkRecord>,
    remote_bookmarks: Vec<LogBookmarkRecord>,
    parents: String,
    parent_commit_ids: String,
    files: String,
    conflict: bool,
    working_copy: bool,
    #[serde(default)]
    workspace_copies: Vec<String>,
    empty: bool,
}

#[derive(Debug, Deserialize)]
struct WorkspaceRecord {
    name: String,
    current_hint: bool,
    change_id: String,
    commit_id: String,
    summary: String,
    updated_at: String,
    empty: bool,
    conflict: bool,
    file_count: usize,
}

fn parse_workspaces(bytes: &[u8], current_root: &str) -> Result<Vec<WorkspaceRow>, DriverError> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| invalid_output("workspace inventory was not UTF-8"))?;
    let mut workspaces = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str::<WorkspaceRecord>(line)
                .map_err(|_| invalid_output("workspace inventory template returned invalid JSONL"))
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|record| WorkspaceRow {
            current: record.current_hint,
            name: record.name,
            root: if record.current_hint {
                current_root.to_owned()
            } else {
                String::new()
            },
            change_id: record.change_id,
            commit_id: record.commit_id,
            summary: record.summary,
            updated_at: record.updated_at,
            empty: record.empty,
            conflict: record.conflict,
            file_count: record.file_count,
        })
        .collect::<Vec<_>>();
    workspaces.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(workspaces)
}

#[derive(Debug, Deserialize)]
struct LogBookmarkRecord {
    name: String,
    #[serde(default)]
    remote: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OperationRecord {
    id: String,
    description: String,
    started_at: String,
    snapshot: bool,
}

fn parse_single_line(stdout: &[u8], label: &str) -> Result<String, DriverError> {
    let lines = parse_lines(stdout);
    if lines.len() != 1 {
        return Err(invalid_output(&format!("jj returned an invalid {label}")));
    }
    let value = lines.into_iter().next().expect("one line was checked");
    if !(12..=128).contains(&value.len()) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid_output(&format!("jj returned an invalid {label}")));
    }
    Ok(value)
}

fn parse_single_text_line(stdout: &[u8], label: &str) -> Result<String, DriverError> {
    let lines = parse_lines(stdout);
    if lines.len() != 1 {
        return Err(invalid_output(&format!("jj returned an invalid {label}")));
    }
    let value = lines.into_iter().next().expect("one line was checked");
    if value.chars().any(char::is_control) {
        return Err(invalid_output(&format!("jj returned an invalid {label}")));
    }
    Ok(value)
}

fn parse_lines(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

fn parse_prune_candidates(stdout: &[u8]) -> Result<Vec<MutationCandidate>, DriverError> {
    let mut candidates = stdout
        .split(|byte| *byte == b'\n')
        .filter(|line| !line.is_empty())
        .map(|line| {
            serde_json::from_slice::<MutationCandidate>(line).map_err(|error| {
                invalid_output(&format!(
                    "jj returned invalid empty-change candidates: {error}"
                ))
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    candidates.sort_by(|left, right| left.commit_id.cmp(&right.commit_id));
    Ok(candidates)
}

fn mutation_validation_error(error: MutationValidationError) -> DriverError {
    DriverError {
        kind: DriverErrorKind::InvalidRepository,
        message: error.to_string(),
    }
}

fn parse_capability(stdout: &[u8]) -> Result<JjCapability, DriverError> {
    let text =
        std::str::from_utf8(stdout).map_err(|_| invalid_output("jj version was not UTF-8"))?;
    let version = text
        .split_whitespace()
        .find_map(|part| Version::parse(part.trim_start_matches('v')).ok())
        .ok_or_else(|| invalid_output("jj version could not be parsed"))?;
    let minimum = Version::parse(MINIMUM_JJ_VERSION).expect("minimum jj version must be valid");
    Ok(JjCapability {
        detected_version: version.to_string(),
        minimum_version: minimum.to_string(),
        supported: version >= minimum,
    })
}

fn parse_operation_log(stdout: &[u8]) -> Result<Vec<OperationRow>, DriverError> {
    let text =
        std::str::from_utf8(stdout).map_err(|_| invalid_output("operation log was not UTF-8"))?;
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .enumerate()
        .map(|(index, line)| {
            let record: OperationRecord = serde_json::from_str(line)
                .map_err(|_| invalid_output("operation log template returned invalid JSONL"))?;
            let current = index == 0;
            let undo_eligible = current
                && !record.description.trim().is_empty()
                && !record.description.starts_with("initialize repo");
            Ok(OperationRow {
                id: record.id,
                description: record.description,
                started_at: record.started_at,
                snapshot: record.snapshot,
                current,
                undo_eligible,
            })
        })
        .collect()
}

fn redo_is_available(operations: &[OperationRow]) -> bool {
    let Some(current) = operations.first() else {
        return false;
    };
    if current
        .description
        .starts_with("undo: restore to operation ")
    {
        return true;
    }
    let Some(target) = current
        .description
        .strip_prefix("redo: restore to operation ")
        .and_then(|description| description.split_whitespace().next())
    else {
        return false;
    };
    operations.iter().any(|operation| {
        operation.id.starts_with(target)
            && operation
                .description
                .starts_with("undo: restore to operation ")
    })
}

fn parse_log(stdout: &[u8]) -> Result<Vec<ChangeRow>, DriverError> {
    let text = std::str::from_utf8(stdout).map_err(|_| invalid_output("jj log was not UTF-8"))?;
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let record: LogRecord = serde_json::from_str(line)
                .map_err(|_| invalid_output("jj log template returned invalid JSONL"))?;
            Ok(ChangeRow {
                change_id: record.change_id,
                commit_id: record.commit_id,
                summary: record.summary,
                description: record.description,
                author: record.author,
                author_email: record.author_email,
                author_timestamp: record.author_timestamp,
                committer: record.committer,
                committer_email: record.committer_email,
                committer_timestamp: record.committer_timestamp,
                updated_at: record.updated_at,
                bookmarks: record
                    .local_bookmarks
                    .into_iter()
                    .map(|bookmark| BookmarkRef {
                        name: bookmark.name,
                        remote: None,
                    })
                    .chain(
                        record
                            .remote_bookmarks
                            .into_iter()
                            .map(|bookmark| BookmarkRef {
                                name: bookmark.name,
                                remote: bookmark.remote,
                            }),
                    )
                    .collect(),
                parents: split_non_empty(&record.parents, ','),
                parent_commit_ids: split_non_empty(&record.parent_commit_ids, ','),
                files: parse_files(&record.files),
                conflict: record.conflict,
                working_copy: record.working_copy,
                workspace_copies: record.workspace_copies,
                empty: record.empty,
            })
        })
        .collect()
}

fn parse_remote_directories(stdout: &[u8]) -> Result<RemoteDirectoryListing, DriverError> {
    let mut fields = stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let path = fields.next().ok_or_else(|| {
        invalid_output("remote directory listing did not include its current path")
    })?;
    let path = std::str::from_utf8(path)
        .map_err(|_| invalid_output("remote directory path was not UTF-8"))?
        .to_owned();
    if !path.starts_with('/') || path.chars().any(char::is_control) {
        return Err(invalid_output(
            "remote directory listing returned an invalid current path",
        ));
    }
    let mut directories = fields
        .map(|field| {
            std::str::from_utf8(field)
                .map_err(|_| invalid_output("remote child directory was not UTF-8"))
                .map(ToOwned::to_owned)
        })
        .collect::<Result<Vec<_>, _>>()?;
    directories
        .retain(|directory| directory.starts_with('/') && !directory.chars().any(char::is_control));
    directories.sort_by_key(|directory| directory.to_ascii_lowercase());
    directories.dedup();
    let parent = remote_parent(&path);
    Ok(RemoteDirectoryListing {
        path,
        parent,
        directories,
    })
}

fn remote_parent(path: &str) -> Option<String> {
    if path == "/" {
        return None;
    }
    let trimmed = path.trim_end_matches('/');
    let index = trimmed.rfind('/')?;
    Some(if index == 0 {
        "/".into()
    } else {
        trimmed[..index].into()
    })
}

fn split_non_empty(value: &str, separator: char) -> Vec<String> {
    value
        .split(separator)
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_files(value: &str) -> Vec<ChangedFile> {
    value
        .lines()
        .filter_map(|line| {
            let mut fields = line.splitn(3, '\t');
            let status = fields.next()?;
            let path = fields.next()?;
            let display_path = fields.next().unwrap_or(path);
            Some(ChangedFile {
                status: status.into(),
                path: path.into(),
                display_path: display_path.into(),
            })
        })
        .collect()
}

fn parse_json_lines<T: for<'de> Deserialize<'de>>(
    stdout: &[u8],
    label: &str,
    allow_incomplete_final_line: bool,
) -> Result<Vec<T>, DriverError> {
    let text = std::str::from_utf8(stdout)
        .map_err(|_| invalid_output(&format!("{label} output was not UTF-8")))?;
    let mut lines = text.split_inclusive('\n').peekable();
    let mut parsed = Vec::new();
    while let Some(line) = lines.next() {
        if line.trim().is_empty() {
            continue;
        }
        if allow_incomplete_final_line && !line.ends_with('\n') && lines.peek().is_none() {
            break;
        }
        parsed.push(
            serde_json::from_str(line.trim_end_matches('\n'))
                .map_err(|_| invalid_output(&format!("{label} template returned invalid JSONL")))?,
        );
    }
    Ok(parsed)
}

fn decode_revision_file(stdout: &[u8], truncated: bool) -> (String, bool) {
    if stdout.contains(&0) {
        return (String::new(), true);
    }
    match std::str::from_utf8(stdout) {
        Ok(content) => (content.into(), false),
        Err(error) if truncated && error.error_len().is_none() => (
            String::from_utf8_lossy(&stdout[..error.valid_up_to()]).into_owned(),
            false,
        ),
        Err(_) => (String::new(), true),
    }
}

fn parse_count(stdout: &[u8], label: &str) -> Result<usize, DriverError> {
    let text = std::str::from_utf8(stdout)
        .map_err(|_| invalid_output(&format!("{label} count was not UTF-8")))?;
    text.trim()
        .parse()
        .map_err(|_| invalid_output(&format!("{label} count was invalid")))
}

fn parse_sync_status(
    remote_heads: &[u8],
    outgoing: &[u8],
    behind: &[u8],
) -> Result<SyncStatus, DriverError> {
    let remote_heads = parse_count(remote_heads, "remote head")?;
    Ok(SyncStatus {
        available: remote_heads > 0,
        remote_heads,
        outgoing: (remote_heads > 0)
            .then(|| parse_count(outgoing, "outgoing revision"))
            .transpose()?
            .unwrap_or(0),
        behind: (remote_heads > 0)
            .then(|| parse_count(behind, "behind revision"))
            .transpose()?
            .unwrap_or(0),
        basis: "lastFetched".into(),
    })
}

struct ParsedDiff {
    hunks: Vec<DiffHunk>,
    binary: bool,
    truncated: bool,
    additions: usize,
    deletions: usize,
}

fn parse_git_diff(stdout: &[u8], truncated: bool) -> Result<ParsedDiff, DriverError> {
    let text = String::from_utf8_lossy(stdout);
    let hunk_header =
        Regex::new(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@").expect("valid hunk header regex");
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut old_line = 0;
    let mut new_line = 0;
    let mut additions = 0;
    let mut deletions = 0;
    let mut binary = false;

    for raw_line in text.lines() {
        if raw_line.starts_with("Binary files ") || raw_line == "GIT binary patch" {
            binary = true;
        }
        if let Some(captures) = hunk_header.captures(raw_line) {
            old_line = captures[1]
                .parse()
                .map_err(|_| invalid_output("diff hunk old line was invalid"))?;
            new_line = captures[2]
                .parse()
                .map_err(|_| invalid_output("diff hunk new line was invalid"))?;
            hunks.push(DiffHunk {
                header: raw_line.into(),
                lines: Vec::new(),
            });
            continue;
        }
        let Some(hunk) = hunks.last_mut() else {
            continue;
        };
        let (kind, old_number, new_number, content) =
            if let Some(content) = raw_line.strip_prefix('+') {
                let line = (DiffLineKind::Addition, None, Some(new_line), content);
                new_line += 1;
                additions += 1;
                line
            } else if let Some(content) = raw_line.strip_prefix('-') {
                let line = (DiffLineKind::Deletion, Some(old_line), None, content);
                old_line += 1;
                deletions += 1;
                line
            } else if let Some(content) = raw_line.strip_prefix(' ') {
                let line = (
                    DiffLineKind::Context,
                    Some(old_line),
                    Some(new_line),
                    content,
                );
                old_line += 1;
                new_line += 1;
                line
            } else {
                (DiffLineKind::Metadata, None, None, raw_line)
            };
        hunk.lines.push(DiffLine {
            kind,
            old_line: old_number,
            new_line: new_number,
            content: content.into(),
        });
    }

    Ok(ParsedDiff {
        hunks,
        binary,
        truncated,
        additions,
        deletions,
    })
}

fn valid_commit_id(value: &str) -> bool {
    (1..=64).contains(&value.len()) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn format_output_limit(output_limit: usize) -> String {
    const MEBIBYTE: usize = 1024 * 1024;
    if output_limit.is_multiple_of(MEBIBYTE) {
        format!("{} MiB", output_limit / MEBIBYTE)
    } else {
        format!("{output_limit} byte")
    }
}

fn valid_repository_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && !value.starts_with('/')
        && !value.chars().any(char::is_control)
        && value
            .split('/')
            .all(|component| !component.is_empty() && component != "." && component != "..")
}

fn exact_file_fileset(path: &str) -> String {
    let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
    format!("root-file:\"{escaped}\"")
}

fn invalid_output(message: &str) -> DriverError {
    DriverError {
        kind: DriverErrorKind::InvalidOutput,
        message: message.into(),
    }
}

fn process_error(repository: &RepositoryRecord, error: ProcessError) -> DriverError {
    let kind = match error.kind {
        ProcessFailureKind::Timeout => DriverErrorKind::Timeout,
        ProcessFailureKind::Cancelled => DriverErrorKind::Cancelled,
        ProcessFailureKind::Spawn | ProcessFailureKind::Wait => DriverErrorKind::Transport,
    };
    let message = match error.kind {
        ProcessFailureKind::Timeout => "repository refresh timed out".into(),
        ProcessFailureKind::Cancelled => "repository refresh was cancelled".into(),
        ProcessFailureKind::Spawn | ProcessFailureKind::Wait => error
            .detail
            .map(|detail| redact_error(&detail, &repository.location))
            .unwrap_or_else(|| "repository command could not be started".into()),
    };
    DriverError { kind, message }
}

pub(crate) fn redact_error(message: &str, location: &RepositoryLocation) -> String {
    let mut redacted = message.to_owned();
    match location {
        RepositoryLocation::Local { path } => {
            redacted = redacted.replace(path, "<repo-path>");
        }
        RepositoryLocation::Ssh { host, path } => {
            redacted = redacted.replace(host, "<ssh-host>");
            redacted = redacted.replace(path, "<repo-path>");
        }
    }
    let absolute_path = Regex::new(r"(?:/[A-Za-z0-9._+@~-]+){2,}").expect("valid path regex");
    let redacted = absolute_path.replace_all(&redacted, "<path>").into_owned();
    if redacted.is_empty() {
        "repository command failed without an error message".into()
    } else {
        redacted
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DriverErrorKind {
    InvalidRepository,
    UnsupportedJj,
    Transport,
    Timeout,
    Cancelled,
    CommandFailed,
    OutputLimit,
    InvalidOutput,
    StaleOperation,
}

#[derive(Debug, Eq, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverError {
    pub kind: DriverErrorKind,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote_repository() -> RepositoryRecord {
        RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Ssh {
                host: "fixture-host".into(),
                path: "~/work/fixture".into(),
            },
        )
        .unwrap()
    }

    #[test]
    fn version_probe_marks_supported_and_unsupported_versions() {
        assert!(parse_capability(b"jj 0.43.0\n").unwrap().supported);
        assert!(!parse_capability(b"jj 0.29.9\n").unwrap().supported);
    }

    #[test]
    fn jsonl_projection_preserves_machine_readable_fields() {
        let rows = parse_log(
            br#"{"change_id":"abc","commit_id":"def0123456789abcdef0123456789abcdef012345","summary":"feat: fixture","description":"feat: fixture\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>\n","author":"Agent","author_email":"agent@example.invalid","author_timestamp":"2026-01-01T00:00:00Z","committer":"Integrator","committer_email":"integrator@example.invalid","committer_timestamp":"2026-01-01T00:01:00Z","updated_at":"2026-01-01T00:01:00Z","local_bookmarks":[{"name":"main","target":[]}],"remote_bookmarks":[{"name":"main","remote":"origin","target":[]}],"parents":"parent","parent_commit_ids":"abc0123456789abcdef0123456789abcdef012345","files":"R\tsrc/main.rs\tsrc/{legacy.rs => main.rs}\nA\tREADME.md\tREADME.md","conflict":false,"working_copy":true,"workspace_copies":["default"],"empty":false}
"#,
        )
        .unwrap();

        assert_eq!(rows.len(), 1);
        assert!(rows[0].description.contains("Co-authored-by:"));
        assert_eq!(rows[0].author_email, "agent@example.invalid");
        assert_eq!(rows[0].committer, "Integrator");
        assert_eq!(rows[0].committer_email, "integrator@example.invalid");
        assert_eq!(
            rows[0].parent_commit_ids,
            vec!["abc0123456789abcdef0123456789abcdef012345"]
        );
        assert_eq!(
            rows[0].bookmarks,
            vec![
                BookmarkRef {
                    name: "main".into(),
                    remote: None,
                },
                BookmarkRef {
                    name: "main".into(),
                    remote: Some("origin".into()),
                },
            ]
        );
        assert_eq!(rows[0].files.len(), 2);
        assert_eq!(rows[0].files[0].path, "src/main.rs");
        assert_eq!(rows[0].files[0].display_path, "src/{legacy.rs => main.rs}");
        assert!(rows[0].working_copy);
        assert_eq!(rows[0].workspace_copies, vec!["default"]);
    }

    #[test]
    fn file_projection_keeps_legacy_paths_readable() {
        let files = parse_files("A\tREADME.md");

        assert_eq!(files[0].path, "README.md");
        assert_eq!(files[0].display_path, "README.md");
    }

    #[test]
    fn remote_directory_listing_preserves_current_parent_and_children() {
        let listing =
            parse_remote_directories(b"/srv/work\0/srv/work/zeta\0/srv/work/alpha\0").unwrap();

        assert_eq!(listing.path, "/srv/work");
        assert_eq!(listing.parent.as_deref(), Some("/srv"));
        assert_eq!(
            listing.directories,
            vec!["/srv/work/alpha", "/srv/work/zeta"]
        );
    }

    #[test]
    fn ssh_plan_keeps_host_path_and_query_in_separate_arguments() {
        let repository = remote_repository();
        let driver = JjDriver::default();
        let plan = driver.command_plan(&repository, JjQuery::Version);
        let args = plan
            .args
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(args.windows(2).any(|pair| pair == ["--", "fixture-host"]));
        assert!(args.windows(2).any(|pair| pair == ["sh", "-s"]));
        assert!(!args.iter().any(|arg| arg.contains("~/work/fixture")));
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();
        assert!(!script.contains("~/work/fixture"));
        assert!(script.contains("7e2f776f726b2f66697874757265"));
        assert!(script.contains("--version"));
        assert!(script.contains("$HOME/.cargo/bin/jj"));
    }

    #[test]
    fn local_git_initialization_is_explicit_and_colocated() {
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Local {
                path: "/fixtures/git-only".into(),
            },
        )
        .unwrap();
        let plan = JjDriver::default().initialization_plan(&repository);
        let args = plan
            .args
            .iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(plan.program, PathBuf::from("jj"));
        assert_eq!(plan.current_dir, Some(PathBuf::from("/fixtures/git-only")));
        assert_eq!(args, ["git", "init", "--colocate", "."]);
        assert!(plan.stdin.is_none());
    }

    #[test]
    fn remote_git_initialization_encodes_the_path_and_uses_a_fixed_command() {
        let repository = RepositoryRecord::new(
            "fixture",
            RepositoryLocation::Ssh {
                host: "fixture-host".into(),
                path: "~/work/private repository".into(),
            },
        )
        .unwrap();
        let plan = JjDriver::default().initialization_plan(&repository);
        let args = plan
            .args
            .iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();

        assert_eq!(plan.program, PathBuf::from("ssh"));
        assert!(args.windows(2).any(|pair| pair == ["--", "fixture-host"]));
        assert!(!script.contains("~/work/private repository"));
        assert!(script.contains(&encode_hex("~/work/private repository")));
        assert!(script.contains("cd \"$repo\""));
        assert!(script.contains("exec \"$jj_bin\" git init --colocate ."));
    }

    #[test]
    fn command_errors_redact_location_details() {
        let repository = remote_repository();
        let message = redact_error(
            "fixture-host: ~/work/fixture failed beside /home/tester/private/file",
            &repository.location,
        );

        assert!(!message.contains("fixture-host"));
        assert!(!message.contains("~/work/fixture"));
        assert!(!message.contains("/home/tester/private/file"));
        assert!(message.contains("<ssh-host>"));
        assert!(message.contains("<repo-path>"));
    }

    #[tokio::test]
    async fn workspace_directory_safety_rejects_current_and_ancestor_targets() {
        let directory = tempfile::tempdir().unwrap();
        let current = directory.path().join("current");
        let sibling = directory.path().join("sibling");
        let linked = directory.path().join("linked");
        tokio::fs::create_dir_all(&current).await.unwrap();
        tokio::fs::create_dir_all(&sibling).await.unwrap();
        std::os::unix::fs::symlink(&sibling, &linked).unwrap();

        assert!(
            validate_local_workspace_removal(current.to_str().unwrap(), current.to_str().unwrap(),)
                .await
                .is_err()
        );
        assert!(
            validate_local_workspace_removal(
                directory.path().to_str().unwrap(),
                current.to_str().unwrap(),
            )
            .await
            .is_err()
        );
        assert!(
            validate_local_workspace_removal(linked.to_str().unwrap(), current.to_str().unwrap(),)
                .await
                .is_err()
        );
        assert_eq!(
            validate_local_workspace_removal(sibling.to_str().unwrap(), current.to_str().unwrap(),)
                .await
                .unwrap(),
            sibling.canonicalize().unwrap(),
        );
    }

    #[test]
    fn remote_workspace_removal_encodes_targets_and_keeps_fixed_safety_guards() {
        let script = remote_workspace_removal_script(
            "~/private repository",
            "review workspace",
            "/private/review workspace",
            "0123456789abcdef0123456789abcdef01234567",
        );

        assert!(!script.contains("~/private repository"));
        assert!(!script.contains("review workspace"));
        assert!(!script.contains("/private/review workspace"));
        assert!(script.contains(&encode_hex("~/private repository")));
        assert!(script.contains(&encode_hex("review workspace")));
        assert!(script.contains(&encode_hex("/private/review workspace")));
        assert!(script.contains(&encode_hex("0123456789abcdef0123456789abcdef01234567")));
        assert!(script.contains("workspace forget -- \"$workspace\""));
        assert!(script.contains("abandon \"$expected_commit\""));
        assert!(script.contains("rm -rf -- \"$target_root\""));
        assert!(script.contains("the current workspace cannot be removed"));
    }

    #[test]
    fn git_diff_parser_preserves_line_numbers_and_change_counts() {
        let diff = parse_git_diff(
            b"diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -2,3 +2,4 @@ section\n same\n-old\n+new\n+more\n tail\n\\ No newline at end of file\n",
            false,
        )
        .unwrap();

        assert_eq!(diff.additions, 2);
        assert_eq!(diff.deletions, 1);
        assert_eq!(diff.hunks.len(), 1);
        assert_eq!(diff.hunks[0].lines[1].old_line, Some(3));
        assert_eq!(diff.hunks[0].lines[2].new_line, Some(3));
        assert_eq!(diff.hunks[0].lines[3].new_line, Some(4));
        assert_eq!(diff.hunks[0].lines[5].kind, DiffLineKind::Metadata);
    }

    #[test]
    fn git_diff_parser_reports_binary_and_bounded_output_states() {
        let diff = parse_git_diff(
            b"diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n",
            true,
        )
        .unwrap();

        assert!(diff.binary);
        assert!(diff.truncated);
        assert!(diff.hunks.is_empty());
    }

    #[test]
    fn diff_plan_keeps_revision_and_path_out_of_the_ssh_script_source() {
        let repository = remote_repository();
        let driver = JjDriver::default();
        let path = "folder/file with spaces.txt";
        let plan = driver.command_plan(
            &repository,
            JjQuery::Diff {
                commit_id: "012345abcdef".into(),
                path: path.into(),
                whitespace_mode: WhitespaceMode::IgnoreAll,
            },
        );
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();
        let encoded_fileset = encode_hex(&exact_file_fileset(path));

        assert!(!script.contains(path));
        assert!(!script.contains("012345abcdef"));
        assert!(script.contains(&encoded_fileset));
        assert!(script.contains("--ignore-all-space"));
        assert!(script.contains("\"$fileset\""));
    }

    #[test]
    fn diff_plan_uses_an_exact_escaped_fileset_for_repository_paths() {
        let path = r#"docs/file => "quoted"\name.md"#;
        let query = JjQuery::Diff {
            commit_id: "012345abcdef".into(),
            path: path.into(),
            whitespace_mode: WhitespaceMode::Preserve,
        };
        let args = query
            .args()
            .into_iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            args.last().map(String::as_str),
            Some(r#"root-file:"docs/file => \"quoted\"\\name.md""#)
        );
        assert!(!args.iter().any(|arg| arg == path));
    }

    #[test]
    fn revision_file_queries_keep_exact_paths_in_structured_arguments() {
        let path = r#"docs/file => \"quoted\"\\name.md"#;
        let tree_args = JjQuery::RevisionTree {
            commit_id: "012345abcdef".into(),
            path: Some(path.into()),
        }
        .args()
        .into_iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let history_args = JjQuery::FileHistory {
            commit_id: "012345abcdef".into(),
            path: path.into(),
        }
        .args()
        .into_iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let annotation_args = JjQuery::FileAnnotation {
            commit_id: "012345abcdef".into(),
            path: path.into(),
        }
        .args()
        .into_iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

        assert_eq!(
            tree_args.last().map(String::as_str),
            Some(r#"root-file:"docs/file => \\\"quoted\\\"\\\\name.md""#)
        );
        assert_eq!(history_args.last(), tree_args.last());
        assert!(
            history_args
                .windows(2)
                .any(|pair| pair == ["-r", "ancestors(012345abcdef)"])
        );
        assert_eq!(annotation_args.last().map(String::as_str), Some(path));
    }

    #[test]
    fn remote_annotation_query_encodes_revision_and_path() {
        let repository = remote_repository();
        let path = "folder/file with spaces.txt";
        let plan = JjDriver::default().command_plan(
            &repository,
            JjQuery::FileAnnotation {
                commit_id: "012345abcdef".into(),
                path: path.into(),
            },
        );
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();

        assert!(!script.contains(path));
        assert!(!script.contains("012345abcdef"));
        assert!(script.contains(&encode_hex(path)));
        assert!(script.contains(&encode_hex("012345abcdef")));
        assert!(script.contains("file annotate"));
        assert!(script.contains("\"$path\""));
    }

    #[test]
    fn bounded_jsonl_parser_keeps_complete_records_only() {
        let output = concat!(
            "{\"path\":\"README.md\",\"fileType\":\"file\",",
            "\"conflict\":false,\"executable\":false,\"status\":null}\n",
            "{\"path\":\"src/partial"
        );
        let entries =
            parse_json_lines::<RevisionTreeEntry>(output.as_bytes(), "revision tree", true)
                .unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "README.md");
        assert!(
            parse_json_lines::<RevisionTreeEntry>(output.as_bytes(), "revision tree", false,)
                .is_err()
        );
    }

    #[test]
    fn revision_file_decode_distinguishes_binary_and_partial_utf8() {
        assert_eq!(
            decode_revision_file(b"plain text\n", false),
            ("plain text\n".into(), false)
        );
        assert_eq!(
            decode_revision_file(b"image\0data", false),
            (String::new(), true)
        );
        let (partial, binary) = decode_revision_file(b"hello \xe2\x82", true);
        assert_eq!(partial, "hello ");
        assert!(!binary);
    }

    #[test]
    fn graph_projection_defers_file_metadata_to_selected_change_details() {
        assert!(!LOG_TEMPLATE.contains("self.diff().files()"));
        assert!(CHANGE_DETAILS_TEMPLATE.contains("f.path()"));
        assert!(CHANGE_DETAILS_TEMPLATE.contains("f.display_diff_path()"));
        let args = JjQuery::Log
            .args()
            .into_iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert!(args.windows(2).any(|pair| pair == ["-n", "200"]));
        assert!(
            args.windows(2)
                .any(|pair| pair == ["-r", "ancestors(visible_heads())"])
        );
        assert_eq!(format_output_limit(DEFAULT_OUTPUT_LIMIT), "1 MiB");
        assert_eq!(format_output_limit(CHANGE_DETAILS_OUTPUT_LIMIT), "4 MiB");
    }

    #[test]
    fn working_copy_file_count_is_a_separate_bounded_query() {
        let args = JjQuery::WorkingCopyFileCount
            .args()
            .into_iter()
            .map(|value| value.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            args,
            [
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                "@",
                "-T",
                "self.diff().files().len() ++ \"\\n\"",
            ]
        );

        let script = remote_script("~/projects/repository", JjQuery::WorkingCopyFileCount);
        assert!(script.contains("self.diff().files().len()"));
        assert!(script.contains("--repository \"$repo\""));
    }

    #[test]
    fn workspace_projection_marks_the_current_root_without_losing_cleanup_context() {
        let workspaces = parse_workspaces(
            br#"{"name":"review","current_hint":false,"change_id":"abc","commit_id":"0123456789abcdef0123456789abcdef01234567","summary":"","updated_at":"2026-01-01T00:00:00Z","empty":true,"conflict":false,"file_count":0}
{"name":"default","current_hint":true,"change_id":"def","commit_id":"89abcdef0123456789abcdef0123456789abcdef","summary":"feat: current","updated_at":"2026-01-02T00:00:00Z","empty":false,"conflict":true,"file_count":3}
"#,
            "/fixtures/current",
        )
        .unwrap();

        assert_eq!(workspaces[0].name, "default");
        assert!(workspaces[0].current);
        assert!(workspaces[0].conflict);
        assert_eq!(workspaces[1].name, "review");
        assert!(workspaces[1].empty);
        assert!(workspaces[1].root.is_empty());
    }

    #[test]
    fn workspace_inventory_template_never_serializes_the_fallible_root_keyword() {
        assert!(!WORKSPACE_TEMPLATE.contains("root.escape_json"));
        assert!(WORKSPACE_TEMPLATE.contains("current_working_copy"));
    }

    #[test]
    fn named_workspace_root_queries_keep_the_name_as_one_argument() {
        let args = JjQuery::WorkspaceRootByName {
            name: "review workspace".into(),
        }
        .args()
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

        assert_eq!(
            args,
            vec![
                "--ignore-working-copy",
                "workspace",
                "root",
                "--name",
                "review workspace",
            ]
        );

        let script = remote_script(
            "~/projects/repository",
            JjQuery::WorkspaceRootByName {
                name: "review workspace".into(),
            },
        );
        assert!(script.contains("workspace=$(decode_hex"));
        assert!(script.contains("workspace root --name \"$workspace\""));
        assert!(!script.contains("review workspace"));
    }

    #[test]
    fn diff_selectors_reject_parent_traversal_and_non_commit_revisions() {
        assert!(valid_commit_id("012345abcdef"));
        assert!(!valid_commit_id("main"));
        assert!(valid_repository_path("src/main.rs"));
        assert!(!valid_repository_path("../outside"));
        assert!(!valid_repository_path("/absolute/path"));
    }

    #[test]
    fn sync_projection_distinguishes_last_fetched_ahead_and_behind_state() {
        let status = parse_sync_status(b"2\n", b"4\n", b"3\n").unwrap();

        assert!(status.available);
        assert_eq!(status.remote_heads, 2);
        assert_eq!(status.outgoing, 4);
        assert_eq!(status.behind, 3);
        assert_eq!(status.basis, "lastFetched");

        let without_remote = parse_sync_status(b"0\n", b"8\n", b"9\n").unwrap();
        assert!(!without_remote.available);
        assert_eq!(without_remote.outgoing, 0);
        assert_eq!(without_remote.behind, 0);
    }

    #[test]
    fn operation_projection_marks_only_the_latest_meaningful_step_as_undo_eligible() {
        let operations = parse_operation_log(
            br#"{"id":"current","description":"new empty commit","started_at":"2026-01-02T03:04:05Z","snapshot":false}
{"id":"snapshot","description":"snapshot working copy","started_at":"2026-01-02T03:03:05Z","snapshot":true}
"#,
        )
        .unwrap();

        assert!(operations[0].current);
        assert!(operations[0].undo_eligible);
        assert!(!operations[1].current);
        assert!(!operations[1].undo_eligible);

        let latest_snapshot = parse_operation_log(
            br#"{"id":"snapshot","description":"snapshot working copy","started_at":"2026-01-02T03:04:05Z","snapshot":true}
{"id":"previous","description":"new empty commit","started_at":"2026-01-02T03:03:05Z","snapshot":false}
"#,
        )
        .unwrap();
        assert!(latest_snapshot[0].undo_eligible);
    }

    #[test]
    fn operation_projection_exposes_editor_style_redo_steps() {
        let after_undo = parse_operation_log(
            br#"{"id":"undo-current","description":"undo: restore to operation previous","started_at":"2026-01-02T03:04:05Z","snapshot":false}
{"id":"previous","description":"new empty commit","started_at":"2026-01-02T03:03:05Z","snapshot":false}
"#,
        )
        .unwrap();
        assert!(redo_is_available(&after_undo));

        let after_partial_redo = parse_operation_log(
            br#"{"id":"redo-current","description":"redo: restore to operation undo-step","started_at":"2026-01-02T03:04:05Z","snapshot":false}
{"id":"undo-step","description":"undo: restore to operation previous","started_at":"2026-01-02T03:03:05Z","snapshot":false}
{"id":"previous","description":"new empty commit","started_at":"2026-01-02T03:02:05Z","snapshot":false}
"#,
        )
        .unwrap();
        assert!(redo_is_available(&after_partial_redo));

        let exhausted_redo = parse_operation_log(
            br#"{"id":"redo-current","description":"redo: restore to operation previous","started_at":"2026-01-02T03:04:05Z","snapshot":false}
{"id":"previous","description":"new empty commit","started_at":"2026-01-02T03:03:05Z","snapshot":false}
"#,
        )
        .unwrap();
        assert!(!redo_is_available(&exhausted_redo));
    }

    #[test]
    fn operation_query_is_explicitly_read_only_for_ssh() {
        let repository = remote_repository();
        let plan = JjDriver::default().command_plan(&repository, JjQuery::OperationLog);
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();

        assert!(script.contains("--at-op=@ --ignore-working-copy op log"));
        assert!(script.contains("--no-graph"));
        assert!(!script.contains("~/work/fixture"));
    }

    #[test]
    fn mutation_arguments_are_structured_and_exact() {
        let source = "0123456789abcdef0123456789abcdef01234567";
        let destination = "89abcdef0123456789abcdef0123456789abcdef";
        let rebase = mutation_args(
            &MutationIntent::Rebase {
                source_commit_id: source.into(),
                destination_commit_id: destination.into(),
            },
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let split = mutation_args(
            &MutationIntent::Split {
                source_commit_id: source.into(),
                paths: vec!["docs/file with spaces.md".into()],
                message: "docs: split fixture".into(),
            },
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let push = mutation_args(
            &MutationIntent::Push {
                name: "feature/safe-shaping".into(),
                remote: "origin".into(),
            },
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        let remove_workspace = mutation_args(
            &MutationIntent::RemoveWorkspace {
                name: "review".into(),
            },
            &[],
        )
        .unwrap()
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

        assert_eq!(
            rebase,
            vec!["rebase", "--revisions", source, "--onto", destination]
        );
        assert_eq!(
            split.last().map(String::as_str),
            Some(r#"root-file:"docs/file with spaces.md""#)
        );
        assert_eq!(
            push,
            vec![
                "git",
                "push",
                "--remote",
                "origin",
                "--bookmark",
                "exact:feature/safe-shaping",
            ]
        );
        assert_eq!(
            remove_workspace,
            vec!["workspace", "forget", "--", "review"]
        );
    }

    #[test]
    fn ssh_mutation_script_contains_only_encoded_untrusted_values() {
        let repository = remote_repository();
        let target = "0123456789abcdef0123456789abcdef01234567";
        let message = "feat: describe remote fixture\n\nprivate-looking text stays data";
        let args = mutation_args(
            &MutationIntent::Describe {
                target_commit_id: target.into(),
                message: message.into(),
            },
            &[],
        )
        .unwrap();
        let plan = JjDriver::default().mutation_plan(&repository, args);
        let script = String::from_utf8(plan.stdin.unwrap()).unwrap();

        assert!(!script.contains("~/work/fixture"));
        assert!(!script.contains(target));
        assert!(!script.contains(message));
        assert!(script.contains(&encode_hex(target)));
        assert!(script.contains(&encode_hex(message)));
        assert!(script.contains("exec \"$jj_bin\" --repository \"$repo\""));
    }

    #[test]
    fn empty_pruning_query_protects_current_and_referenced_changes() {
        assert!(PRUNE_CANDIDATE_REVSET.contains("~working_copies()"));
        assert!(PRUNE_CANDIDATE_REVSET.contains("~root()"));
        assert!(PRUNE_CANDIDATE_REVSET.contains("mutable()"));
        assert!(PRUNE_CANDIDATE_REVSET.contains("~bookmarks()"));
        assert!(PRUNE_CANDIDATE_REVSET.contains("~remote_bookmarks()"));
    }
}
