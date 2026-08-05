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
    command
        .args(["--config", "signing.behavior=drop"])
        .args(args);
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
    jj(
        &["config", "set", "--repo", "signing.behavior", "drop"],
        Some(path),
    );
    jj(
        &["config", "set", "--repo", "user.name", "Fixture Bot"],
        Some(path),
    );
    jj(
        &[
            "config",
            "set",
            "--repo",
            "user.email",
            "fixture@example.invalid",
        ],
        Some(path),
    );
    fs::write(path.join("README.md"), "fixture\n").unwrap();
    fs::write(path.join("legacy-name.txt"), "renamed fixture\n").unwrap();
    jj(&["describe", "-m", "chore: initialize fixture"], Some(path));
    jj(
        &[
            "new",
            "-m",
            "feat: add projection fixture\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>",
        ],
        Some(path),
    );
    fs::write(path.join("projection.txt"), "projection\n").unwrap();
    fs::rename(path.join("legacy-name.txt"), path.join("renamed-file.txt")).unwrap();
    jj(&["status"], Some(path));
}

fn current_operation_id(path: &Path) -> String {
    let output = Command::new("jj")
        .args([
            "--at-op=@",
            "--ignore-working-copy",
            "op",
            "log",
            "--no-graph",
            "-n",
            "1",
            "-T",
            "id ++ \"\\n\"",
        ])
        .current_dir(path)
        .output()
        .unwrap();
    assert!(output.status.success());
    String::from_utf8(output.stdout).unwrap().trim().into()
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
    let ssh_slots = directory.path().join("ssh-slot");
    let script = format!(
        "#!/bin/sh\n\
         while [ \"$1\" != \"--\" ]; do shift; done\n\
         shift\n\
         shift\n\
         export HOME='{}'\n\
         active=''\n\
         for slot in 1 2 3; do\n\
           candidate='{}-'\"$slot\"\n\
           if mkdir \"$candidate\" 2>/dev/null; then active=\"$candidate\"; break; fi\n\
         done\n\
         if [ -z \"$active\" ]; then\n\
           printf '%s\\n' 'too many concurrent SSH commands' >&2\n\
           exit 96\n\
         fi\n\
         trap 'rmdir \"$active\"' EXIT HUP INT TERM\n\
         sleep 0.03\n\
         \"$@\"\n",
        fake_home.display(),
        ssh_slots.display()
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
        .find(|change| change.summary == "feat: add projection fixture")
        .unwrap();
    assert!(
        local_projection
            .changes
            .iter()
            .all(|change| change.files.is_empty()),
        "graph projection must defer changed-file metadata"
    );
    let local_details = JjDriver::default()
        .change_details(
            &local,
            selected.change_id.clone(),
            selected.commit_id.clone(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_details = remote_driver
        .change_details(
            &remote,
            selected.change_id.clone(),
            selected.commit_id.clone(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let selected_file = local_details
        .files
        .iter()
        .find(|file| file.path == "projection.txt")
        .unwrap()
        .clone();
    let renamed_file = local_details
        .files
        .iter()
        .find(|file| file.path == "renamed-file.txt")
        .expect("rename projection must use the canonical target path")
        .clone();
    assert_eq!(remote_details, local_details);
    assert!(local_details.description.contains("Co-authored-by:"));
    assert_eq!(local_details.author, "Fixture Bot");
    assert_eq!(local_details.author_email, "fixture@example.invalid");
    assert!(!local_details.author_timestamp.is_empty());
    assert_eq!(local_details.committer, "Fixture Bot");
    assert_eq!(local_details.committer_email, "fixture@example.invalid");
    assert!(!local_details.committer_timestamp.is_empty());
    assert_eq!(local_details.commit_id.len(), 40);
    assert!(
        local_details
            .parent_commit_ids
            .iter()
            .all(|commit_id| commit_id.len() == 40)
    );
    assert!(renamed_file.display_path.contains("legacy-name.txt"));
    assert!(renamed_file.display_path.contains("renamed-file.txt"));
    assert!(renamed_file.display_path.contains("=>"));
    let local_diff = JjDriver::default()
        .file_diff(
            &local,
            local_details.change_id.clone(),
            local_details.commit_id.clone(),
            selected_file.clone(),
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let local_rename_diff = JjDriver::default()
        .file_diff(
            &local,
            local_details.change_id.clone(),
            local_details.commit_id.clone(),
            renamed_file.clone(),
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_diff = remote_driver
        .file_diff(
            &remote,
            remote_details.change_id.clone(),
            remote_details.commit_id.clone(),
            selected_file,
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_rename_diff = remote_driver
        .file_diff(
            &remote,
            remote_details.change_id.clone(),
            remote_details.commit_id.clone(),
            renamed_file,
            WhitespaceMode::Preserve,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let local_tree = JjDriver::default()
        .revision_tree(
            &local,
            local_details.change_id.clone(),
            local_details.commit_id.clone(),
            &local_details.files,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_tree = remote_driver
        .revision_tree(
            &remote,
            remote_details.change_id.clone(),
            remote_details.commit_id.clone(),
            &remote_details.files,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let local_file = JjDriver::default()
        .revision_file(
            &local,
            local_details.change_id.clone(),
            local_details.commit_id.clone(),
            "projection.txt".into(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_file = remote_driver
        .revision_file(
            &remote,
            remote_details.change_id.clone(),
            remote_details.commit_id.clone(),
            "projection.txt".into(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let local_timeline = JjDriver::default()
        .file_timeline(
            &local,
            local_details.change_id.clone(),
            local_details.commit_id.clone(),
            "projection.txt".into(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let remote_timeline = remote_driver
        .file_timeline(
            &remote,
            remote_details.change_id.clone(),
            remote_details.commit_id.clone(),
            "projection.txt".into(),
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let operation_before = current_operation_id(&repository_path);
    let local_operations = JjDriver::default()
        .operation_log(&local, CancellationToken::new())
        .await
        .unwrap();
    let remote_operations = remote_driver
        .operation_log(&remote, CancellationToken::new())
        .await
        .unwrap();
    let operation_after = current_operation_id(&repository_path);

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
    assert_eq!(
        remote_projection.working_copy_file_count,
        local_projection.working_copy_file_count
    );
    assert_eq!(
        local_projection.working_copy_file_count,
        local_details.files.len()
    );
    assert_eq!(remote_projection.sync_status, local_projection.sync_status);
    assert!(!local_projection.sync_status.available);
    assert_eq!(remote_diff.hunks, local_diff.hunks);
    assert_eq!(local_rename_diff.file.status, "R");
    assert_eq!(local_rename_diff.file.path, "renamed-file.txt");
    assert_eq!(remote_rename_diff.hunks, local_rename_diff.hunks);
    assert_eq!(remote_rename_diff.file, local_rename_diff.file);
    assert_eq!(remote_rename_diff.additions, local_rename_diff.additions);
    assert_eq!(remote_rename_diff.deletions, local_rename_diff.deletions);
    assert_eq!(remote_tree.entries, local_tree.entries);
    assert!(!local_tree.truncated);
    assert_eq!(
        local_tree
            .entries
            .iter()
            .find(|entry| entry.path == "projection.txt")
            .and_then(|entry| entry.status.as_deref()),
        Some("A")
    );
    assert_eq!(remote_file.entry, local_file.entry);
    assert_eq!(remote_file.content, local_file.content);
    assert_eq!(local_file.content, "projection\n");
    assert!(!local_file.binary);
    assert!(!local_file.truncated);
    assert_eq!(remote_timeline.history, local_timeline.history);
    assert_eq!(remote_timeline.lines, local_timeline.lines);
    assert_eq!(local_timeline.lines.len(), 1);
    assert_eq!(local_timeline.lines[0].content, "projection\n");
    assert_eq!(local_timeline.lines[0].commit_id, local_details.commit_id);
    assert_eq!(local_diff.additions, 1);
    assert!(!local_diff.binary);
    assert!(!local_diff.truncated);
    assert_eq!(remote_operations.operations, local_operations.operations);
    assert_eq!(operation_after, operation_before);
    assert_eq!(local_operations.operations[0].id, operation_before);
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
