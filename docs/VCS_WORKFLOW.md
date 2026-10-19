# VCS Integration And Closeout

## Contract

`main`은 조상에 merge commit이 없는 선형 이력을 유지한다. 동시 작업을 보존하기 위한
merge도 허용하지 않는다. 기존 release tag와 배포 자산은 별도 출고 계약이며, tag 쪽
분기가 존재한다는 이유로 재작성하지 않는다. 앱이 사용자의 저장소에 제공하는 merge나
history shaping 기능에는 이 개발 저장소의 정책을 적용하지 않는다.

push가 stale 상태로 거절되면 후속 tag/release 작업을 중단한다. 최신 remote를 조회하고
아직 출고하지 않은 변경만 최신 `main` 위에 선형으로 재적용한 뒤 의미 있는 검사와
부모 관계를 다시 검증한다. 공개 history, tag 또는 배포 파일을 바꿀 필요가 생기면
기존 승인 범위와 별도 변경 권한을 확인한다. push 권한이나 rewrite 권한이 없는 상황을
새 merge로 우회하지 않는다.

## History Check

```sh
python3 scripts/check-vcs-state.py
python3 scripts/check-vcs-state.py --revision <candidate-revision>
```

기본 검사는 local `main`의 전체 조상을 확인한다. jj metadata가 없는 CI에서는 Git의
`main` 또는 `origin/main`을 사용한다. 명시한 후보는 정확히 하나의 commit으로 해석돼야
한다. shallow history는 판정 근거가 부족하므로 실패한다. CI와 release checkout은 전체
history를 읽고, CI는 PR의 synthetic merge가 아닌 실제 head를 별도로 검사한다.

`scripts/check.sh`는 이 검사를 포함한다. CI의 실패는 공개 뒤의 backstop이며,
원격 서버의 merge 거절을 대신하는 것으로 보고하지 않는다.

서버 정책의 입력은 `.github/main-ruleset.json`이다. branch `refs/heads/main`에만
`required_linear_history`를 active 상태로 적용하고 bypass actor를 두지 않는다.
tag/release에는 적용하지 않는다. 적용 전 기존 ruleset을 조회해 중복 생성을 피하고,
적용 후에는 ruleset 자체와 `rules/branches/main`의 실제 적용 규칙을 각각 재조회한다.
현재 remote 설정의 권한·지원 여부를 확인하고 승인된 repository administration
범위에서 적용한다. GitHub 서버가 merge push를 거절하는 규칙과 local/CI 검사를 구분한다.

## Local Change Finalization

```sh
scripts/finalize-change.sh --message "fix: example summary"
```

의미 있는 현재 change를 검증하고 configured attribution을 정확히 한 번 붙인 뒤
새 empty working copy로 이동한다. 기본값으로 bookmark나 remote를 이동하지 않는다.
명시적 `--bookmark main`은 승인된 publication transaction에서만 사용하며 선형 후보를
먼저 확인한다. 검사나 attribution helper가 실패하면 후속 단계로 넘어가지 않는다.

## Task-Owned Temporary Copies

임시 workspace/worktree/별도 clone을 만들 때부터 task-local 목록으로 관리한다. 목록과
복구 정보는 tracked 문서에 넣지 않는다. 기존 workspace와 active/WIP는 보호 입력이다.
작업 종료 시 자기 task가 만든 사본마다 고유 변경·history·ignored 파일의 보존 필요성과
최종 소유 artifact를 확인하고, 회수 가능한 방식으로 directory를 정리한다.

정상적인 empty working copy 하나는 잔여물이 아니다. 다음 항목은 서로 다른 검사 대상이다.

- 현재 working copy가 empty이며 의도한 parent 하나를 가리키는지
- 설명되지 않은 보조 workspace나 참조 없는 empty/non-empty head가 남았는지
- jj 등록, Git worktree metadata, 실제 directory가 각각 정리됐는지
- 별도 clone처럼 어느 VCS inventory에도 나타나지 않는 task-owned 경로가 남았는지

```sh
python3 scripts/check-vcs-state.py --closeout
python3 scripts/check-vcs-state.py --closeout --keep-workspace active-work
python3 scripts/check-vcs-state.py --closeout --retired-path "<retired-task-dir>"
```

검사는 기본 workspace에서 실행한다. 출고 후에는 기본값인 `main`을 expected parent로
사용한다. local-only 마감은 `--revision <completed-revision>`으로 검증할 수 있다.
다른 작업의 활성 workspace는 `--keep-workspace`로 명시해 보존한다. 종료하기로 한 모든
임시 경로는 `--retired-path`를 반복해서 전달한다. 이 인자는 경로를 삭제하지 않고
directory·symlink가 사라졌는지 검사한다.

검사기는 어떤 workspace/head도 자동 삭제하지 않는다. 기본 working copy가 진행 중인
WIP이거나 보존해야 할 unique work가 있으면 유지하고 소유자·재개점을 인계한다. 이런
예외를 전체 closeout 통과로 합산하지 않는다. 로컬 workspace 검사는 CI가 대신할 수
없으며, 생성 시 기록하지 않은 외부 clone을 파일시스템 전체에서 추정하지 않는다.

## 공통 검사 소유권

AI-first `vcs-closeout`이 pin한 `.ai-first/vcs.py`가 검사 구현을 소유한다.
`scripts/check-vcs-state.py`는 기존 명령의 호환 진입점이며 repository 회귀 테스트와
server-side main 규칙을 유지한다. 일반 standalone gate는 history만, 작업 종료 명령은
명시적 closeout을 검사한다.
