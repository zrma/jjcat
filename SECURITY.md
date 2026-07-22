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
