# Spec: P1 Multi-repository Cockpit

Status: active

## Goal

P0의 read-only local/SSH projection 위에서 여러 repository를 지속적으로 열어 두고 빠르게
전환하며 background refresh 상태를 신뢰할 수 있는 daily cockpit으로 확장한다.

## Context

P0는 repository registration, selected repository, cached projection과 현재 session의 tab
switch를 증명했다. open-tab ordering은 아직 session state이며 quick switcher, background
refresh와 pinned/recent UX는 없다.

## Scope

- schema migration을 포함한 persistent open-tab ordering과 selected tab
- keyboard-first quick switcher와 repository search
- pinned/recent repository grouping
- per-repository background refresh scheduling과 visible freshness
- local/remote editor 및 terminal handoff contract
- 40개 이상 change에서 graph row virtualization spike

## Constraints

- P0 repository identity와 local/SSH projection contract를 유지한다.
- background refresh는 repository별로 하나만 실행하고 cancel/timeout을 보존한다.
- credential, host inventory와 source content를 registry나 tracked evidence에 추가하지 않는다.
- mutation, remote helper 설치와 full diff editor는 P1 범위 밖이다.

## Acceptance Checklist

| ID | Status | Verify | Work item |
| --- | --- | --- | --- |
| C1 | todo | registry migration test | open tabs, order와 selected tab persistence |
| C2 | todo | keyboard/pointer rendered smoke | quick switcher search와 tab reopen/close |
| C3 | todo | scheduler unit/integration test | repository별 refresh dedup, cancel와 backoff |
| C4 | todo | rendered state matrix | pinned/recent와 fresh/stale/error badge |
| C5 | todo | platform handoff smoke | local/remote editor와 terminal open contract |
| C6 | todo | performance fixture | bounded graph rendering at representative row count |
| C7 | todo | `scripts/check.sh` | full local gate와 current docs |

## Required Evidence

- app restart 뒤 open tab order와 selected tab이 동일하다.
- keyboard와 pointer 모두 quick switcher에서 repository를 검색하고 전환한다.
- background refresh가 같은 repository에서 중복 실행되지 않고 다른 repository는 독립적이다.
- failure 뒤 cached projection이 유지되고 retry/backoff 상태가 구분된다.
- handoff command는 credential이나 private environment를 preview에 노출하지 않는다.
- representative graph fixture에서 clipping과 interaction regression이 없다.

## Publication Impact

- fixture와 rendered state는 합성 repository, host, path와 change metadata만 사용한다.
- 실제 editor/terminal command, host inventory와 performance raw log는 local-only evidence다.
- P1은 remote 생성, push, release와 license 선택을 수행하지 않는다.

## Out Of Scope

- rebase, squash, split, abandon, bookmark move와 push
- unified/side-by-side source diff editor
- remote helper install/upgrade
- signing, notarization과 updater

## Completion Rule

모든 acceptance가 done이고 restart/rendered/performance evidence와 `scripts/check.sh`가
통과하며 status/roadmap이 actual runtime과 일치해야 한다.
