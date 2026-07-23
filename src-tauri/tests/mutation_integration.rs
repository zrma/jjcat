use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use jjcat_core::domain::{RepositoryLocation, RepositoryProjection, RepositoryRecord};
use jjcat_core::driver::JjDriver;
use jjcat_core::mutation::{MutationCandidate, MutationIntent};
use tempfile::tempdir;
use tokio_util::sync::CancellationToken;

fn jj_output(args: &[&str], current_dir: &Path) -> Output {
    Command::new("jj")
        .args(args)
        .current_dir(current_dir)
        .output()
        .expect("jj must be installed for integration tests")
}

fn jj(args: &[&str], current_dir: &Path) {
    let output = jj_output(args, current_dir);
    assert!(
        output.status.success(),
        "fixture jj command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn init_repository(path: &Path) {
    fs::create_dir_all(path).unwrap();
    let output = Command::new("jj")
        .args(["git", "init", "--colocate", path.to_str().unwrap()])
        .output()
        .expect("jj must be installed for integration tests");
    assert!(
        output.status.success(),
        "fixture init failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    jj(
        &["config", "set", "--repo", "user.name", "Fixture Bot"],
        path,
    );
    jj(
        &[
            "config",
            "set",
            "--repo",
            "user.email",
            "fixture@example.invalid",
        ],
        path,
    );
    fs::write(path.join("base.txt"), "base\n").unwrap();
    jj(
        &["describe", "--message", "chore: initialize fixture"],
        path,
    );
    jj(&["status"], path);
    jj(&["new", "--message", "feat: first fixture change"], path);
    fs::write(path.join("first.txt"), "first\n").unwrap();
    jj(&["status"], path);
}

fn init_remote(path: &Path) {
    init_repository(path);
    jj(&["bookmark", "create", "main", "--revision", "@"], path);
}

fn add_remote(repository: &Path, remote: &Path) {
    jj(
        &["git", "remote", "add", "origin", remote.to_str().unwrap()],
        repository,
    );
}

fn local_record(path: &Path, name: &str) -> RepositoryRecord {
    RepositoryRecord::new(
        name,
        RepositoryLocation::Local {
            path: path.to_string_lossy().into_owned(),
        },
    )
    .unwrap()
}

fn fake_ssh(directory: &Path, home: &Path) -> PathBuf {
    let script_path = directory.join("ssh-fixture");
    let script = format!(
        "#!/bin/sh\nwhile [ \"$1\" != \"--\" ]; do shift; done\nshift\nshift\nexport HOME='{}'\nexec \"$@\"\n",
        home.display()
    );
    fs::write(&script_path, script).unwrap();
    let mut permissions = fs::metadata(&script_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&script_path, permissions).unwrap();
    script_path
}

async fn projection(driver: &JjDriver, repository: &RepositoryRecord) -> RepositoryProjection {
    driver
        .project(repository, CancellationToken::new())
        .await
        .unwrap()
}

async fn execute(
    driver: &JjDriver,
    repository: &RepositoryRecord,
    intent: &MutationIntent,
) -> (String, String, Vec<MutationCandidate>) {
    let context = driver
        .mutation_context(repository, intent, CancellationToken::new())
        .await
        .unwrap();
    driver
        .execute_mutation(
            repository,
            intent,
            &context.candidates,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    let after = driver
        .current_operation_id(repository, CancellationToken::new())
        .await
        .unwrap();
    (context.operation_id, after, context.candidates)
}

async fn exercise_core_mutations(driver: &JjDriver, repository: &RepositoryRecord) {
    let initial = projection(driver, repository).await;
    let initial_working = initial
        .changes
        .iter()
        .find(|change| change.working_copy)
        .unwrap();
    let described_message = "feat: describe fixture through jjcat\n\nCo-authored-by: Fixture Bot <fixture@example.invalid>";
    let (before_describe, after_describe, _) = execute(
        driver,
        repository,
        &MutationIntent::Describe {
            target_commit_id: initial_working.commit_id.clone(),
            message: described_message.into(),
        },
    )
    .await;
    assert_ne!(before_describe, after_describe);

    let described = projection(driver, repository).await;
    let described_working = described
        .changes
        .iter()
        .find(|change| change.working_copy)
        .unwrap();
    assert!(
        described_working
            .description
            .contains("feat: describe fixture through jjcat")
    );
    assert!(
        described_working
            .description
            .contains("Co-authored-by: Fixture Bot <fixture@example.invalid>")
    );
    let described_commit = described_working.commit_id.clone();

    let (before_new, after_new, _) = execute(
        driver,
        repository,
        &MutationIntent::New {
            parent_commit_ids: vec![described_commit.clone()],
        },
    )
    .await;
    assert_ne!(before_new, after_new);
    let created = projection(driver, repository).await;
    let created_working = created
        .changes
        .iter()
        .find(|change| change.working_copy)
        .unwrap();
    assert_eq!(
        created_working.parent_commit_ids,
        vec![described_commit.clone()]
    );

    let (before_edit, after_edit, _) = execute(
        driver,
        repository,
        &MutationIntent::Edit {
            target_commit_id: described_commit.clone(),
        },
    )
    .await;
    assert_ne!(before_edit, after_edit);
    let edited = projection(driver, repository).await;
    assert_eq!(
        edited
            .changes
            .iter()
            .find(|change| change.working_copy)
            .unwrap()
            .commit_id,
        described_commit
    );

    let (before_fetch, after_fetch, _) = execute(
        driver,
        repository,
        &MutationIntent::Fetch {
            remote: Some("origin".into()),
        },
    )
    .await;
    assert_ne!(before_fetch, after_fetch);
    assert!(projection(driver, repository).await.sync_status.available);
}

#[tokio::test]
async fn local_and_simulated_ssh_execute_core_mutations() {
    let directory = tempdir().unwrap();
    let local_path = directory.path().join("local-repository");
    let remote_path = directory.path().join("ssh-repository");
    let local_origin = directory.path().join("local-origin");
    let ssh_origin = directory.path().join("ssh-origin");
    init_repository(&local_path);
    init_repository(&remote_path);
    init_remote(&local_origin);
    init_remote(&ssh_origin);
    add_remote(&local_path, &local_origin);
    add_remote(&remote_path, &ssh_origin);

    let local = local_record(&local_path, "local-fixture");
    exercise_core_mutations(&JjDriver::default(), &local).await;

    let fake_home = directory.path().join("remote-home");
    fs::create_dir_all(fake_home.join("fixtures")).unwrap();
    std::os::unix::fs::symlink(&remote_path, fake_home.join("fixtures/repository")).unwrap();
    let remote = RepositoryRecord::new(
        "ssh-fixture",
        RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/fixtures/repository".into(),
        },
    )
    .unwrap();
    let remote_driver =
        JjDriver::with_programs("jj".into(), fake_ssh(directory.path(), &fake_home));
    exercise_core_mutations(&remote_driver, &remote).await;
}

#[tokio::test]
async fn shaping_pruning_undo_and_remote_write_have_verified_postconditions() {
    let directory = tempdir().unwrap();
    let repository_path = directory.path().join("shaping-repository");
    let origin_path = directory.path().join("origin");
    init_repository(&repository_path);
    init_remote(&origin_path);
    add_remote(&repository_path, &origin_path);
    let repository = local_record(&repository_path, "shaping-fixture");
    let driver = JjDriver::default();

    let initial = projection(&driver, &repository).await;
    let source_change = initial
        .changes
        .iter()
        .find(|change| change.working_copy)
        .unwrap();
    let source = source_change.commit_id.clone();
    let source_change_id = source_change.change_id.clone();
    let base = initial
        .changes
        .iter()
        .find(|change| change.commit_id == source)
        .and_then(|change| change.parent_commit_ids.first())
        .unwrap()
        .clone();
    execute(
        &driver,
        &repository,
        &MutationIntent::New {
            parent_commit_ids: vec![base],
        },
    )
    .await;
    let destination = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;

    execute(
        &driver,
        &repository,
        &MutationIntent::Rebase {
            source_commit_id: source.clone(),
            destination_commit_id: destination.clone(),
        },
    )
    .await;
    let rebased = projection(&driver, &repository).await;
    let rebased_source = rebased
        .changes
        .iter()
        .find(|change| change.change_id == source_change_id)
        .unwrap();
    assert_eq!(rebased_source.parent_commit_ids, vec![destination.clone()]);
    let rebased_source_commit = rebased_source.commit_id.clone();

    execute(
        &driver,
        &repository,
        &MutationIntent::Squash {
            source_commit_id: rebased_source_commit.clone(),
            destination_commit_id: destination,
        },
    )
    .await;
    assert!(
        !projection(&driver, &repository)
            .await
            .changes
            .iter()
            .any(|change| change.commit_id == rebased_source_commit)
    );

    fs::write(repository_path.join("second.txt"), "second\n").unwrap();
    jj(&["status"], &repository_path);
    let split_source = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &repository,
        &MutationIntent::Split {
            source_commit_id: split_source,
            paths: vec!["first.txt".into()],
            message: "feat: split selected fixture".into(),
        },
    )
    .await;
    let split_projection = projection(&driver, &repository).await;
    let selected_split = split_projection
        .changes
        .iter()
        .find(|change| change.summary == "feat: split selected fixture")
        .unwrap()
        .commit_id
        .clone();
    execute(
        &driver,
        &repository,
        &MutationIntent::Abandon {
            target_commit_ids: vec![selected_split.clone()],
        },
    )
    .await;
    assert!(
        !projection(&driver, &repository)
            .await
            .changes
            .iter()
            .any(|change| change.commit_id == selected_split)
    );

    let current = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &repository,
        &MutationIntent::New {
            parent_commit_ids: vec![current],
        },
    )
    .await;
    let unreferenced_empty = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &repository,
        &MutationIntent::New {
            parent_commit_ids: vec![unreferenced_empty.clone()],
        },
    )
    .await;
    let mut protected_empty = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &repository,
        &MutationIntent::Describe {
            target_commit_id: protected_empty,
            message: "chore: preserve empty bookmark fixture".into(),
        },
    )
    .await;
    protected_empty = projection(&driver, &repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &repository,
        &MutationIntent::BookmarkMove {
            name: "keep-empty".into(),
            target_commit_id: protected_empty.clone(),
        },
    )
    .await;
    execute(
        &driver,
        &repository,
        &MutationIntent::New {
            parent_commit_ids: vec![protected_empty.clone()],
        },
    )
    .await;
    let (_, _, candidates) = execute(&driver, &repository, &MutationIntent::PruneEmpty).await;
    assert_eq!(
        candidates
            .iter()
            .map(|candidate| candidate.commit_id.as_str())
            .collect::<Vec<_>>(),
        vec![unreferenced_empty.as_str()]
    );
    let after_prune = projection(&driver, &repository).await;
    assert!(
        !after_prune
            .changes
            .iter()
            .any(|change| change.commit_id == unreferenced_empty)
    );
    assert!(after_prune.changes.iter().any(|change| {
        change
            .bookmarks
            .iter()
            .any(|bookmark| bookmark.name == "keep-empty" && bookmark.remote.is_none())
    }));

    let undo_working = after_prune
        .changes
        .iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id
        .clone();
    execute(
        &driver,
        &repository,
        &MutationIntent::Describe {
            target_commit_id: undo_working,
            message: "temporary undo fixture".into(),
        },
    )
    .await;
    let undo_operation = driver
        .current_operation_id(&repository, CancellationToken::new())
        .await
        .unwrap();
    execute(
        &driver,
        &repository,
        &MutationIntent::Undo {
            operation_id: undo_operation,
        },
    )
    .await;
    assert_ne!(
        projection(&driver, &repository)
            .await
            .changes
            .iter()
            .find(|change| change.working_copy)
            .unwrap()
            .summary,
        "temporary undo fixture"
    );

    let push_repository_path = directory.path().join("push-repository");
    let push_origin_path = directory.path().join("push-origin");
    init_repository(&push_repository_path);
    init_remote(&push_origin_path);
    add_remote(&push_repository_path, &push_origin_path);
    let push_repository = local_record(&push_repository_path, "push-fixture");
    let push_target = projection(&driver, &push_repository)
        .await
        .changes
        .into_iter()
        .find(|change| change.working_copy)
        .unwrap()
        .commit_id;
    execute(
        &driver,
        &push_repository,
        &MutationIntent::BookmarkMove {
            name: "safe-shaping".into(),
            target_commit_id: push_target,
        },
    )
    .await;
    execute(
        &driver,
        &push_repository,
        &MutationIntent::Push {
            name: "safe-shaping".into(),
            remote: "origin".into(),
        },
    )
    .await;
    assert!(
        projection(&driver, &push_repository)
            .await
            .changes
            .iter()
            .flat_map(|change| &change.bookmarks)
            .any(|bookmark| {
                bookmark.name == "safe-shaping" && bookmark.remote.as_deref() == Some("origin")
            })
    );
}
