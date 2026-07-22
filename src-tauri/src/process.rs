use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

pub const DEFAULT_OUTPUT_LIMIT: usize = 1024 * 1024;

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

pub async fn run_command_with_limit(
    plan: CommandPlan,
    timeout: Duration,
    cancellation: CancellationToken,
    output_limit: usize,
) -> Result<CommandOutput, ProcessError> {
    let mut command = Command::new(&plan.program);
    command
        .args(&plan.args)
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

    fn shell_plan(script: &str) -> CommandPlan {
        CommandPlan {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            current_dir: None,
            stdin: None,
        }
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
