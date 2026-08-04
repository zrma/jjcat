use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::{RepositoryLocation, RepositoryRecord};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HandoffTarget {
    Editor,
    Terminal,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffPreview {
    pub repository_display_name: String,
    pub target: HandoffTarget,
    pub action_label: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FileHandoffTarget {
    Editor,
    Reveal,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHandoffPreview {
    pub repository_display_name: String,
    pub file_path: String,
    pub target: FileHandoffTarget,
    pub action_label: String,
}

#[derive(Debug, Error)]
pub enum FileHandoffError {
    #[error("file path is not a safe repository-relative path")]
    InvalidPath,
    #[error("file action is unavailable for this repository transport")]
    UnsupportedTransport,
    #[error("file handoff application could not be launched")]
    Launch(#[from] std::io::Error),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Platform {
    Macos,
    Linux,
    Windows,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct HandoffPlan {
    program: String,
    args: Vec<String>,
    preview: HandoffPreview,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FileHandoffPlan {
    program: String,
    args: Vec<String>,
    preview: FileHandoffPreview,
}

pub fn preview(repository: &RepositoryRecord, target: HandoffTarget) -> HandoffPreview {
    build_plan(repository, target, current_platform()).preview
}

pub fn launch(
    repository: &RepositoryRecord,
    target: HandoffTarget,
) -> Result<HandoffPreview, std::io::Error> {
    let plan = build_plan(repository, target, current_platform());
    Command::new(&plan.program).args(&plan.args).spawn()?;
    Ok(plan.preview)
}

pub fn launch_file(
    repository: &RepositoryRecord,
    file_path: &str,
    target: FileHandoffTarget,
) -> Result<FileHandoffPreview, FileHandoffError> {
    let plan = build_file_plan(repository, file_path, target, current_platform())?;
    Command::new(&plan.program).args(&plan.args).spawn()?;
    Ok(plan.preview)
}

fn current_platform() -> Platform {
    if cfg!(target_os = "macos") {
        Platform::Macos
    } else if cfg!(target_os = "windows") {
        Platform::Windows
    } else {
        Platform::Linux
    }
}

fn build_plan(
    repository: &RepositoryRecord,
    target: HandoffTarget,
    platform: Platform,
) -> HandoffPlan {
    let preview = HandoffPreview {
        repository_display_name: repository.display_name.clone(),
        target,
        action_label: match target {
            HandoffTarget::Editor => "Open in VS Code".into(),
            HandoffTarget::Terminal => "Open terminal".into(),
        },
    };

    let (program, args) = match (target, &repository.location, platform) {
        (HandoffTarget::Editor, RepositoryLocation::Local { path }, _) => {
            ("code".into(), vec![path.clone()])
        }
        (HandoffTarget::Editor, RepositoryLocation::Ssh { host, path }, _) => (
            "code".into(),
            vec![
                "--remote".into(),
                format!("ssh-remote+{host}"),
                path.clone(),
            ],
        ),
        (HandoffTarget::Terminal, RepositoryLocation::Local { path }, Platform::Macos) => (
            "open".into(),
            vec!["-a".into(), "Terminal".into(), path.clone()],
        ),
        (HandoffTarget::Terminal, RepositoryLocation::Ssh { host, .. }, Platform::Macos) => {
            ("open".into(), vec![format!("ssh://{host}")])
        }
        (HandoffTarget::Terminal, RepositoryLocation::Local { path }, Platform::Linux) => (
            "x-terminal-emulator".into(),
            vec!["--working-directory".into(), path.clone()],
        ),
        (HandoffTarget::Terminal, RepositoryLocation::Ssh { host, .. }, Platform::Linux) => (
            "x-terminal-emulator".into(),
            vec!["-e".into(), "ssh".into(), host.clone()],
        ),
        (HandoffTarget::Terminal, RepositoryLocation::Local { path }, Platform::Windows) => {
            ("wt".into(), vec!["-d".into(), path.clone()])
        }
        (HandoffTarget::Terminal, RepositoryLocation::Ssh { host, .. }, Platform::Windows) => {
            ("wt".into(), vec!["ssh".into(), host.clone()])
        }
    };

    HandoffPlan {
        program,
        args,
        preview,
    }
}

fn build_file_plan(
    repository: &RepositoryRecord,
    file_path: &str,
    target: FileHandoffTarget,
    platform: Platform,
) -> Result<FileHandoffPlan, FileHandoffError> {
    validate_file_path(file_path)?;
    let preview = FileHandoffPreview {
        repository_display_name: repository.display_name.clone(),
        file_path: file_path.into(),
        target,
        action_label: match (target, platform) {
            (FileHandoffTarget::Editor, _) => "Open in VS Code".into(),
            (FileHandoffTarget::Reveal, Platform::Macos) => "Show in Finder".into(),
            (FileHandoffTarget::Reveal, _) => "Show in file manager".into(),
        },
    };

    let (program, args) = match (target, &repository.location, platform) {
        (FileHandoffTarget::Editor, RepositoryLocation::Local { path }, _) => {
            ("code".into(), vec![local_file_path(path, file_path)])
        }
        (FileHandoffTarget::Editor, RepositoryLocation::Ssh { host, path }, _) => (
            "code".into(),
            vec![
                "--remote".into(),
                format!("ssh-remote+{host}"),
                remote_file_path(path, file_path),
            ],
        ),
        (FileHandoffTarget::Reveal, RepositoryLocation::Local { path }, Platform::Macos) => (
            "open".into(),
            vec!["-R".into(), local_file_path(path, file_path)],
        ),
        (FileHandoffTarget::Reveal, RepositoryLocation::Local { path }, Platform::Linux) => {
            let file = local_file_path(path, file_path);
            let parent = Path::new(&file)
                .parent()
                .unwrap_or_else(|| Path::new(path))
                .to_string_lossy()
                .into_owned();
            ("xdg-open".into(), vec![parent])
        }
        (FileHandoffTarget::Reveal, RepositoryLocation::Local { path }, Platform::Windows) => (
            "explorer".into(),
            vec![format!("/select,{}", local_file_path(path, file_path))],
        ),
        (FileHandoffTarget::Reveal, RepositoryLocation::Ssh { .. }, _) => {
            return Err(FileHandoffError::UnsupportedTransport);
        }
    };

    Ok(FileHandoffPlan {
        program,
        args,
        preview,
    })
}

fn validate_file_path(file_path: &str) -> Result<(), FileHandoffError> {
    let invalid_component = file_path
        .split(['/', '\\'])
        .any(|component| component.is_empty() || component == "." || component == "..");
    if file_path.is_empty()
        || file_path.len() > 4096
        || file_path.starts_with('/')
        || file_path.starts_with('\\')
        || file_path.chars().any(char::is_control)
        || invalid_component
    {
        return Err(FileHandoffError::InvalidPath);
    }
    Ok(())
}

fn local_file_path(repository_path: &str, file_path: &str) -> String {
    Path::new(repository_path)
        .join(file_path)
        .to_string_lossy()
        .into_owned()
}

fn remote_file_path(repository_path: &str, file_path: &str) -> String {
    if repository_path == "/" {
        format!("/{file_path}")
    } else {
        format!("{}/{file_path}", repository_path.trim_end_matches('/'))
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    fn repository(location: RepositoryLocation) -> RepositoryRecord {
        RepositoryRecord::from_user_input("fixture repository", location, Path::new("/home/user"))
            .unwrap()
    }

    #[test]
    fn editor_handoff_keeps_untrusted_paths_in_single_arguments() {
        let local = repository(RepositoryLocation::Local {
            path: "/fixtures/project name; touch marker".into(),
        });
        let local_plan = build_plan(&local, HandoffTarget::Editor, Platform::Macos);
        assert_eq!(local_plan.program, "code");
        assert_eq!(
            local_plan.args,
            vec!["/fixtures/project name; touch marker"]
        );

        let remote = repository(RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/project name; touch marker".into(),
        });
        let remote_plan = build_plan(&remote, HandoffTarget::Editor, Platform::Linux);
        assert_eq!(
            remote_plan.args,
            vec![
                "--remote",
                "ssh-remote+fixture-host",
                "~/project name; touch marker"
            ]
        );
    }

    #[test]
    fn terminal_handoff_is_platform_specific_without_a_shell() {
        let local = repository(RepositoryLocation::Local {
            path: "/fixtures/project".into(),
        });
        assert_eq!(
            build_plan(&local, HandoffTarget::Terminal, Platform::Macos).args,
            vec!["-a", "Terminal", "/fixtures/project"]
        );
        assert_eq!(
            build_plan(&local, HandoffTarget::Terminal, Platform::Linux).args,
            vec!["--working-directory", "/fixtures/project"]
        );
        assert_eq!(
            build_plan(&local, HandoffTarget::Terminal, Platform::Windows).args,
            vec!["-d", "/fixtures/project"]
        );
    }

    #[test]
    fn file_editor_handoff_keeps_the_validated_path_in_one_argument() {
        let local = repository(RepositoryLocation::Local {
            path: "/fixtures/project name".into(),
        });
        let local_plan = build_file_plan(
            &local,
            "src/file name; touch marker.rs",
            FileHandoffTarget::Editor,
            Platform::Macos,
        )
        .unwrap();
        assert_eq!(local_plan.program, "code");
        assert_eq!(
            local_plan.args,
            vec!["/fixtures/project name/src/file name; touch marker.rs"]
        );

        let remote = repository(RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/project name".into(),
        });
        let remote_plan = build_file_plan(
            &remote,
            "src/file name; touch marker.rs",
            FileHandoffTarget::Editor,
            Platform::Macos,
        )
        .unwrap();
        assert_eq!(
            remote_plan.args,
            vec![
                "--remote",
                "ssh-remote+fixture-host",
                "~/project name/src/file name; touch marker.rs"
            ]
        );
    }

    #[test]
    fn file_reveal_is_local_and_platform_specific() {
        let local = repository(RepositoryLocation::Local {
            path: "/fixtures/project".into(),
        });
        assert_eq!(
            build_file_plan(
                &local,
                "src/main.rs",
                FileHandoffTarget::Reveal,
                Platform::Macos,
            )
            .unwrap()
            .args,
            vec!["-R", "/fixtures/project/src/main.rs"]
        );
        assert_eq!(
            build_file_plan(
                &local,
                "src/main.rs",
                FileHandoffTarget::Reveal,
                Platform::Linux,
            )
            .unwrap()
            .args,
            vec!["/fixtures/project/src"]
        );

        let remote = repository(RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/project".into(),
        });
        assert!(matches!(
            build_file_plan(
                &remote,
                "src/main.rs",
                FileHandoffTarget::Reveal,
                Platform::Macos,
            ),
            Err(FileHandoffError::UnsupportedTransport)
        ));
    }

    #[test]
    fn file_handoff_rejects_paths_that_can_escape_the_repository() {
        let local = repository(RepositoryLocation::Local {
            path: "/fixtures/project".into(),
        });
        for path in [
            "../outside",
            "src/../../outside",
            "/absolute",
            "src\\..\\outside",
        ] {
            assert!(matches!(
                build_file_plan(&local, path, FileHandoffTarget::Editor, Platform::Macos,),
                Err(FileHandoffError::InvalidPath)
            ));
        }
    }

    #[test]
    fn preview_contains_only_display_safe_repository_context() {
        let remote = repository(RepositoryLocation::Ssh {
            host: "fixture-host".into(),
            path: "~/private-path".into(),
        });
        let preview = preview(&remote, HandoffTarget::Editor);
        let serialized = serde_json::to_string(&preview).unwrap();

        assert!(serialized.contains("fixture repository"));
        assert!(!serialized.contains("fixture-host"));
        assert!(!serialized.contains("private-path"));
    }
}
