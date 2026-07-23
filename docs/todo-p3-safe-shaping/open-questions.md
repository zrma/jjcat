# Open Questions

Status: resolved for P3 implementation

## Q1: Preview가 실제 dry-run operation을 만들어야 하는가

- Decision: 아니다. preview는 read-only query와 typed action으로 deterministic effect를
  설명한다.
- Reason: `--no-integrate-operation`도 operation data를 만들고 fetch/push의 repository 외부
  side effect를 막지 않으므로 read-only preview가 아니다.
- Revisit when: Jujutsu가 side-effect-free machine-readable mutation plan API를 제공한다.

## Q2: External process와의 operation race를 어떻게 처리하는가

- Decision: jjcat 내부 repository queue와 execute 직전 exact operation recheck를 적용하고,
  postcondition/divergence를 검사해 recovery-required로 종료한다.
- Reason: 현재 CLI에는 repository-wide conditional mutation lock을 외부 client가 소유하는
  안정적인 API가 없다.
- Revisit when: Jujutsu가 compare-and-swap operation precondition을 제공한다.

## Q3: Split의 P3 범위

- Decision: selected change의 exact changed-file paths를 선택하는 non-interactive file-level
  split만 제공한다.
- Reason: interactive diff editor embedding은 별도 editor lifecycle과 SSH transport 계약이
  필요하다.
- Revisit when: hunk-level shaping이 file-level split보다 높은 daily-use priority가 된다.

## Q4: Empty change pruning 보호 범위

- Decision: current working copy, root, immutable change와 local/remote bookmark가 붙은 change를
  제외하고 preview에 열거된 exact empty commit만 abandon한다.
- Reason: current edit target과 named reference를 implicit cleanup에서 보존한다.
- Revisit when: bookmark를 부모로 이동하는 별도 explicit cleanup mode가 필요하다.

## Q5: Push confirmation

- Decision: preview 뒤 `Push <bookmark>` exact confirmation을 요구하고 force/delete option은
  제공하지 않는다.
- Reason: push는 remote state를 바꾸므로 local rewrite보다 강한 의도 확인이 필요하다.
- Revisit when: multi-bookmark batch push와 protected-branch policy가 필요하다.

현재 구현을 막는 사용자 결정은 없다.
