## MODIFIED Requirements

### Requirement: Unavailable Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-703`, `PROD-328` — 시스템은 Recipient Profile 자체가 API에 노출되지 않거나 kind별 source가 없거나 source에서 파생한 Recipient가 저장 Recipient와 일치하지 않거나, 해당 kind에 필요한 Related Profile 또는 Related Post를 Recipient Profile 기준으로 조회할 수 없는 Notification을 모든 API 표면에서 존재하지 않는 것으로 취급해야 한다(MUST).

#### Scenario: unavailable item connection과 count

- **WHEN** Recipient Profile 자체가 API에 노출되지 않거나 기존 Follow Notification의 source가 없거나 source Followee가 저장 Recipient와 다르거나 Follower Profile을 Recipient가 조회할 수 없다
- **THEN** API는 item을 connection에서 제외하고 Unread여도 `unreadNotificationCount`에 포함하지 않는다
- **AND** filtering은 page limit 전에 SQL에서 적용된다

#### Scenario: unavailable item Node와 Read

- **WHEN** 요청이 unavailable item ID를 Node 또는 `markNotificationRead(input: { ids })`에 전달한다
- **THEN** Node는 `null`을 반환하고 Read mutation은 해당 ID를 결과에서 조용히 제외한다
- **AND** 저장된 `readAt`은 변경되지 않으며 Read 응답은 item의 존재나 제외 이유를 노출하지 않는다

#### Scenario: cleanup 전 저장 상태

- **WHEN** unavailable item의 비동기 cleanup이 아직 실행되지 않았다
- **THEN** database row와 기존 Read 상태는 남을 수 있다
- **AND** cleanup 전에 visibility가 회복되면 item은 기존 Read 상태로 다시 visible해질 수 있다

#### Scenario: generic fallback 금지

- **WHEN** item이 unavailable이다
- **THEN** API와 client는 `profile: null` Follow item, 이름·handle snapshot 또는 type-only generic item을 반환·표시하지 않는다
- **AND** client는 서버가 반환한 page나 count를 unavailable 기준으로 다시 필터링하지 않는다

#### Scenario: 비동기 삭제와 즉시 숨김의 독립성

- **WHEN** cleanup Schedule이 중지됐거나 Workflow 실행이 지연 또는 실패한다
- **THEN** API connection, Unread count, Node와 Read mutation은 기존 visible predicate로 unavailable item을 계속 즉시 숨긴다
- **AND** cleanup 지연은 사용자 노출 지연으로 전환되지 않는다

#### Scenario: Recipient Profile 자체의 복구 가능한 비가시성

- **WHEN** Notification의 source와 Related Post/Profile 관계는 유효하지만 Recipient Profile 자체가 일시 비활성화 또는 정지돼 item이 숨겨진다
- **THEN** API는 item을 모든 표면에서 계속 숨긴다
- **AND** cleanup은 이 상태만으로 Notification row와 Read State를 물리 삭제하지 않는다

## ADDED Requirements

### Requirement: Unavailable Notification의 bounded 비동기 cleanup

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-328` — 시스템은 기존 canonical Notification source·visibility 계약을 재정의하지 않고, 24시간 주기의 Temporal Schedule과 bounded cursor Workflow로 unavailable Notification을 다음 성공한 sweep에서 best-effort로 멱등 물리 삭제해야 한다(MUST).

#### Scenario: source가 없거나 Recipient 관계가 잘못된 item

- **WHEN** kind별 필수 source가 없거나 source에서 파생한 Recipient가 저장 Recipient와 일치하지 않는 Notification을 cleanup이 판정한다
- **THEN** 시스템은 해당 Notification row와 그 row의 Read State를 물리 삭제한다
- **AND** 같은 row를 반복 처리하거나 이미 삭제된 row를 다시 처리해도 성공한 no-op으로 수렴한다

#### Scenario: Related Post 또는 Related Profile이 unavailable인 item

- **WHEN** Recipient Profile 기준으로 kind별 Related Post 또는 Related Profile을 더 이상 조회할 수 없어 기존 item이 canonical visibility 판정에 실패한다
- **THEN** 시스템은 그 Notification을 generic unavailable cleanup 대상으로 물리 삭제한다

#### Scenario: 삭제 직전 availability 회복

- **WHEN** page scan 뒤 실제 삭제를 결정하기 전에 source 또는 Related Post/Profile 관계가 다시 canonical available 상태가 된다
- **THEN** 시스템은 Notification ID와 unavailable 조건을 삭제 경계에서 다시 확인해 available row를 보존한다
- **AND** page scan의 과거 판정만으로 row를 삭제하지 않는다

#### Scenario: bounded page와 checkpoint

- **WHEN** 전체 Notification 수 또는 unavailable backlog가 한 번의 저장 작업으로 처리할 수 있는 범위를 넘는다
- **THEN** Workflow는 안정적인 exclusive cursor와 제한된 page 크기로 scan하고 다음 checkpoint를 durable Workflow state로 전달한다
- **AND** 각 page의 DB 작업, Workflow history와 처리율은 명시된 상한을 넘지 않는다

#### Scenario: Worker 종료와 부분 page 실패 뒤 재개

- **WHEN** Worker가 종료되거나 DB·Temporal 일시 장애 또는 page 처리 실패가 발생한다
- **THEN** Workflow와 Activity retry는 마지막 durable checkpoint 또는 안전하게 재처리 가능한 cursor에서 이어진다
- **AND** 이미 삭제한 row의 재처리와 동일 Activity의 retry는 대상 외 row를 삭제하지 않고 최종 수렴한다

#### Scenario: 같은 Schedule의 반복 실행

- **WHEN** 동일 Schedule이 이전 sweep 완료 뒤 다시 실행되거나 진행 중 실행과 다음 tick이 겹친다
- **THEN** 시스템은 동시에 중복 sweep을 누적하지 않고 정책에 따라 한 실행만 진행한다
- **AND** 새로 unavailable이 된 row는 정상 운영에서 24시간 Schedule의 다음 성공한 sweep에 best-effort로 물리 삭제된다

#### Scenario: rate limit과 DB budget

- **WHEN** large backlog를 처리한다
- **THEN** cleanup은 bounded page와 처리율 제한을 적용해 API latency와 DB connection budget을 침해하지 않는다
- **AND** schedule·page·rate 설정을 변경하거나 Schedule을 중지해 cleanup 부하만 독립적으로 제어할 수 있다

### Requirement: Unavailable Notification cleanup 관측

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-328` — 시스템은 cleanup의 실행과 수렴 여부를 판단할 수 있도록 schedule/run/page 상관관계와 실행 성공·실패, scanned/deleted/skipped/error 수 및 page duration을 구조화 로그와 Temporal SDK metrics로 관측 가능하게 제공해야 한다(MUST). `scanned`·`deleted`·`skipped` Workflow counter는 Workflow가 수락한 Activity result의 논리적 합계이며 DB 물리 처리량 회계값이 아니다. Activity attempt log·duration·attempt error와 Workflow accepted-result counter·terminal error는 서로 다른 관측 의미를 가진다.

#### Scenario: 정상 page 처리 관측

- **WHEN** cleanup Activity가 page를 성공적으로 처리한다
- **THEN** 관측 결과는 schedule·Workflow run·cursor와 함께 scanned, deleted, skipped 수와 다음 checkpoint를 구분한다
- **AND** Workflow counter는 수락한 Activity result에 보고된 page 수치만 누적하며, Activity commit 뒤 result 유실로 retry된 경우 실제 DB 처리량과 달라질 수 있다
- **AND** 동일 retry나 Workflow replay가 집계 의미를 중복 왜곡하지 않게 시도와 최종 결과를 구분한다

#### Scenario: 오류와 retry 관측

- **WHEN** DB 일시 장애, Activity timeout, heartbeat timeout 또는 page 실패가 발생한다
- **THEN** 관측 결과는 error 수, retry attempt와 마지막 안전한 checkpoint를 연관 지어 제공한다
- **AND** Activity attempt log·duration·attempt error와 Workflow의 accepted-result counter·terminal error를 구분한다
- **AND** 영구 실패는 성공한 cleanup이나 completed sweep으로 보고되지 않는다

#### Scenario: Schedule과 cleanup 실행 상태

- **WHEN** 24시간 Schedule이 cleanup Workflow를 시작하거나 sweep이 완료 또는 실패한다
- **THEN** 시스템은 Schedule 실행 여부와 Workflow run의 완료·실패를 page 처리 결과와 연관 지어 식별할 수 있다
- **AND** cleanup 실행 상태를 API visibility 상태와 혼동하지 않는다
