use std::process::Command;

use serde::{Deserialize, Serialize};

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
