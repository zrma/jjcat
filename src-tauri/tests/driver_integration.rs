use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use jjcat_core::domain::{RepositoryLocation, RepositoryRecord, WhitespaceMode};
use jjcat_core::driver::JjDriver;
use tempfile::tempdir;
use tokio_util::sync::CancellationToken;

fn jj(args: &[&str], current_dir: Option<&Path>) {
    let mut command = Command::new("jj");
    command.args(args);
    if let Some(current_dir) = current_dir {
        command.current_dir(current_dir);
    }
    let output = command
        .output()
        .expect("jj must be installed for integration tests");
    assert!(
        output.status.success(),
        "fixture jj command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn fixture_repository(path: &Path) {
    fs::create_dir_all(path).unwrap();
    jj(&["git", "init", "--colocate", path.to_str().unwrap()], None);
    fs::write(path.join("README.md"), "fixture\n").unwrap();
    jj(&["describe", "-m", "chore: initialize fixture"], Some(path));
    jj(&["new", "-m", "feat: add projection fixture"], Some(path));
    fs::write(path.join("projection.txt"), "projection\n").unwrap();
    jj(&["status"], Some(path));
}

#[tokio::test]
async fn local_and_simulated_ssh_share_the_projection_contract() {
    let directory = tempdir().unwrap();
    let repository_path = directory.path().join("fixture-repository");
    fixture_repository(&repository_path);

    let local = RepositoryRecord::new(
        "local-fixture",
        RepositoryLocation::Local {
            path: repository_path.to_string_lossy().into_owned(),
        },
    )
    .unwrap();
    let local_projection = JjDriver::default()
        .project(&local, CancellationToken::new())
        .await
        .unwrap();

    let fake_home = directory.path().join("remote-home");
    fs::create_dir_all(fake_home.join("fixtures")).unwrap();
    std::os::unix::fs::symlink(
        &repository_path,
        fake_home.join("fixtures").join("repository with spaces"),
    )
    .unwrap();
    let fake_ssh = directory.path().join("ssh-fixture");
    let script = format!(
        "#!/bin/sh\nwhile [ \"$1\" != \"--\" ]; do shift; done\nshift\nshift\nexport HOME='{}'\nexec \"$@\"\n",
        fake_home.display()
    );
    fs::write(&fake_ssh, script).unwrap();
    let mut permissions = fs::metadata(&fake_ssh).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&fake_ssh, permissions).unwrap();

    let remote = RepositoryRecord::new(
        "remote-fixture",
        RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/fixtures/repository with spaces".into(),
        },
    )
    .unwrap();
    let remote_driver = JjDriver::with_programs("jj".into(), fake_ssh);
    let remote_projection = remote_driver
        .project(&remote, CancellationToken::new())
        .await
        .unwrap();
    let remote_directories = remote_driver
        .list_remote_directories(
            "fixture-host".into(),
            "~/fixtures".into(),
            CancellationToken::new(),
        )
        .await
        .unwrap();

    let selected = local_projection
        .changes
        .iter()
        .find(|change| {
            change
                .files
                .iter()
                .any(|file| file.path == "projection.txt")
        })
        .unwrap();
    let selected_file = selected
        .files
        .iter()
        .find(|file| file.path == "projection.txt")
        .unwrap()
        .clone();
    let local_diff = JjDriver::default()
        .file_diff(
            &local,
            selected.change_id.clone(),
            selected.commit_id.clone(),
            selected_file.clone(),
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_diff = remote_driver
        .file_diff(
            &remote,
            selected.change_id.clone(),
            selected.commit_id.clone(),
            selected_file,
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();

    let local_summaries = local_projection
        .changes
        .iter()
        .map(|change| change.summary.as_str())
        .collect::<Vec<_>>();
    let remote_summaries = remote_projection
        .changes
        .iter()
        .map(|change| change.summary.as_str())
        .collect::<Vec<_>>();
    assert_eq!(remote_summaries, local_summaries);
    assert_eq!(remote_projection.capability, local_projection.capability);
    assert_eq!(
        remote_projection.working_copy_has_changes,
        local_projection.working_copy_has_changes
    );
    assert_eq!(remote_projection.sync_status, local_projection.sync_status);
    assert!(!local_projection.sync_status.available);
    assert_eq!(remote_diff.hunks, local_diff.hunks);
    assert_eq!(local_diff.additions, 1);
    assert!(!local_diff.binary);
    assert!(!local_diff.truncated);
    assert_eq!(
        remote_directories.directories,
        vec![
            fake_home
                .canonicalize()
                .unwrap()
                .join("fixtures/repository with spaces")
                .to_string_lossy()
                .into_owned()
        ]
    );
}
