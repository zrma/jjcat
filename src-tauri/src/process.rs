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
    #[cfg(unix)]
    command.process_group(0);
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
    let mut process_group = OwnedProcessGroup(child.id());

    let stdin = child.stdin.take();
    let write_stdin = async move {
        if let Some(input) = plan.stdin
            && let Some(mut stdin) = stdin
        {
            let _ = stdin.write_all(&input).await;
            let _ = stdin.shutdown().await;
        }
        Ok::<(), std::io::Error>(())
    };

    let stdout = child.stdout.take().expect("stdout must be piped");
    let stderr = child.stderr.take().expect("stderr must be piped");
    // 공유 SSH master가 pipe를 보유해도 종료·출력 수집 모두 같은 deadline을 따른다.
    // I/O future를 분리 spawn하지 않아 취소 시 pipe와 stdin도 함께 닫힌다.
    let result = tokio::select! {
        result = async {
            let (status, (stdout, stdout_truncated), (stderr, stderr_truncated), ()) =
                tokio::try_join!(
                    child.wait(),
                    read_bounded(stdout, output_limit),
                    read_bounded(stderr, output_limit),
                    write_stdin,
                ).map_err(|error| ProcessError {
                    kind: ProcessFailureKind::Wait,
                    detail: Some(error.to_string()),
                })?;
            Ok(CommandOutput {
                exit_code: status.code(),
                stdout,
                stderr,
                truncated: stdout_truncated || stderr_truncated,
            })
        } => result,
        _ = cancellation.cancelled() => Err(ProcessError {
            kind: ProcessFailureKind::Cancelled, detail: None,
        }),
        _ = tokio::time::sleep(timeout) => Err(ProcessError {
            kind: ProcessFailureKind::Timeout, detail: None,
        }),
    };

    if result.is_err() {
        process_group.terminate();
        let _ = child.start_kill();
        let _ = child.wait().await;
    } else {
        process_group.0 = None;
    }
    result
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

struct OwnedProcessGroup(Option<u32>);

impl OwnedProcessGroup {
    fn terminate(&mut self) {
        if let Some(id) = self.0.take() {
            #[cfg(unix)]
            // 이 호출에서 process_group(0)으로 만든 그룹만 대상으로 한다.
            // 기존 SSH master나 별도 세션으로 분리된 프로세스에는 신호를 보내지 않는다.
            unsafe {
                libc::kill(-(id as libc::pid_t), libc::SIGKILL);
            }
            #[cfg(not(unix))]
            let _ = id;
        }
    }
}

impl Drop for OwnedProcessGroup {
    fn drop(&mut self) {
        self.terminate();
    }
}

async fn read_bounded<R: AsyncRead + Unpin>(
    mut reader: R,
    limit: usize,
) -> std::io::Result<(Vec<u8>, bool)> {
    let mut stored = Vec::with_capacity(limit.min(8192));
    // 상위 driver가 여러 command future를 합성해도 stack 크기가 누적되지 않게 한다.
    let mut buffer = vec![0_u8; 8192];
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

    #[cfg(unix)]
    async fn descendant_fixture(cancel: bool, parent_exits: bool, abort: bool) {
        let directory = tempfile::tempdir().unwrap();
        let pid_file = directory.path().join("descendant.pid");
        let script = if parent_exits {
            "sleep 30 & echo $! > descendant.pid; exit 0"
        } else {
            "sleep 30 & echo $! > descendant.pid; wait"
        };
        let mut plan = shell_plan(script);
        plan.current_dir = Some(directory.path().to_path_buf());
        let cancellation = CancellationToken::new();
        let mut unrelated = Command::new("/bin/sleep")
            .arg("30")
            .process_group(0)
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let task = tokio::spawn(run_command(
            plan,
            Duration::from_secs(1),
            cancellation.clone(),
        ));
        let pid = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if let Ok(text) = fs::read_to_string(&pid_file)
                    && let Ok(pid) = text.trim().parse::<i32>()
                {
                    break pid;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("fixture must start its descendant");
        if cancel {
            cancellation.cancel();
        }
        if abort {
            task.abort();
        }
        let result = tokio::time::timeout(Duration::from_secs(3), task).await;
        let stopped = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let state = std::process::Command::new("ps")
                    .args(["-p", &pid.to_string(), "-o", "stat="])
                    .output()
                    .unwrap();
                let state = String::from_utf8_lossy(&state.stdout);
                if state.trim().is_empty() || state.trim().starts_with('Z') {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await;
        if stopped.is_err() {
            // 테스트 실패 시에도 fixture descendant를 남기지 않는다.
            unsafe { libc::kill(pid, libc::SIGKILL) };
        }
        let unrelated_survived = unrelated.try_wait().unwrap().is_none();
        unrelated.kill().await.unwrap();
        assert!(unrelated_survived, "other process groups must survive");
        assert!(stopped.is_ok(), "owned descendant must stop");
        let result = result.expect("process and pipe waits must remain bounded");
        if abort {
            assert!(result.unwrap_err().is_cancelled());
        } else {
            assert_eq!(
                result.unwrap().unwrap_err().kind,
                if cancel {
                    ProcessFailureKind::Cancelled
                } else {
                    ProcessFailureKind::Timeout
                }
            );
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_stops_descendants_and_preserves_other_process_groups() {
        descendant_fixture(false, false, false).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_stops_descendants() {
        descendant_fixture(true, false, false).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn timeout_covers_pipes_held_after_parent_exit() {
        descendant_fixture(false, true, false).await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropped_command_future_stops_descendants() {
        descendant_fixture(false, false, true).await;
    }

    #[tokio::test]
    async fn timeout_covers_blocked_stdin() {
        let mut plan = shell_plan("sleep 30");
        plan.stdin = Some(vec![b'x'; 1024 * 1024]);
        let error = tokio::time::timeout(
            Duration::from_secs(2),
            run_command(plan, Duration::from_millis(100), CancellationToken::new()),
        )
        .await
        .expect("stdin must not outlive the command deadline")
        .unwrap_err();
        assert_eq!(error.kind, ProcessFailureKind::Timeout);
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
