# Security Policy

## Supported Versions

`jjcat`은 아직 실행 가능한 release가 없는 pre-alpha foundation이다. 현재 지원되는 release
line이나 security update SLA는 없다.

## Reporting A Vulnerability

credential, private host/repository identity, command injection, unsafe remote execution 또는
민감정보 노출 가능성은 public issue에 게시하지 않는다.

GitHub private vulnerability reporting이 활성화되어 있다. 민감한 상세정보는 public
issue 대신 [Report a vulnerability](https://github.com/zrma/jjcat/security/advisories/new)를
통해 제출한다. 해당 기능을 사용할 수 없다면 세부정보를 공개하지 않은 채 private contact
channel을 요청한다.

보고에는 synthetic reproduction, 영향 범위와 안전한 최소 설명만 포함한다. 실제 secret,
private key, 내부 address, 전체 SSH config나 raw diagnostic bundle은 보내지 않는다.

## Known Upstream Advisory

[`RUSTSEC-2024-0429`](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)는
pre-alpha baseline에서 허용한 upstream constraint이며, 해결됐다는 의미가 아니다.

- scope: `upstream-linux-transitive`. Linux/BSD desktop build의 Tauri/Wry ->
  WebKitGTK/GTK3 -> `glib 0.18` dependency chain에 한정된다.
- reachability: jjcat과 현재 resolve된 Tauri/Wry/GTK source에서는 영향을 받는
  `VariantStrIter` iterator API의 직접 사용을 확인하지 못했다.
- current action: P0에서는 `glib`을 fork/vendor하지 않고 최신 호환 Tauri/Wry를 유지한다.
- mandatory review: `dependency-refresh-or-linux-distribution`. Tauri/Wry dependency를
  갱신할 때, Linux 배포 전 또는 영향을 받는 API가 reachable해질 때 다시 검토한다.
- exit condition: upstream stack이 수정된 `glib >= 0.20`으로 이동하거나, jjcat이
  [upstream fix](https://github.com/gtk-rs/gtk-rs-core/pull/1343)를 바탕으로 고정한
  backport를 소유하고 검증한다.
