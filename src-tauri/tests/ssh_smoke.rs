use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use jjcat_core::domain::{RepositoryLocation, RepositoryRecord};
use jjcat_core::driver::JjDriver;
use tokio_util::sync::CancellationToken;

#[tokio::test]
#[ignore = "requires a machine-local SSH host configured by the repository owner"]
async fn projects_two_user_owned_remote_repositories() {
    let host = std::env::var("JJCAT_SSH_SMOKE_HOST")
        .expect("JJCAT_SSH_SMOKE_HOST must name a machine-local OpenSSH host alias");
    let root = std::env::var("JJCAT_SSH_SMOKE_ROOT")
        .expect("JJCAT_SSH_SMOKE_ROOT must name a machine-local remote search root");
    RepositoryLocation::Ssh {
        host: host.clone(),
        path: root.clone(),
    }
    .validate()
    .expect("the machine-local smoke root must satisfy the SSH path contract");
    let encoded_root = root
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let discovery_script = format!(
        r#"set -eu
encoded='{encoded_root}'
root=''
while [ -n "$encoded" ]; do
  rest=${{encoded#??}}
  byte=${{encoded%"$rest"}}
  encoded=$rest
  octal=$(printf '%03o' "0x$byte")
  root="$root$(printf "\\$octal")"
done
case "$root" in
  "~/"*) root="$HOME/${{root#??}}" ;;
esac
find "$root" -mindepth 1 -maxdepth 4 -type d -name .jj -print |
  sed 's#/.jj$##' |
  head -n 2
"#
    );
    let mut discovery = Command::new("ssh")
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "--",
            &host,
            "sh",
            "-s",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("OpenSSH must be available");
    discovery
        .stdin
        .take()
        .expect("discovery stdin must be piped")
        .write_all(discovery_script.as_bytes())
        .expect("discovery script must be written");
    let output = discovery
        .wait_with_output()
        .expect("remote repository discovery must finish");
    assert!(
        output.status.success(),
        "remote repository discovery failed"
    );
    let paths = String::from_utf8(output.stdout).expect("remote paths must be UTF-8");
    let paths = paths
        .lines()
        .filter(|path| !path.is_empty())
        .collect::<Vec<_>>();
    assert_eq!(
        paths.len(),
        2,
        "expected exactly two repositories for the smoke matrix"
    );

    let driver = JjDriver::default().with_timeout(Duration::from_secs(30));
    for (index, path) in paths.into_iter().enumerate() {
        let repository = RepositoryRecord::new(
            format!("remote-smoke-{}", index + 1),
            RepositoryLocation::Ssh {
                host: host.clone(),
                path: path.into(),
            },
        )
        .expect("discovered location must satisfy the P0 SSH path contract");
        let projection = driver
            .project(&repository, CancellationToken::new())
            .await
            .expect("remote projection must succeed");
        assert!(!projection.changes.is_empty());
        assert!(projection.capability.supported);
    }

    println!("local-only SSH smoke passed");
}
