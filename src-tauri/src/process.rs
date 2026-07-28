use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

pub const DEFAULT_OUTPUT_LIMIT: usize = 1024 * 1024;
const REMOTE_COMMAND_CONCURRENCY: usize = 3;
static REMOTE_COMMAND_SLOTS: Semaphore = Semaphore::const_new(REMOTE_COMMAND_CONCURRENCY);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommandPlan {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub current_dir: Option<PathBuf>,
    pub stdin: Option<Vec<u8>>,
}

#[derive(Debug, Eq, PartialEq)]
pub struct CommandOutput {
    pub exit_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProcessFailureKind {
    Spawn,
    Wait,
    Timeout,
    Cancelled,
}

#[derive(Debug, thiserror::Error)]
#[error("process failed: {kind:?}")]
pub struct ProcessError {
    pub kind: ProcessFailureKind,
    pub detail: Option<String>,
}

pub async fn run_command(
    plan: CommandPlan,
    timeout: Duration,
    cancellation: CancellationToken,
) -> Result<CommandOutput, ProcessError> {
    run_command_with_limit(plan, timeout, cancellation, DEFAULT_OUTPUT_LIMIT).await
}

pub async fn run_remote_command(
    plan: CommandPlan,
    timeout: Duration,
    cancellation: CancellationToken,
) -> Result<CommandOutput, ProcessError> {
    run_remote_command_with_limit(plan, timeout, cancellation, DEFAULT_OUTPUT_LIMIT).await
}

pub async fn run_remote_command_with_limit(
    plan: CommandPlan,
    timeout: Duration,
    cancellation: CancellationToken,
    output_limit: usize,
) -> Result<CommandOutput, ProcessError> {
    let wait_cancellation = cancellation.clone();
    let permit = tokio::select! {
        permit = REMOTE_COMMAND_SLOTS.acquire() => permit.map_err(|_| ProcessError {
            kind: ProcessFailureKind::Wait,
            detail: Some("remote command scheduler is unavailable".into()),
        })?,
        _ = wait_cancellation.cancelled() => {
            return Err(ProcessError {
                kind: ProcessFailureKind::Cancelled,
                detail: None,
            });
        }
    };
    let result = run_command_with_limit(plan, timeout, cancellation, output_limit).await;
    drop(permit);
    result
}

pub async fn run_command_with_limit(
    plan: CommandPlan,
    timeout: Duration,
    cancellation: CancellationToken,
    output_limit: usize,
) -> Result<CommandOutput, ProcessError> {
    let (program, path) = command_environment(&plan.program);
    let mut command = Command::new(program);
    command
        .args(&plan.args)
        .env("PATH", path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(current_dir) = &plan.current_dir {
        command.current_dir(current_dir);
    }
    if plan.stdin.is_some() {
        command.stdin(Stdio::piped());
    } else {
        command.stdin(Stdio::null());
    }

    let mut child = command.spawn().map_err(|error| ProcessError {
        kind: ProcessFailureKind::Spawn,
        detail: Some(error.to_string()),
    })?;

    if let Some(input) = plan.stdin
        && let Some(mut stdin) = child.stdin.take()
    {
        tokio::spawn(async move {
            let _ = stdin.write_all(&input).await;
            let _ = stdin.shutdown().await;
        });
    }

    let stdout = child.stdout.take().expect("stdout must be piped");
    let stderr = child.stderr.take().expect("stderr must be piped");
    let stdout_task = tokio::spawn(read_bounded(stdout, output_limit));
    let stderr_task = tokio::spawn(read_bounded(stderr, output_limit));
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);

    let status = tokio::select! {
        status = child.wait() => status.map_err(|error| ProcessError {
            kind: ProcessFailureKind::Wait,
            detail: Some(error.to_string()),
        })?,
        _ = cancellation.cancelled() => {
            terminate(&mut child).await;
            return Err(ProcessError { kind: ProcessFailureKind::Cancelled, detail: None });
        }
        _ = &mut deadline => {
            terminate(&mut child).await;
            return Err(ProcessError { kind: ProcessFailureKind::Timeout, detail: None });
        }
    };

    let (stdout, stdout_truncated) = join_reader(stdout_task).await?;
    let (stderr, stderr_truncated) = join_reader(stderr_task).await?;
    Ok(CommandOutput {
        exit_code: status.code(),
        stdout,
        stderr,
        truncated: stdout_truncated || stderr_truncated,
    })
}

fn command_environment(program: &Path) -> (PathBuf, OsString) {
    let base_path = std::env::var_os("PATH");
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let path = augmented_path(base_path.as_deref(), home.as_deref());
    let override_path = match program.to_str() {
        Some("jj") => std::env::var_os("JJCAT_JJ_BIN"),
        Some("ssh") => std::env::var_os("JJCAT_SSH_BIN"),
        _ => None,
    };
    let program = resolve_program(program, &path, override_path.as_deref());
    (program, path)
}

fn augmented_path(base_path: Option<&OsStr>, home: Option<&Path>) -> OsString {
    let mut paths = Vec::new();

    if let Some(base_path) = base_path {
        for path in std::env::split_paths(base_path) {
            push_unique(&mut paths, path);
        }
    }

    if let Some(home) = home {
        push_unique(&mut paths, home.join(".local/bin"));
        push_unique(&mut paths, home.join(".cargo/bin"));
    }

    #[cfg(target_os = "macos")]
    {
        push_unique(&mut paths, PathBuf::from("/opt/homebrew/bin"));
        push_unique(&mut paths, PathBuf::from("/usr/local/bin"));
    }

    std::env::join_paths(paths)
        .ok()
        .or_else(|| base_path.map(OsStr::to_os_string))
        .unwrap_or_default()
}

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.contains(&path) {
        paths.push(path);
    }
}

fn resolve_program(program: &Path, search_path: &OsStr, override_path: Option<&OsStr>) -> PathBuf {
    if program.components().count() != 1 {
        return program.to_path_buf();
    }

    if let Some(override_path) = override_path.filter(|path| !path.is_empty()) {
        return PathBuf::from(override_path);
    }

    for directory in std::env::split_paths(search_path) {
        let candidate = directory.join(program);
        if is_executable_file(&candidate) {
            return candidate;
        }
    }

    #[cfg(target_os = "macos")]
    if program == Path::new("ssh") {
        let system_ssh = PathBuf::from("/usr/bin/ssh");
        if is_executable_file(&system_ssh) {
            return system_ssh;
        }
    }

    program.to_path_buf()
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

async fn terminate(child: &mut tokio::process::Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

async fn join_reader(
    task: tokio::task::JoinHandle<std::io::Result<(Vec<u8>, bool)>>,
) -> Result<(Vec<u8>, bool), ProcessError> {
    task.await
        .map_err(|error| ProcessError {
            kind: ProcessFailureKind::Wait,
            detail: Some(error.to_string()),
        })?
        .map_err(|error| ProcessError {
            kind: ProcessFailureKind::Wait,
            detail: Some(error.to_string()),
        })
}

async fn read_bounded<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
) -> std::io::Result<(Vec<u8>, bool)> {
    let mut stored = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(stored.len());
        let keep = remaining.min(read);
        stored.extend_from_slice(&buffer[..keep]);
        truncated |= keep < read;
    }
    Ok((stored, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn shell_plan(script: &str) -> CommandPlan {
        CommandPlan {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            current_dir: None,
            stdin: None,
        }
    }

    fn unique_temp_dir() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("jjcat-process-test-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn augments_gui_path_without_discarding_existing_entries() {
        let home = Path::new("/tmp/jjcat-home");
        let home_local = home.join(".local/bin");
        let base = std::env::join_paths([Path::new("/custom/bin"), home_local.as_path()]).unwrap();

        let augmented = augmented_path(Some(&base), Some(home));
        let entries = std::env::split_paths(&augmented).collect::<Vec<_>>();

        assert_eq!(entries[0], PathBuf::from("/custom/bin"));
        assert_eq!(entries[1], home_local);
        assert_eq!(entries[2], home.join(".cargo/bin"));
        assert_eq!(
            entries.iter().filter(|entry| **entry == home_local).count(),
            1
        );
    }

    #[test]
    fn resolves_bare_program_from_augmented_path() {
        let directory = unique_temp_dir();
        fs::create_dir_all(&directory).unwrap();
        let executable = directory.join("jj");
        fs::write(&executable, b"test").unwrap();
        #[cfg(unix)]
        {
            let mut permissions = fs::metadata(&executable).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&executable, permissions).unwrap();
        }
        let search_path = std::env::join_paths([directory.as_path()]).unwrap();

        assert_eq!(
            resolve_program(Path::new("jj"), &search_path, None),
            executable
        );

        fs::remove_file(&executable).unwrap();
        fs::remove_dir(&directory).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn skips_non_executable_path_candidates() {
        let directory = unique_temp_dir();
        let first = directory.join("first");
        let second = directory.join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("jj"), b"not executable").unwrap();
        let executable = second.join("jj");
        fs::write(&executable, b"executable").unwrap();
        let mut permissions = fs::metadata(&executable).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&executable, permissions).unwrap();
        let search_path = std::env::join_paths([first.as_path(), second.as_path()]).unwrap();

        assert_eq!(
            resolve_program(Path::new("jj"), &search_path, None),
            executable
        );

        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn executable_override_wins_for_bare_program() {
        let override_path = OsStr::new("/custom/jj");

        assert_eq!(
            resolve_program(
                Path::new("jj"),
                OsStr::new("/does/not/exist"),
                Some(override_path)
            ),
            PathBuf::from(override_path)
        );
    }

    #[test]
    fn explicit_program_path_is_not_rewritten() {
        assert_eq!(
            resolve_program(
                Path::new("/custom/jj"),
                OsStr::new("/another/bin"),
                Some(OsStr::new("/override/jj"))
            ),
            PathBuf::from("/custom/jj")
        );
    }

    #[tokio::test]
    async fn captures_stdout_stderr_and_exit_status() {
        let output = run_command(
            shell_plan("printf out; printf err >&2; exit 7"),
            Duration::from_secs(2),
            CancellationToken::new(),
        )
        .await
        .unwrap();

        assert_eq!(output.exit_code, Some(7));
        assert_eq!(output.stdout, b"out");
        assert_eq!(output.stderr, b"err");
    }

    #[tokio::test]
    async fn timeout_terminates_the_process() {
        let error = run_command(
            shell_plan("sleep 5"),
            Duration::from_millis(30),
            CancellationToken::new(),
        )
        .await
        .unwrap_err();

        assert_eq!(error.kind, ProcessFailureKind::Timeout);
    }

    #[tokio::test]
    async fn cancellation_terminates_the_process() {
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            cancel.cancel();
        });
        let error = run_command(shell_plan("sleep 5"), Duration::from_secs(2), cancellation)
            .await
            .unwrap_err();

        assert_eq!(error.kind, ProcessFailureKind::Cancelled);
    }

    #[tokio::test]
    async fn output_is_bounded_while_the_pipe_is_drained() {
        let output = run_command(
            shell_plan("yes x | head -c 1100000"),
            Duration::from_secs(2),
            CancellationToken::new(),
        )
        .await
        .unwrap();

        assert!(output.truncated);
        assert_eq!(output.stdout.len(), DEFAULT_OUTPUT_LIMIT);
    }
}
