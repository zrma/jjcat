# Completed Milestones

## 2026-07-21: AI-first Repository Foundation

- `jjcat` product identity와 local/SSH multi-repository objective를 고정했다.
- product, architecture, status, roadmap와 active P0 acceptance를 repository-owned
  source of truth로 만들었다.
- canonical agent harness, repository contract, publication boundary, CI와 local change
  finalization scripts를 추가했다.
- colocated `jj`/Git repository를 초기화했다.
- tracked artifact를 remote visibility와 분리된 public-ready 기준으로 재검토하고
  publication policy, contribution/security boundary, pre-origin repository gate와 live
  visibility 인식을 추가했다.

이 milestone 종료 시점의 검증 source of truth는 `scripts/check.sh`였으며 runtime
implementation은 다음 P0 milestone로 넘겼다.

## 2026-07-21: P0 Read-only Repository Cockpit Foundation

- Tauri 2 + Rust core와 React/TypeScript/Vite frontend를 선택하고 native macOS bundle을
  실제 실행했다.
- stable local/SSH identity, schema-versioned registry, migration과 corrupt recovery를
  구현했다.
- machine-readable `jj` projection과 bounded/cancellable local/OpenSSH stdio driver를
  같은 contract로 구현했다.
- repository rail, tabs, DAG, change inspector와 cached/stale/disconnected states를
  desktop 및 narrow viewport에서 검증했다.
- local fixture, simulated SSH fixture와 local-only actual SSH 2-repository matrix를
  통과했다. private host, path와 raw output은 tracked evidence에 남기지 않았다.

## 2026-07-22: P1 Multi-repository Cockpit

- registry schema v2 migration으로 open tab order, selected tab, pinned와 recent state를 restart
  이후에도 복구한다.
- keyboard/pointer quick switcher, tab close/reopen과 repository freshness/error badges를
  compact cockpit에 통합했다.
- repository별 background refresh dedup, cancellation, active/inactive interval과 bounded failure
  backoff를 추가하고 실패 중 last-known cache를 유지한다.
- local/SSH repository를 structured argv로 VS Code 또는 platform terminal에 넘기는 handoff를
  추가하고 preview에서 private context를 제외했다.
- representative 160-row fixture에서 visible window만 DOM에 유지하는 history virtualization과
  중간 revision interaction을 검증했다.
- native desktop, owner-controlled SSH 2-repository matrix와 canonical local gate를 통과했다.
  private identity, path와 raw output은 tracked evidence에 남기지 않았다.
