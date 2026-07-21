# Publication Policy

## Classification

`jjcat`의 tracked repository surface는 `public`이다. 이것은 content classification이며
GitHub 같은 remote의 live visibility 선언이 아니다. remote가 없거나 private여도 문서,
source, fixture, snapshot, change description과 CI 설정을 공개 가능한 `public-ready`
수준으로 유지한다. remote visibility와 license는 서로 독립된 별도 상태다.

## Publishable Content

- product, architecture와 protocol decision
- 합성 repository, host, user, path와 operation identifier를 사용한 fixture
- 재현 가능한 test command와 redacted pass/fail 판정
- source code, public dependency metadata와 user documentation
- 구현 상태와 repository-owned milestone evidence

## Local-only Content

- credential, token, private key, SSH agent/socket 정보
- 실제 host alias, username, home/checkout path, network address와 private repository inventory
- prompt, 대화 transcript, model scratchpad, memory와 raw tool stdout/stderr
- 로컬 draft/bookmark 상태, 외부 저장소 revision과 machine-specific diagnostic bundle
- 비공개 vulnerability detail과 reporter identity

필요한 예시는 `<repo-root>`, `<home>`, `<private-host>`, `<internal-ip>` 같은 placeholder 또는
명시적인 합성 값을 사용한다. private inventory denylist를 이 저장소나 CI에 넣지 않는다.

## AI-assisted Work

- AI가 만든 결과도 동일한 spec, test, review와 user-visible evidence를 통과해야 한다.
- model 응답이나 tool success는 구현 증거가 아니다. repository test와 실제 동작이 기준이다.
- durable decision만 문서화하고 prompt, transcript, memory와 전체 진단 로그는 게시하지 않는다.
- configured change attribution은 유지하되 local environment context를 change description에
  넣지 않는다.

## Gate Matrix

모든 local change와 private/public remote push 전에 다음을 확인한다.

1. `scripts/check.sh`와 `scripts/check-publication-boundary.py`를 실행한다.
2. push될 tree와 change description에 local-only content가 없는지 확인한다.
3. license를 선택하지 않았다면 그 상태가 README와 manifest에 일치하는지 확인한다.

public remote 생성, private에서 public으로 visibility 전환, public push 직전에는 다음을
추가로 확인한다.

1. remote owner/name과 live visibility를 확인한다.
2. 권한 있는 machine-local private-inventory gate를 실행한다.
3. 현재 tree뿐 아니라 공개될 reachable history와 change description을 검사한다.
4. private vulnerability reporting channel을 준비한다.

push, tag/release, visibility 변경과 history rewrite는 각각 별도의 외부 write다. CI는 공개
후 backstop이며 최초 노출을 막는 local preflight를 대체하지 않는다.

## Public Reports And Releases

- security-sensitive 내용은 public issue에 올리지 않고 `SECURITY.md`의 private 경로를 쓴다.
- issue와 release note에는 재현에 필요한 최소 synthetic evidence만 포함한다.
- release artifact가 생기면 source tree와 별도로 artifact, checksum, install/run smoke를
  검증한다.
