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
    BookmarkRef, ChangeRow, ChangedFile, JjCapability, RemoteDirectoryListing, RepositoryLocation,
    RepositoryProjection, RepositoryRecord,
};
use crate::process::{CommandOutput, CommandPlan, ProcessError, ProcessFailureKind, run_command};

pub const MINIMUM_JJ_VERSION: &str = "0.30.0";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);
const LOG_TEMPLATE: &str = concat!(
    "\"{\" ++ ",
    "\"\\\"change_id\\\":\" ++ change_id.short(12).escape_json() ++ ",
    "\",\\\"commit_id\\\":\" ++ commit_id.short(12).escape_json() ++ ",
    "\",\\\"summary\\\":\" ++ description.first_line().escape_json() ++ ",
    "\",\\\"author\\\":\" ++ author.name().escape_json() ++ ",
    "\",\\\"updated_at\\\":\" ++ committer.timestamp().format(\"%Y-%m-%dT%H:%M:%S%:z\").escape_json() ++ ",
    "\",\\\"local_bookmarks\\\":\" ++ json(self.local_bookmarks()) ++ ",
    "\",\\\"remote_bookmarks\\\":\" ++ json(self.remote_bookmarks()) ++ ",
    "\",\\\"parents\\\":\" ++ stringify(parents.map(|p| p.change_id().short(12)).join(\",\")).escape_json() ++ ",
    "\",\\\"files\\\":\" ++ stringify(self.diff().files().map(|f| f.status_char() ++ \"\\t\" ++ f.display_diff_path()).join(\"\\n\")).escape_json() ++ ",
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

        let log_output = self
            .run_query(repository, JjQuery::Log, cancellation)
            .await?;
        let changes = parse_log(&log_output.stdout)?;
        let conflicts = changes.iter().filter(|change| change.conflict).count();
        let working_copy_has_changes = changes
            .iter()
            .find(|change| change.working_copy)
            .is_some_and(|change| !change.empty);

        Ok(RepositoryProjection {
            repository_id: repository.id.clone(),
            refreshed_at: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "unknown".into()),
            capability,
            changes,
            conflicts,
            working_copy_has_changes,
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
                args: query_args.into_iter().map(OsString::from).collect(),
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
    };
    format!(
        "set -eu\nencoded='{encoded_path}'\nrepo=''\nwhile [ -n \"$encoded\" ]; do\n  rest=${{encoded#??}}\n  byte=${{encoded%\"$rest\"}}\n  encoded=$rest\n  octal=$(printf '%03o' \"0x$byte\")\n  repo=\"$repo$(printf \"\\\\$octal\")\"\ndone\ncase \"$repo\" in\n  \"~/\"*) repo=\"$HOME/${{repo#??}}\" ;;\nesac\nfind_jj() {{\n  if command -v jj >/dev/null 2>&1; then\n    command -v jj\n    return 0\n  fi\n  for candidate in \"$HOME/.cargo/bin/jj\" \"$HOME/.local/bin/jj\" \"$HOME/.local/share/mise/shims/jj\" \"$HOME/.asdf/shims/jj\" \"$HOME/.proto/shims/jj\" \"$HOME/.local/share/aquaproj-aqua/bin/jj\" \"$HOME/.nix-profile/bin/jj\" /opt/homebrew/bin/jj /home/linuxbrew/.linuxbrew/bin/jj /nix/var/nix/profiles/default/bin/jj /run/current-system/sw/bin/jj /opt/bin/jj /snap/bin/jj /usr/local/bin/jj /usr/bin/jj; do\n    if [ -x \"$candidate\" ]; then\n      printf '%s\\n' \"$candidate\"\n      return 0\n    fi\n  done\n  return 127\n}}\njj_bin=$(find_jj) || {{\n  printf '%s\\n' 'jj executable was not found in the remote non-interactive environment' >&2\n  exit 127\n}}\n{command}\n"
    )
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

#[derive(Clone, Copy)]
enum JjQuery {
    Version,
    Log,
}

impl JjQuery {
    fn args(self) -> Vec<&'static str> {
        match self {
            Self::Version => vec!["--version"],
            Self::Log => vec![
                "--ignore-working-copy",
                "log",
                "--no-graph",
                "--color",
                "never",
                "-r",
                "ancestors(@, 40)",
                "-T",
                LOG_TEMPLATE,
            ],
        }
    }
}

#[derive(Debug, Deserialize)]
struct LogRecord {
    change_id: String,
    commit_id: String,
    summary: String,
    author: String,
    updated_at: String,
    local_bookmarks: Vec<LogBookmarkRecord>,
    remote_bookmarks: Vec<LogBookmarkRecord>,
    parents: String,
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
                author: record.author,
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
            let (status, path) = line.split_once('\t')?;
            Some(ChangedFile {
                status: status.into(),
                path: path.into(),
            })
        })
        .collect()
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
            br#"{"change_id":"abc","commit_id":"def","summary":"feat: fixture","author":"Agent","updated_at":"2026-01-01T00:00:00Z","local_bookmarks":[{"name":"main","target":[]}],"remote_bookmarks":[{"name":"main","remote":"origin","target":[]}],"parents":"parent","files":"M\tsrc/main.rs\nA\tREADME.md","conflict":false,"working_copy":true,"empty":false}
"#,
        )
        .unwrap();

        assert_eq!(rows.len(), 1);
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
        assert!(rows[0].working_copy);
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
}
