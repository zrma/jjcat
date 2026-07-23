use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

use regex::Regex;
use semver::Version;
use serde::Deserialize;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tokio_util::sync::CancellationToken;

use crate::domain::{
    BookmarkRef, ChangeRow, ChangedFile, DiffHunk, DiffLine, DiffLineKind, FileDiffProjection,
    JjCapability, OperationLogProjection, OperationRow, RemoteDirectoryListing, RepositoryLocation,
    RepositoryProjection, RepositoryRecord, SyncStatus, WhitespaceMode,
};
use crate::process::{
    CommandOutput, CommandPlan, ProcessError, ProcessFailureKind, run_command,
    run_command_with_limit,
};

pub const MINIMUM_JJ_VERSION: &str = "0.30.0";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);
const DIFF_OUTPUT_LIMIT: usize = 512 * 1024;
const NETWORK_REMOTE_HEADS: &str = r#"remote_bookmarks(remote=~exact:"git")"#;
const OUTGOING_REVISIONS: &str = r#"remote_bookmarks(remote=~exact:"git")..bookmarks()"#;
const BEHIND_REVISIONS: &str = r#"bookmarks()..remote_bookmarks(remote=~exact:"git")"#;
const OPERATION_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"id\\\":\" ++ id.short(12).escape_json() ++ ",
    "\",\\\"description\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"started_at\\\":\" ++ time.start().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"snapshot\\\":\" ++ if(snapshot, \"true\", \"false\") ++ \"}\\n\"",
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
    "\",\\\"files\\\":\" ++ stringify(self.diff().files().map(|f| f.status_char() ++ \"\\t\" ++ f.path() ++ \"\\t\" ++ f.display_diff_path()).join(\"\\n\")).escape_json() ++ ",
    "\",\\\"conflict\\\":\" ++ if(conflict, \"true\", \"false\") ++ ",
    "\",\\\"working_copy\\\":\" ++ if(current_working_copy, \"true\", \"false\") ++ ",
    "\",\\\"empty\\\":\" ++ if(empty, \"true\", \"false\") ++ \"}\\n\"",
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

        let (log_output, remote_heads, outgoing, behind) = tokio::try_join!(
            self.run_query(repository, JjQuery::Log, cancellation.child_token()),
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
                cancellation
            ),
        )?;
        let changes = parse_log(&log_output.stdout)?;
        let conflicts = changes.iter().filter(|change| change.conflict).count();
        let working_copy_has_changes = changes
            .iter()
            .find(|change| change.working_copy)
            .is_some_and(|change| !change.empty);
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
        let output = run_command(plan, self.timeout, cancellation)
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
        let output = run_command_with_limit(plan, self.timeout, cancellation, DIFF_OUTPUT_LIMIT)
            .await
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
        Ok(OperationLogProjection {
            repository_id: repository.id.clone(),
            operations,
            undo_target,
        })
    }

    async fn run_query(
        &self,
        repository: &RepositoryRecord,
        query: JjQuery,
        cancellation: CancellationToken,
    ) -> Result<CommandOutput, DriverError> {
        let plan = self.command_plan(repository, query);
        let output = run_command(plan, self.timeout, cancellation)
            .await
            .map_err(|error| process_error(repository, error))?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: "jj output exceeded the safe capture limit".into(),
            });
        }
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
            "exec \"$jj_bin\" --repository \"$repo\" --ignore-working-copy log --no-graph --color never -r 'ancestors(@, 40)' -T '{LOG_TEMPLATE}'"
        ),
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
    };
    format!(
        "set -eu\ndecode_hex() {{\n  encoded=$1\n  decoded=''\n  while [ -n \"$encoded\" ]; do\n    rest=${{encoded#??}}\n    byte=${{encoded%\"$rest\"}}\n    encoded=$rest\n    octal=$(printf '%03o' \"0x$byte\")\n    decoded=\"$decoded$(printf \"\\\\$octal\")\"\n  done\n  printf '%s' \"$decoded\"\n}}\nrepo=$(decode_hex '{encoded_path}')\ncase \"$repo\" in\n  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;\nesac\nfind_jj() {{\n  if command -v jj >/dev/null 2>&1; then\n    command -v jj\n    return 0\n  fi\n  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do\n    if [ -x \"$candidate\" ]; then\n      printf '%s\\n' \"$candidate\"\n      return 0\n    fi\n  done\n  return 127\n}}\njj_bin=$(find_jj) || {{\n  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2\n  exit 127\n}}\n{command}\n"
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
    Diff {
        commit_id: String,
        path: String,
        whitespace_mode: WhitespaceMode,
    },
    SyncMetric(SyncMetric),
    OperationLog,
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
                "ancestors(@, 40)",
                "-T",
                LOG_TEMPLATE,
            ]
            .into_iter()
            .map(OsString::from)
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
        }
    }
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
    empty: bool,
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
                && !record.snapshot
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

fn redact_error(message: &str, location: &RepositoryLocation) -> String {
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
            br#"{"change_id":"abc","commit_id":"def0123456789abcdef0123456789abcdef012345","summary":"feat: fixture","description":"feat: fixture\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>\n","author":"Agent","author_email":"agent@example.invalid","author_timestamp":"2026-01-01T00:00:00Z","committer":"Integrator","committer_email":"integrator@example.invalid","committer_timestamp":"2026-01-01T00:01:00Z","updated_at":"2026-01-01T00:01:00Z","local_bookmarks":[{"name":"main","target":[]}],"remote_bookmarks":[{"name":"main","remote":"origin","target":[]}],"parents":"parent","parent_commit_ids":"abc0123456789abcdef0123456789abcdef012345","files":"R\tsrc/main.rs\tsrc/{legacy.rs => main.rs}\nA\tREADME.md\tREADME.md","conflict":false,"working_copy":true,"empty":false}
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
    fn log_projection_separates_canonical_paths_from_rename_labels() {
        assert!(LOG_TEMPLATE.contains("f.path()"));
        assert!(LOG_TEMPLATE.contains("f.display_diff_path()"));
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
    fn operation_projection_only_marks_latest_non_snapshot_as_undo_eligible() {
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
}
