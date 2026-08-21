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
- Status: Superseded
- Context / Problem: 현재 Home query의 retry용 key 증가는 네트워크 완료·실패 신호가 없어 정확한 in-flight 잠금 해제에 사용할 수 없다.
- Decision Outcome: 현재 actor Relay environment에서 기존 Home query를 `network-only`로 실행하고 observable의 완료·실패를 잠금 해제 근거로 사용한다. 기존 normalized store 구독으로 화면을 갱신한다.
- Alternatives Considered: timeline fragment refetch는 중첩된 PostList까지 callback을 전달하고 pagination 회귀를 추가 검증해야 한다. retry용 key 증가는 완료 신호가 없어 선택하지 않았다. query-loader 방식은 같은 계약을 만족할 수 있지만 현재 단일 query에는 추가 lifecycle이 필요하다.
- Consequences: timeline 외 Home query field도 함께 요청한다. environment 전환·unmount 시 이전 subscription과 잠금을 정리하고, 같은 activation에서 retry용 key를 함께 변경하지 않는다.
- Confirmation / Follow-up: Home query 요청 수, 진행 중 중복 억제, 성공·실패 뒤 재활성화와 controller dispose·stale settle cleanup을 자동화로 검증한다. 변경된 서버 데이터의 normalized UI 반영, 기존 loaded connection 유지와 실제 actor 전환 중 네트워크 cleanup timing은 미검증 runtime 범위로 남긴다.

- Superseded By: 2026-08-17 `Visible Home fetchKey와 actor-tagged stale fallback을 사용한다`

### Visible Home fetchKey와 actor-tagged stale fallback을 사용한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-610`
- Status: Superseded
- Context / Problem: visible `HomePageQuery`의 `store-and-network` 재검증 실패가 기존 query 오류 경계로 전파되면 stale timeline이 무너질 수 있고, 별도 `fetchQuery` subscription·token lock은 Relay의 동일 operation in-flight dedupe와 중복 lifecycle을 만든다.
- Decision Outcome: visible Home query는 기존 `fetchKey`와 outer `RouteBoundary`를 유지한다. current-home activation은 매번 document를 최상단으로 이동하고 같은 visible query의 `fetchKey`를 증가시킨다. query reader는 반환된 `HomePageQuery$data`를 actor revision과 함께 parent ref에 동기적으로 기록하고, Home-local inner ErrorBoundary는 같은 actor의 마지막 성공 data를 stale timeline으로 렌더한다. 해당 actor의 stale data가 없으면 오류를 다시 던져 outer `RouteBoundary`가 blocking error를 표시한다. inner boundary는 actor revision이 포함된 fetchKey 변화에서 오류 상태를 reset해 다음 activation과 retry가 새 query를 시도한다. Home screen 동안 현재 environment에서 `createOperationDescriptor(getRequest(HomeQuery), {})`를 retain하고 cleanup하며, 동일 environment·operation·variables의 진행 중 요청 중복은 Relay runtime에 맡긴다.
- Alternatives Considered: hidden revalidator는 visible query의 stale-if-error 오류 경계를 우회할 뿐 실제 query 오류를 고치지 못하므로 제거했다. 별도 `fetchQuery` subscription·token lock·전용 helper는 실제 요청 완료와 cancellation lifecycle을 명시적으로 관리하지만 Relay dedupe와 중복되고 stale data fallback을 visible query와 분리하므로 제거했다. 공통 `RouteBoundary` 수정은 다른 route 범위까지 넓히므로 선택하지 않았다.
- Consequences: 재검증 실패는 actor-tagged 기존 timeline을 유지하고 초기/no-data query 실패만 기존 RouteBoundary에서 blocking error로 표시한다. retain은 stale fragment refs를 Home screen/fallback 수명 동안 유지한다. actor environment 교체는 이전 Store와 새 Store를 격리하고 revision mismatch stale ref를 사용하지 않지만 일반 query의 실제 network cancellation은 보장하지 않는다. 다음 activation은 새 visible fetchKey를 만들고, 이전 요청이 아직 진행 중이면 Relay dedupe가 추가 네트워크를 막는다.
- Confirmation / Follow-up: 진행 중 중복, settle 뒤 다음 요청, visible query 재검증 실패 뒤 Shell/Home 무관 재렌더에서도 stale timeline 유지와 다음 activation retry를 focused Web E2E로 검증한다. 실제 actor 전환 중 network cancellation은 미검증 범위로 남긴다.

- Superseded By: 2026-08-19 `Home-local query boundary가 예상 가능한 오류 lifecycle을 소유한다`

### Home-local query boundary가 예상 가능한 오류 lifecycle을 소유한다

- Decision Date: 2026-08-19
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-610`, PR #607 review
- Status: Active
- Context / Problem: 같은 actor의 재검증 실패는 stale timeline으로 복구되지만, stale data가 없는 query 오류를 outer `RouteBoundary`로 다시 던지면 Home content가 unmount되고 outer fallback이 유지되어 current-home `fetchKey` 변경이나 actor 전환만으로 새 query를 시작할 수 없다. 또한 full-stack actor 전환에서 inner boundary의 revision prop과 `resetKeys`가 바뀌어도 기존 오류 fallback이 유지되어 새 query가 시작되지 않는 경로가 확인됐다.
- Decision Outcome: visible Home query의 기존 `fetchKey`, Relay retain·dedupe와 actor-tagged stale data를 유지한다. Home-local boundary가 같은 actor의 stale fallback과 stale data가 없는 blocking fallback을 모두 렌더하며, blocking fallback으로 소비하는 오류는 기존 unexpected-error reporter에 한 번 전달한다. blocking fallback의 수동 retry는 `fetchKey`를 한 번 증가시킨다. current-home retry는 `resetKeys`로 처리하고, actor Relay environment revision이 바뀌면 revision key로 Home-local boundary만 remount한다. outer `RouteBoundary`는 inner fallback 자체에서 다시 발생하거나 inner boundary 밖에서 전파된 오류의 최종 fallback을 담당한다.
- Alternatives Considered: no-data 오류를 outer `RouteBoundary`로 다시 던지는 방식은 Home query subtree를 제거하고 outer fallback을 유지해 재선택·actor 전환 복구를 막으므로 선택하지 않았다. 공통 `RouteBoundary`에 actor reset 계약을 추가하는 방식은 18개 production caller로 범위를 넓힌다. boundary 전체를 visible `fetchKey`로 remount하는 방식은 정상 current-home 재선택에서도 성공한 `PostList`를 불필요하게 remount하므로 선택하지 않았다.
- Consequences: 예상 가능한 Home query 오류 lifecycle은 Home route 안에 남고, no-data 오류도 current-home 재선택·수동 retry·actor 전환으로 복구할 수 있다. revision key는 actor environment 전환에만 바뀌므로 정상 재선택의 성공한 timeline과 pagination component는 remount하지 않는다.
- Confirmation / Follow-up: no-data 오류에서 current-home 재선택과 수동 retry가 각각 Home query를 한 번 시작하는지, actor revision 변경이 새 actor query와 timeline을 복구하는지 focused Web E2E로 검증한다. 실제 actor 전환 중 network cancellation은 미검증 범위로 남긴다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `완료 신호가 있는 network-only Home query를 사용한다` (2026-08-15) → `Visible Home fetchKey와 actor-tagged stale fallback을 사용한다` (2026-08-17)
- `Visible Home fetchKey와 actor-tagged stale fallback을 사용한다` (2026-08-17) → `Home-local query boundary가 예상 가능한 오류 lifecycle을 소유한다` (2026-08-19)
