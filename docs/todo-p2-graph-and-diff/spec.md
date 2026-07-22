# Spec: P2 Graph and Diff

Status: completed

## Goal

P1의 persistent multi-repository cockpit과 bounded history rendering 위에서 change topology와
file content를 신뢰할 수 있게 탐색하는 read-only graph/diff workspace를 완성한다.

## Context

P1은 160-row fixture에서 bounded DOM rendering과 revision selection을 증명했지만 graph는 단일
lane projection이고 file inspector는 path/status metadata만 표시한다. daily history inspection을
위해서는 topology lane, keyboard revision navigation과 bounded diff loading이 필요하다.

## Scope

- parent relation 기반 multi-lane DAG layout과 revision keyboard navigation
- selected revision의 bounded file list와 unified/side-by-side diff
- conflict, outgoing와 behind read-only projection
- operation log inspection과 undo eligibility preview
- large/binary file guard와 local/SSH parity

## Constraints

- P1의 repository identity, cache, refresh와 virtualization contract를 보존한다.
- source content는 사용자가 선택한 file/revision 범위에서만 읽고 cache와 tracked evidence에
  복제하지 않는다.
- shaping mutation, bookmark move, push와 remote helper 설치는 수행하지 않는다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | done | topology fixture + rendered smoke | multi-lane DAG와 keyboard revision navigation |
| C2 | done | local/SSH driver integration | bounded file list와 unified diff |
| C3 | done | rendered mode matrix | side-by-side diff와 whitespace mode |
| C4 | done | projection fixture | conflict, outgoing와 behind state |
| C5 | done | operation fixture | operation log와 undo eligibility preview |
| C6 | done | `scripts/check.sh` | full local gate와 current docs |

## Required Evidence

- merge와 divergent parent fixture가 stable lane layout을 만들고 virtual scroll 뒤에도 연결된다.
- keyboard와 pointer로 revision/file을 선택하고 동일한 inspector state를 얻는다.
- local과 SSH driver가 같은 bounded diff contract를 사용하며 binary/large output을 제한한다.
- conflict, outgoing와 behind가 refresh/cache freshness와 혼동되지 않는다.
- operation surface는 실행 가능 여부와 target을 보여주되 P2에서 mutation을 실행하지 않는다.

검증 결과:

- deterministic topology fixture와 160-row rendered smoke에서 merge lane, pointer/keyboard 선택,
  virtual scroll 뒤 선택 행 추적을 확인했다.
- local과 simulated SSH가 같은 structured hunk를 반환하고 actual SSH smoke에서 bounded diff와
  read-only operation query를 확인했다. diff capture는 512 KiB에서 잘리고 binary/truncated
  상태를 content 대신 표시한다.
- unified/side-by-side와 preserve/ignore-all whitespace matrix를 browser에서 전환했으며
  conflict와 last-fetched outgoing/behind가 cache freshness와 분리되어 표시된다.
- operation query 전후 operation identity가 유지되고 undo action은 target preview만 제공하는
  disabled control이다.
- canonical local gate와 native desktop smoke가 통과했다. private runtime identity와 raw
  evidence는 tracked artifact에 기록하지 않았다.

## Publication Impact

- graph/diff fixture는 합성 repository, path와 source content만 사용한다.
- 실제 source content, repository identity, SSH inventory와 raw performance output은 local-only다.
- remote write, release와 visibility 변경은 수행하지 않는다.

## Out Of Scope

- rebase, squash, split, abandon, bookmark move와 push
- remote helper install/upgrade
- editor 내 source modification과 conflict resolution
- signing, notarization과 updater

## Completion Rule

모든 acceptance가 evidence와 함께 done이고 local/SSH rendered smoke와 canonical local gate가
통과하며 status/roadmap이 actual runtime과 일치해야 한다.
