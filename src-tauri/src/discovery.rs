use std::collections::VecDeque;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::domain::{DiscoveredRepository, RepositoryLocation, RepositorySourceRecord};
use crate::driver::{DriverError, DriverErrorKind, redact_error};
use crate::process::{CommandPlan, run_remote_command};

const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_DISCOVERED_REPOSITORIES: usize = 500;
const EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    ".jj",
    "node_modules",
    "target",
    "vendor",
    "dist",
    "build",
];

#[derive(Clone, Debug)]
pub struct RepositoryDiscovery {
    ssh_program: PathBuf,
    timeout: Duration,
}

impl Default for RepositoryDiscovery {
    fn default() -> Self {
        Self {
            ssh_program: "ssh".into(),
            timeout: DISCOVERY_TIMEOUT,
        }
    }
}

impl RepositoryDiscovery {
    #[cfg(test)]
    fn with_ssh_program(ssh_program: PathBuf) -> Self {
        Self {
            ssh_program,
            timeout: DISCOVERY_TIMEOUT,
        }
    }

    pub async fn discover(
        &self,
        source: &RepositorySourceRecord,
        cancellation: CancellationToken,
    ) -> Result<Vec<DiscoveredRepository>, DriverError> {
        source.validate().map_err(invalid_source)?;
        match &source.location {
            RepositoryLocation::Local { path } => {
                let root = PathBuf::from(path);
                let scan_depth = source.scan_depth;
                tokio::task::spawn_blocking(move || discover_local(&root, scan_depth))
                    .await
                    .map_err(|_| transport_error("local repository discovery task failed"))?
            }
            RepositoryLocation::Ssh { host, path } => {
                self.discover_ssh(host, path, source.scan_depth, cancellation)
                    .await
            }
        }
    }

    async fn discover_ssh(
        &self,
        host: &str,
        root: &str,
        scan_depth: u8,
        cancellation: CancellationToken,
    ) -> Result<Vec<DiscoveredRepository>, DriverError> {
        let plan = CommandPlan {
            program: self.ssh_program.clone(),
            args: ssh_arguments(host),
            current_dir: None,
            stdin: Some(remote_discovery_script(root, scan_depth).into_bytes()),
        };
        let output = run_remote_command(plan, self.timeout, cancellation)
            .await
            .map_err(|_| transport_error("SSH repository discovery could not be started"))?;
        if output.truncated {
            return Err(DriverError {
                kind: DriverErrorKind::OutputLimit,
                message: "SSH repository discovery exceeded the safe capture limit".into(),
            });
        }
        if output.exit_code != Some(0) {
            let location = RepositoryLocation::Ssh {
                host: host.to_owned(),
                path: root.to_owned(),
            };
            let raw = String::from_utf8_lossy(&output.stderr);
            return Err(DriverError {
                kind: DriverErrorKind::CommandFailed,
                message: format!(
                    "SSH repository discovery failed: {}",
                    compact_error(&redact_error(raw.trim(), &location))
                ),
            });
        }
        parse_remote_discovery(&output.stdout, host, root)
    }
}

fn discover_local(root: &Path, scan_depth: u8) -> Result<Vec<DiscoveredRepository>, DriverError> {
    if !root.is_dir() {
        return Err(DriverError {
            kind: DriverErrorKind::InvalidRepository,
            message: "local repository source folder is not available".into(),
        });
    }
    let mut pending = VecDeque::from([(root.to_path_buf(), 0_u8)]);
    let mut discovered = Vec::new();
    while let Some((directory, depth)) = pending.pop_front() {
        if depth >= scan_depth {
            continue;
        }
        let entries = std::fs::read_dir(&directory).map_err(|_| DriverError {
            kind: DriverErrorKind::Transport,
            message: "local repository source could not be read".into(),
        })?;
        let mut children = entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let file_type = entry.file_type().ok()?;
                if !file_type.is_dir() || file_type.is_symlink() {
                    return None;
                }
                let name = entry.file_name().into_string().ok()?;
                if excluded_directory(&name) {
                    return None;
                }
                Some((name, entry.path()))
            })
            .collect::<Vec<_>>();
        children.sort_by_key(|(name, _)| name.to_ascii_lowercase());
        for (_, child) in children {
            let child_depth = depth + 1;
            if child.join(".jj").is_dir() {
                if let Some(repository) = local_discovered_repository(root, &child) {
                    discovered.push(repository);
                }
                if discovered.len() >= MAX_DISCOVERED_REPOSITORIES {
                    return Ok(discovered);
                }
                continue;
            }
            if child_depth < scan_depth {
                pending.push_back((child, child_depth));
            }
        }
    }
    discovered.sort_by(|left, right| {
        left.relative_path
            .to_ascii_lowercase()
            .cmp(&right.relative_path.to_ascii_lowercase())
    });
    Ok(discovered)
}

fn local_discovered_repository(root: &Path, repository: &Path) -> Option<DiscoveredRepository> {
    let relative = repository.strip_prefix(root).ok()?;
    let relative_path = path_to_portable(relative)?;
    let display_name = repository.file_name()?.to_str()?.to_owned();
    Some(DiscoveredRepository {
        relative_path,
        display_name,
        location: RepositoryLocation::Local {
            path: repository.to_string_lossy().into_owned(),
        },
    })
}

fn path_to_portable(path: &Path) -> Option<String> {
    let parts = path
        .components()
        .map(|component| component.as_os_str().to_str().map(ToOwned::to_owned))
        .collect::<Option<Vec<_>>>()?;
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn excluded_directory(name: &str) -> bool {
    (name.starts_with('.') && name != ".jj") || EXCLUDED_DIRECTORIES.contains(&name)
}

fn parse_remote_discovery(
    stdout: &[u8],
    host: &str,
    configured_root: &str,
) -> Result<Vec<DiscoveredRepository>, DriverError> {
    let mut fields = stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let canonical_root = fields
        .next()
        .ok_or_else(|| invalid_output("SSH repository discovery did not return its source root"))?;
    let canonical_root = std::str::from_utf8(canonical_root)
        .map_err(|_| invalid_output("SSH repository source root was not UTF-8"))?;
    if !canonical_root.starts_with('/') || canonical_root.chars().any(char::is_control) {
        return Err(invalid_output(
            "SSH repository discovery returned an invalid source root",
        ));
    }
    let mut repositories = Vec::new();
    for field in fields.take(MAX_DISCOVERED_REPOSITORIES) {
        let repository = std::str::from_utf8(field)
            .map_err(|_| invalid_output("SSH repository path was not UTF-8"))?;
        let relative = repository
            .strip_prefix(canonical_root)
            .and_then(|path| path.strip_prefix('/'))
            .ok_or_else(|| invalid_output("SSH repository was outside its source root"))?;
        if relative.is_empty()
            || relative.chars().any(char::is_control)
            || relative
                .split('/')
                .any(|component| component.is_empty() || component == "." || component == "..")
        {
            return Err(invalid_output(
                "SSH repository discovery returned an invalid relative path",
            ));
        }
        let display_name = relative
            .rsplit('/')
            .next()
            .expect("validated relative path has a final component")
            .to_owned();
        repositories.push(DiscoveredRepository {
            relative_path: relative.to_owned(),
            display_name,
            location: RepositoryLocation::Ssh {
                host: host.to_owned(),
                path: join_remote_path(configured_root, relative),
            },
        });
    }
    repositories.sort_by(|left, right| {
        left.relative_path
            .to_ascii_lowercase()
            .cmp(&right.relative_path.to_ascii_lowercase())
    });
    repositories.dedup_by(|left, right| left.relative_path == right.relative_path);
    Ok(repositories)
}

fn join_remote_path(root: &str, relative_path: &str) -> String {
    format!("{}/{}", root.trim_end_matches('/'), relative_path)
}

fn ssh_arguments(host: &str) -> Vec<OsString> {
    vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=8".into(),
        "-o".into(),
        "ServerAliveInterval=5".into(),
        "-o".into(),
        "ServerAliveCountMax=1".into(),
        "--".into(),
        host.into(),
        "sh".into(),
        "-s".into(),
    ]
}

fn remote_discovery_script(root: &str, scan_depth: u8) -> String {
    let encoded_root = encode_hex(root);
    let max_depth = scan_depth.saturating_add(1);
    format!(
        r#"set -eu
decode_hex() {{
  encoded=$1
  decoded=''
  while [ -n "$encoded" ]; do
    rest=${{encoded#??}}
    byte=${{encoded%"$rest"}}
    encoded=$rest
    octal=$(printf '%03o' "0x$byte")
    decoded="$decoded$(printf "\\$octal")"
  done
  printf '%s' "$decoded"
}}
target=$(decode_hex '{encoded_root}')
case "$target" in
  "~/"*) target="$HOME/${{target#??}}" ;;
esac
if [ ! -d "$target" ]; then
  printf '%s\n' 'repository source is not available' >&2
  exit 2
fi
cd "$target"
current=$(pwd -P)
printf '%s\0' "$current"
find "$current" -mindepth 2 -maxdepth {max_depth} \
  \( -name .git -o -name node_modules -o -name target -o -name vendor -o -name dist -o -name build -o \( -name '.*' ! -name .jj \) \) -prune -o \
  -type d -name .jj -exec sh -c 'for marker do repository=${{marker%/.jj}}; printf "%s\0" "$repository"; done' sh {{}} +
"#
    )
}

fn encode_hex(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn invalid_source(error: crate::domain::DomainError) -> DriverError {
    DriverError {
        kind: DriverErrorKind::InvalidRepository,
        message: error.to_string(),
    }
}

fn invalid_output(message: &str) -> DriverError {
    DriverError {
        kind: DriverErrorKind::InvalidOutput,
        message: message.into(),
    }
}

fn transport_error(message: &str) -> DriverError {
    DriverError {
        kind: DriverErrorKind::Transport,
        message: message.into(),
    }
}

fn compact_error(message: &str) -> String {
    const MAX_CHARS: usize = 240;
    let compact = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= MAX_CHARS {
        return compact;
    }
    let mut bounded = compact.chars().take(MAX_CHARS - 1).collect::<String>();
    bounded.push('…');
    bounded
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn local_discovery_is_bounded_sorted_and_stops_inside_repositories() {
        let directory = tempdir().unwrap();
        let root = directory.path();
        std::fs::create_dir_all(root.join("group/zeta/.jj")).unwrap();
        std::fs::create_dir_all(root.join("alpha/.jj")).unwrap();
        std::fs::create_dir_all(root.join("alpha/nested/ignored/.jj")).unwrap();
        std::fs::create_dir_all(root.join("target/ignored/.jj")).unwrap();
        std::fs::create_dir_all(root.join(".hidden/ignored/.jj")).unwrap();
        let source = RepositorySourceRecord::new(
            "Local source",
            RepositoryLocation::Local {
                path: root.to_string_lossy().into_owned(),
            },
            3,
        )
        .unwrap();

        let repositories = RepositoryDiscovery::default()
            .discover(&source, CancellationToken::new())
            .await
            .unwrap();

        assert_eq!(
            repositories
                .iter()
                .map(|repository| repository.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["alpha", "group/zeta"]
        );
    }

    #[test]
    fn remote_output_is_rebased_onto_configured_home_relative_root() {
        let repositories = parse_remote_discovery(
            b"/home/example/code/src\0/home/example/code/src/group/repo\0",
            "dev-box",
            "~/code/src",
        )
        .unwrap();

        assert_eq!(repositories[0].relative_path, "group/repo");
        assert_eq!(
            repositories[0].location,
            RepositoryLocation::Ssh {
                host: "dev-box".into(),
                path: "~/code/src/group/repo".into(),
            }
        );
    }

    #[test]
    fn remote_script_never_interpolates_untrusted_source_path() {
        let path = "~/code/source with spaces; touch /tmp/not-allowed";
        let script = remote_discovery_script(path, 3);

        assert!(!script.contains(path));
        assert!(script.contains(&encode_hex(path)));
    }

    #[test]
    fn remote_discovery_errors_are_compact_and_bounded() {
        let noisy = format!("{}\n{}", "permission denied ".repeat(30), "retry later");
        let compact = compact_error(&noisy);

        assert!(!compact.contains('\n'));
        assert!(compact.chars().count() <= 240);
        assert!(compact.ends_with('…'));
    }

    #[allow(dead_code)]
    fn fake_ssh_discovery(program: PathBuf) -> RepositoryDiscovery {
        RepositoryDiscovery::with_ssh_program(program)
    }
}
