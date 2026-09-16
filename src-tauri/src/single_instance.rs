//! macOS startup에서 소유권 확보와 socket bind를 직렬화한다.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tauri::{Manager, Runtime};

struct Instance {
    _lease: File,
    socket: PathBuf,
}

impl Instance {
    fn claim(directory: &Path) -> io::Result<Option<(Self, UnixListener)>> {
        fs::create_dir_all(directory)?;
        let directory = fs::canonicalize(directory)?;
        let lease = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .mode(0o600)
            .open(directory.join("instance.lock"))?;
        // Unix socket 길이 제한을 지키면서 사용자별 application data identity를 유지한다.
        let identity = uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            directory.as_os_str().as_encoded_bytes(),
        );
        let socket = PathBuf::from(format!("/tmp/jjcat-{identity}.sock"));
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            match fs2::FileExt::try_lock_exclusive(&lease) {
                Ok(()) => {
                    // 소유권을 얻은 process만 이전 crash의 socket을 제거할 수 있다.
                    remove_socket(&socket)?;
                    let listener = UnixListener::bind(&socket)?;
                    let owner = Self {
                        _lease: lease,
                        socket,
                    };
                    fs::set_permissions(&owner.socket, fs::Permissions::from_mode(0o600))?;
                    listener.set_nonblocking(true)?;
                    return Ok(Some((owner, listener)));
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    if notify_owner(&socket).is_ok() {
                        return Ok(None);
                    }
                    // 시작 중인 owner의 bind 또는 종료 중인 owner의 잠금 해제를 기다린다.
                    if Instant::now() >= deadline {
                        return Err(io::Error::new(
                            io::ErrorKind::TimedOut,
                            "Another jjcat instance is starting or stopping. Try again shortly.",
                        ));
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
                Err(error) => return Err(error),
            }
        }
    }
}

fn notify_owner(socket: &Path) -> io::Result<()> {
    // 실행 인자 대신 한 byte의 activation 알림만 전달한다.
    UnixStream::connect(socket)?.write_all(&[1])
}

fn remove_socket(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

impl Drop for Instance {
    fn drop(&mut self) {
        // lease를 닫기 전에 정리하므로 다음 owner의 socket을 지우지 않는다.
        let _ = remove_socket(&self.socket);
    }
}

#[cfg(test)]
static ACCEPT_ERRORS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

async fn accept_notification(listener: &tokio::net::UnixListener) -> tokio::net::UnixStream {
    loop {
        match listener.accept().await {
            Ok((stream, _)) => return stream,
            Err(_) => {
                #[cfg(test)]
                ACCEPT_ERRORS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                // 일시적인 descriptor 부족에도 listener와 알림 경로를 유지한다.
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("single-instance")
        .setup(|app, _| {
            let Some((owner, listener)) = Instance::claim(&app.path().app_data_dir()?)? else {
                std::process::exit(0);
            };
            app.manage(owner);
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let Ok(listener) = tokio::net::UnixListener::from_std(listener) else {
                    return;
                };
                loop {
                    let stream = accept_notification(&listener).await;
                    drop(stream);
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });
            Ok(())
        })
        .on_event(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                // updater가 후속 process를 spawn하기 전에 이전 알림 경로를 닫는다.
                // lease는 process 종료까지 유지하며 후속 process는 그 해제를 기다린다.
                if let Some(owner) = app.try_state::<Instance>() {
                    let _ = remove_socket(&owner.socket);
                }
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accept_pressure_child() {
        let Some(directory) = std::env::var_os("JJCAT_TEST_ACCEPT_PRESSURE") else {
            return;
        };
        let (_owner, listener) = Instance::claim(Path::new(&directory)).unwrap().unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let listener = tokio::net::UnixListener::from_std(listener).unwrap();
            // 부모 runner와 실제 앱의 FD 한도는 바꾸지 않는 별도 test process다.
            let mut limit = libc::rlimit {
                rlim_cur: 0,
                rlim_max: 0,
            };
            unsafe {
                assert_eq!(libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit), 0);
                limit.rlim_cur = 64.min(limit.rlim_max);
                assert_eq!(libc::setrlimit(libc::RLIMIT_NOFILE, &limit), 0);
            }
            let mut files = Vec::new();
            while let Ok(file) = File::open("/dev/null") {
                files.push(file);
            }
            use std::io::Write;
            println!("PRESSURE_READY");
            std::io::stdout().flush().unwrap();
            let release = std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(3);
                while ACCEPT_ERRORS.load(std::sync::atomic::Ordering::SeqCst) == 0
                    && Instant::now() < deadline
                {
                    std::thread::sleep(Duration::from_millis(10));
                }
                assert!(ACCEPT_ERRORS.load(std::sync::atomic::Ordering::SeqCst) > 0);
                drop(files);
                println!("PRESSURE_RECOVERED");
                std::io::stdout().flush().unwrap();
            });
            let stream =
                tokio::time::timeout(Duration::from_secs(5), accept_notification(&listener))
                    .await
                    .unwrap();
            drop(stream);
            release.join().unwrap();
        });
    }

    #[test]
    fn notification_recovers_after_process_file_descriptor_exhaustion() {
        use std::io::BufRead;
        let directory = tempfile::tempdir().unwrap();
        let canonical = fs::canonicalize(directory.path()).unwrap();
        let identity = uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            canonical.as_os_str().as_encoded_bytes(),
        );
        let socket = PathBuf::from(format!("/tmp/jjcat-{identity}.sock"));
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "single_instance::tests::accept_pressure_child",
                "--nocapture",
            ])
            .env("JJCAT_TEST_ACCEPT_PRESSURE", directory.path())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let mut ready = false;
        let mut recovered = false;
        for line in std::io::BufReader::new(child.stdout.take().unwrap()).lines() {
            let line = line.unwrap();
            if line.contains("PRESSURE_READY") {
                ready = true;
                notify_owner(&socket).unwrap();
            } else if line.contains("PRESSURE_RECOVERED") {
                recovered = true;
                // accept 오류 때 소실될 수 있는 첫 연결과 별도로 후속 실행의 알림을 검증한다.
                notify_owner(&socket).unwrap();
            }
        }
        let result = child.wait().unwrap();
        assert!(ready && recovered && result.success());
    }

    #[test]
    fn duplicate_notifies_owner_and_cannot_replace_socket() {
        let directory = tempfile::tempdir().unwrap();
        let (owner, listener) = Instance::claim(directory.path()).unwrap().unwrap();
        assert!(Instance::claim(directory.path()).unwrap().is_none());
        assert!(listener.accept().is_ok());
        assert!(Instance::claim(directory.path()).unwrap().is_none());
        assert!(listener.accept().is_ok());
        drop(listener);
        drop(owner);
        assert!(Instance::claim(directory.path()).unwrap().is_some());
    }

    #[test]
    fn parallel_claims_have_one_owner_and_keep_notification_route() {
        let directory = tempfile::tempdir().unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let path = directory.path().to_path_buf();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    Instance::claim(&path).unwrap()
                })
            })
            .collect();
        let owners: Vec<_> = workers
            .into_iter()
            .filter_map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(owners.len(), 1);
        assert!(Instance::claim(directory.path()).unwrap().is_none());
    }

    #[test]
    fn restart_waits_for_exiting_owner_and_reclaims_stale_socket() {
        let directory = tempfile::tempdir().unwrap();
        let (owner, listener) = Instance::claim(directory.path()).unwrap().unwrap();
        remove_socket(&owner.socket).unwrap();
        let path = directory.path().to_path_buf();
        let child = std::thread::spawn(move || Instance::claim(&path).unwrap());
        std::thread::sleep(Duration::from_millis(75));
        drop(listener);
        drop(owner);
        let (owner, listener) = child.join().unwrap().unwrap();
        assert!(Instance::claim(directory.path()).unwrap().is_none());
        assert!(listener.accept().is_ok());
        drop(listener);
        // crash가 남긴 socket도 다음 소유자가 안전하게 회수한다.
        let socket = owner.socket.clone();
        drop(owner);
        let stale = UnixListener::bind(&socket).unwrap();
        drop(stale);
        assert!(Instance::claim(directory.path()).unwrap().is_some());
    }
}
