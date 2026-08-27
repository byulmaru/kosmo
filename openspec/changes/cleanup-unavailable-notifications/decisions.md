## Context

이 기록은 `docs/domain/objects/notification.md`와 2026-08-25에 정렬한 PROD-328을 입력으로, unavailable Notification cleanup의 대상, Schedule 의미, 공유 predicate, cursor/delete 안전성, Temporal lifecycle과 관측 경계를 확정한다.

## Decision Records

### cleanup 대상은 source·Related availability 실패로 한정한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-328`
- Status: Active
- Context / Problem: API가 숨기는 모든 이유를 단순 부정하면 Recipient Profile 자체의 복구 가능한 비가시성도 물리 삭제할 수 있다.
- Decision Outcome: missing source, source/Recipient 불일치와 Recipient 기준 Related Post/Profile unavailable만 cleanup 대상으로 삼는다. Recipient Profile 자체의 일시 비활성·정지는 item을 숨기지만 삭제 원인에서 제외한다.
- Alternatives Considered: 전체 API visibility predicate의 부정과 Recipient 비활성 row도 정리하는 방식은 현재 canonical/Linear 범위를 벗어나므로 사용하지 않는다.
- Consequences: cleanup availability predicate는 Account membership과 Recipient 자체 state/instance visibility를 삭제 원인으로 사용하지 않는다.
- Confirmation / Follow-up: core DB integration에서 source missing·Recipient mismatch·Related unavailable 삭제와 Recipient inactive row 보존을 함께 검증한다.

### 24시간은 deadline이 아니라 best-effort Schedule interval이다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-328`
- Status: Active
- Context / Problem: Worker·Temporal·DB 장애가 발생할 수 있는 비동기 cleanup에 개별 row의 24시간 삭제 보장을 두면 실제 운영 의미와 맞지 않는다.
- Decision Outcome: Schedule은 24시간마다 실행하고 newly unavailable row는 다음 성공한 sweep에서 best-effort로 정리한다. API의 즉시 숨김은 cleanup 성공·실패와 독립이다.
- Alternatives Considered: 1시간, 6시간 또는 12시간 interval과 개별 row 24시간 deadline은 사용자 결정과 다르므로 사용하지 않는다.
- Consequences: missed/failed run 뒤 cleanup은 다음 성공한 실행까지 지연될 수 있으며 Schedule 상태와 Workflow 완료·오류 관측으로 실행 공백을 식별한다.
- Confirmation / Follow-up: dev Schedule description과 다음 action time, 수동 실패·회복 및 API 비노출 독립성을 확인한다.

### source availability SQL은 API와 cleanup이 한 경계에서 공유한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-328`
- Status: Active
- Context / Problem: 현재 kind별 source predicate는 API module과 UserContext에 묶여 있어 Worker가 직접 소비할 수 없고, cleanup 전용 복사본은 visibility drift를 만든다.
- Decision Outcome: viewer-independent Profile/Post/source availability helper를 core 경계로 추출한다. API는 여기에 membership을 조합하고 cleanup은 같은 source predicate에서 Recipient 자체 비가시성만 삭제 원인에서 제외한다.
- Alternatives Considered: API module을 Worker가 import하거나 cleanup SQL을 별도로 복사하는 방식은 계층 역전과 계약 drift 때문에 사용하지 않는다.
- Consequences: 기존 API visibility refactor의 regression 범위가 넓어지지만 향후 kind predicate 변경은 한 소유 경계에서 API와 cleanup에 함께 적용된다.
- Confirmation / Follow-up: 기존 Notification GraphQL integration 전체와 kind별 core cleanup fixture를 함께 통과시킨다.

### UUIDv7 exclusive cursor와 고정 upper bound로 sweep한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-328`
- Status: Active
- Context / Problem: offset pagination은 concurrent delete에 취약하고 createdAt은 unique하지 않으며, 끝없이 유입되는 row를 같은 sweep이 따라가면 완료 지점이 없다.
- Decision Outcome: Workflow가 page 삭제 전에 별도 Activity로 최대 Notification ID를 캡처하고 그 결과를 durable state로 받은 시점을 sweep 시작으로 삼는다. 이후 UUIDv7 PK `id ASC`의 `cursor < id <= upperBound` exclusive keyset page에는 같은 non-null upper bound를 명시적으로 전달한다.
- Alternatives Considered: offset, createdAt cursor, kind별 독립 sweep과 upper bound 없는 tail-following은 skip·중복·무한 실행 위험 때문에 사용하지 않는다.
- Consequences: 캡처한 최대 ID보다 큰 row는 다음 24시간 Schedule이 처리한다. UUIDv7은 같은 millisecond 안의 생성·commit 순서를 완전히 표현하지 않으므로, 캡처 뒤 commit돼도 ID가 upper bound 이하인 row는 현재 sweep에 포함될 수 있다. 이 구현은 끝없이 커지는 tail을 차단하는 고정 ID 경계이며 생성 시각 snapshot을 주장하지 않는다. 첫 구현은 PK를 사용하며 추가 cleanup index를 만들지 않는다.
- Confirmation / Follow-up: concurrent insert/delete, 삭제된 cursor row, empty/final page와 다음 sweep 포함을 DB integration에서 검증하고 query plan·duration을 dev에서 확인한다.

### page 삭제는 Notification ID와 unavailable 조건을 다시 확인한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-328`
- Status: Active
- Context / Problem: scan과 delete 사이에 source 관계가 회복되거나 candidate가 교체될 수 있고 기존 source 기반 delete는 정확한 Notification row를 식별하지 않는다.
- Decision Outcome: bounded page의 Notification ID를 사용하고 delete statement 또는 같은 저장 경계에서 current unavailable predicate를 재평가한 row만 물리 삭제한다. 이미 삭제된 row와 retry는 성공한 no-op이다.
- Alternatives Considered: scan 결과만으로 ID bulk delete, `kind + sourceId` delete, source row 장시간 lock은 대상 외 삭제 또는 source action 지연 위험 때문에 사용하지 않는다.
- Consequences: page query가 복잡해지지만 source recreation/deletion 경합에서 available row를 보존하고 retry idempotency를 유지한다.
- Confirmation / Follow-up: 독립 connection의 source deletion/recreation 및 Activity result loss 후 retry를 검증한다.

### Schedule은 one-shot PreSync reconciler가 소유한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-328`, `PROD-719`, `PROD-730`
- Status: Active
- Context / Problem: 복수 Worker replica startup에서 Schedule을 mutate하면 race가 생기고, disabled template을 단순 제거하면 기존 remote Schedule이 계속 실행된다.
- Decision Outcome: namespace 준비 뒤 실행되는 application-image one-shot reconciler가 환경별 deterministic Schedule ID, 24시간 interval, 공용 task queue, cleanup Workflow와 `SKIP` overlap을 create/update한다. disabled 선언은 Schedule을 delete하지 않고 pause한다.
- Alternatives Considered: Worker startup mutation, Temporal CLI 수동 명령, template 미렌더와 Schedule delete는 replica race, drift 또는 복구 불가능한 rollback 때문에 사용하지 않는다.
- Consequences: `@temporalio/client`는 Worker의 production dependency가 되고 Helm에 별도 bounded PreSync Job과 enabled/paused desired state가 추가된다.
- Confirmation / Follow-up: dev/prod render, 같은 선언 재실행, drift update, pause/unpause, overlap과 connection failure의 PreSync fail-closed를 검증한다.

### Workflow는 bounded Activity와 continue-as-new로 checkpoint를 유지한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-328`, `PROD-730`
- Status: Active
- Context / Problem: 전체 scan을 한 Activity나 한 Workflow history에 누적하면 timeout, 취소 지연과 unbounded history가 생긴다.
- Decision Outcome: Workflow는 bounded page Activity를 순차 호출하고 rate-limit timer를 적용한다. Activity는 start/end progress를 heartbeat하며 retry·timeout 상한을 가진다. Workflow는 SDK `continueAsNewSuggested` 또는 검증된 보수적 page 상한에서 cursor, upper bound와 누적 상태를 continue-as-new 입력으로 전달한다.
- Alternatives Considered: 한 번의 unbounded Activity, heartbeat 없는 장기 scan과 history 제한 없는 loop는 재시작·취소·운영 budget 요구를 만족하지 못한다.
- Consequences: continue-as-new run chain 전체를 하나의 sweep으로 상관 지어야 하고 page 설정은 Helm/runtime input으로 조정 가능해야 한다.
- Confirmation / Follow-up: Temporal test server에서 retry, heartbeat, continue-as-new, Worker restart와 stable input을 검증한다.

### structured log와 Temporal SDK metrics를 함께 제공한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-328`
- Status: Superseded by `저장된 실행 사실만 cleanup 관측값으로 제공한다` (2026-08-27)
- Context / Problem: metrics만으로 cursor/retry 원인을 설명하기 어렵고 로그만으로 cleanup lag와 backlog 추세를 지속 집계하기 어렵다.
- Decision Outcome: replay-aware Workflow log와 Activity structured log에 schedule/run/cursor/page/attempt/result를 기록하고, Temporal SDK counter/gauge/histogram으로 scanned/deleted/skipped/error, duration, cleanup lag와 oldest unavailable age를 노출한다. Worker Runtime Prometheus endpoint와 platform scrape metadata를 함께 제공한다.
- Alternatives Considered: 로그만 또는 metrics만 제공하는 방식은 각각 지속 집계 또는 원인 분석이 부족해 사용하지 않는다.
- Consequences: Worker port·telemetry 설정과 Helm scrape wiring이 추가되며 endpoint 존재와 실제 scrape를 구분해 검증해야 한다. Activity commit과 결과 전달 사이 장애로 수치는 회계 정확도를 보장하지 않으며 attempt/result와 backlog gauge를 함께 해석한다.
- Confirmation / Follow-up: unit/integration에서 metric 이름·tag cardinality와 replay 중복 억제를 확인하고 dev endpoint·collector target·sample 변화를 검증한다.

### 저장된 실행 사실만 cleanup 관측값으로 제공한다

- Decision Date: 2026-08-27
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, `PROD-328`
- Status: Active
- Context / Problem: Notification에는 unavailable 전이 시각이 없고 availability는 현재 source·Related 객체 관계에서 동적으로 계산된다. 생성 시각을 unavailable 시각으로 사용하면 오래된 Notification이 최근 unavailable이 된 경우 cleanup lag와 oldest unavailable age를 과대 보고한다.
- Decision Outcome: replay-aware Workflow log와 Activity structured log에 schedule/run/cursor/page/attempt/result를 기록하고, Temporal SDK counter/histogram으로 scanned/deleted/skipped/error와 duration을 노출한다. 저장되지 않은 unavailable 전이 시각을 추정한 age/lag 결과와 gauge는 제공하지 않는다.
- Alternatives Considered: Notification `unavailableAt`과 모든 관련 객체 전이를 새로 추적하는 방식은 cleanup 정확성에 필요하지 않고 migration·복구 semantics·복수 전이 owner를 추가하므로 이번 범위에 포함하지 않는다. 생성 시각 기반 값을 이름만 바꾸는 방식도 cleanup 지연을 나타내지 않아 사용하지 않는다.
- Consequences: 운영자는 Schedule 실행, Workflow 완료·실패, page 진행과 처리량으로 cleanup 실행·수렴을 판단한다. 실제 unavailable 체류 시간이 별도 운영 요구가 되면 저장 모델과 전이 소유권을 별도 이슈에서 설계해야 한다.
- Confirmation / Follow-up: unit/Temporal integration에서 removed age/lag 계약이 남지 않고 counter/histogram 이름·tag cardinality와 replay 중복 억제가 유지되는지 확인하며, dev endpoint·collector target·sample 변화를 검증한다.

### Cleanup persistence는 유일한 실행 owner인 Worker Activity가 소유한다

- Decision Date: 2026-08-26
- Decision Class: Implementation Choice
- Authority / Provenance: 사용자 결정, `PROD-328`
- Status: Active
- Context / Problem: Notification cleanup을 호출하는 실행 경계는 Worker Activity뿐인데 cursor 검증, upper-bound 조회와 DB transaction/delete를 core service에 두면 호출 owner와 persistence owner가 분리되고 Activity adapter가 중복된다.
- Decision Outcome: Worker Activity가 cleanup 입력 검증, upper-bound 조회, bounded scan/transaction/delete, retry-visible error mapping과 observability를 함께 소유한다. core에는 API와 Worker가 공유하는 viewer-independent source/related availability predicate만 남긴다.
- Alternatives Considered: core DB service를 유지하고 Worker Activity가 얇은 adapter로 남는 구조는 유일 caller인 Worker의 책임 경계를 흐리고 cleanup 구현을 두 곳으로 나눌 수 있으므로 사용하지 않는다.
- Consequences: Worker DB integration이 cleanup persistence의 직접 회귀 경계가 되며, core services export와 core cleanup DB test는 제거한다. Workflow는 Activity barrel의 type-only 경계를 통해 DB-bearing 모듈을 runtime import하지 않는다.
- Confirmation / Follow-up: Worker Activity build와 isolated DB suite에서 bounded, revalidation, idempotency, concurrency를 검증하고 OpenSpec 진행 checkbox는 기존 상태를 유지한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `structured log와 Temporal SDK metrics를 함께 제공한다` (2026-08-25) — unavailable 전이 시각 없이 age/lag를 추정하던 관측 범위를 2026-08-27 사용자 결정으로 축소했다.
