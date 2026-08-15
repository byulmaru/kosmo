## Context

이 기록은 `docs/design/breakpoints.md`, `docs/design/accessibility.md`와 `PROD-610`의 Home 재선택 계약, 사용자가 2026-08-15에 확인한 진행 중 요청 처리 방식, 현재 shell·Relay 구조 조사를 반영한다.

## Decision Records

### Forward navigation과 current-home 재선택을 분리한다

- Decision Date: 2026-08-15
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-610`
- Status: Active
- Context / Problem: 기존 주요 route scroll 정책은 현재와 다른 pathname으로 이동하는 forward navigation만 다루며 current-home 재선택과 Relay 새로고침은 제외한다.
- Decision Outcome: 다른 route의 홈 진입은 기존 guarded forward navigation을 유지하고, current-home 재선택은 route navigation을 시작하지 않는 local scroll·refresh 동작으로 처리한다.
- Alternatives Considered: current-home 재선택을 기존 forward navigation intent에 포함하는 방식은 same-route no-op 경계와 Relay 새로고침 lifecycle을 결합하므로 선택하지 않았다.
- Consequences: 기존 history restoration·query-only navigation·다른 current-route 동작은 변경하지 않는다.
- Confirmation / Follow-up: 다른 route와 current-home activation을 분리한 단위·Web 자동화로 검증한다.

### 진행 중 새로고침에는 scroll만 반복하고 네트워크 요청은 무시한다

- Decision Date: 2026-08-15
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-610`
- Status: Active
- Context / Problem: 연속 활성화에서 document 최상단 이동은 즉시 제공하면서 Home Relay 요청 중복을 막아야 한다.
- Decision Outcome: activation마다 document scroll을 최상단으로 이동한다. 홈 재선택 요청이 진행 중이면 추가 네트워크 요청을 시작하지 않고, 성공·실패 뒤의 다음 activation은 새 요청을 정확히 한 번 시작한다. 이전 요청이 실패했어도 현재 timeline을 유지한다.
- Alternatives Considered: 완료 직후 한 번 더 실행하는 trailing refresh, 현재 요청 취소 후 재시작, 고정 debounce/throttle을 검토했으나 불필요한 추가 요청·취소 lifecycle·임의 지연을 만들기 때문에 선택하지 않았다.
- Consequences: 동시에 하나의 홈 재선택 요청만 존재하며 오류는 기존 데이터를 제거하지 않는다.
- Confirmation / Follow-up: 진행 중 연속 activation의 scroll 횟수와 네트워크 요청 1회, 성공·실패 뒤 다음 activation의 새 요청 1회를 검증한다.

### 기존 shell-to-route context를 재사용한다

- Decision Date: 2026-08-15
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-610`
- Status: Active
- Context / Problem: sidebar·drawer·bottom tab·Home header의 activation을 Home query owner에 전달해야 한다.
- Decision Outcome: shell과 route child를 이미 연결하는 기존 context에 stable activation과 handler 등록 경계를 추가한다. 새 전역 event infrastructure는 만들지 않는다.
- Alternatives Considered: surface별 prop drilling은 전달 지점과 누락 위험을 늘리고, module/browser event는 저장소에 없는 전역 lifecycle을 도입하므로 선택하지 않았다.
- Consequences: handler identity는 stable하게 유지하고 Home unmount 시 등록을 해제해야 한다. 다른 route용 범용 reselection abstraction으로 확장하지 않는다.
- Confirmation / Follow-up: 모든 Web shell surface가 같은 handler를 사용하고 다른 navigation callback이 유지되는지 검증한다.

### 완료 신호가 있는 network-only Home query를 사용한다

- Decision Date: 2026-08-15
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-610`
- Status: Active
- Context / Problem: 현재 Home query의 retry용 key 증가는 네트워크 완료·실패 신호가 없어 정확한 in-flight 잠금 해제에 사용할 수 없다.
- Decision Outcome: 현재 actor Relay environment에서 기존 Home query를 `network-only`로 실행하고 observable의 완료·실패를 잠금 해제 근거로 사용한다. 기존 normalized store 구독으로 화면을 갱신한다.
- Alternatives Considered: timeline fragment refetch는 중첩된 PostList까지 callback을 전달하고 pagination 회귀를 추가 검증해야 한다. retry용 key 증가는 완료 신호가 없어 선택하지 않았다. query-loader 방식은 같은 계약을 만족할 수 있지만 현재 단일 query에는 추가 lifecycle이 필요하다.
- Consequences: timeline 외 Home query field도 함께 요청한다. environment 전환·unmount 시 이전 subscription과 잠금을 정리하고, 같은 activation에서 retry용 key를 함께 변경하지 않는다.
- Confirmation / Follow-up: Home query 요청 수, 진행 중 중복 억제, 성공·실패 뒤 재활성화와 controller dispose·stale settle cleanup을 자동화로 검증한다. 변경된 서버 데이터의 normalized UI 반영, 기존 loaded connection 유지와 실제 actor 전환 중 네트워크 cleanup timing은 미검증 runtime 범위로 남긴다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
