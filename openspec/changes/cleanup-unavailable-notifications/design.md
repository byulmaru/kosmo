## Context

`notification`은 loose `source_id`를 가지며 source FK나 cleanup index가 없다. API는 `visibleNotificationWhere`에서 Account membership과 kind별 source·Recipient·Related Post/Profile availability를 함께 검사해 unavailable row를 connection, count, Node와 Read에서 숨기지만, Worker는 session이 없어 이 API helper를 직접 사용할 수 없다.

현재 `apps/worker`는 공용 `kosmo` task queue에 정적 Workflow/Activity registry를 제공하지만 Schedule, continue-as-new, heartbeat와 custom metrics는 아직 없다. PROD-719의 namespace PreSync와 PROD-730의 Worker foundation은 완료됐으며, PROD-328이 첫 periodic cleanup capability와 실제 운영 검증을 소유한다.

## Goals / Non-Goals

**Goals:**

- API와 cleanup이 같은 viewer-independent source availability predicate를 소비하게 한다.
- UUIDv7 Notification ID의 exclusive keyset cursor와 bounded page로 유한한 sweep을 구성한다.
- 재시도, Worker 재시작, 부분 실패와 중복 실행 뒤에도 대상 외 row를 삭제하지 않고 수렴한다.
- 24시간마다 실행하는 best-effort Schedule을 독립적으로 reconcile·pause할 수 있게 한다.
- structured log와 Temporal SDK metrics로 schedule/run/page 상관관계, 실행 성공·실패, page 결과와 retry를 관측한다. Activity attempt log와 Workflow가 수락한 Activity result 기반 counter를 구분한다.

**Non-Goals:**

- API visibility, GraphQL schema, UI 또는 Read mutation 의미 변경
- source action 직후 create/delete effect, event intent/outbox와 historical backfill
- Recipient Profile 자체의 일시 비활성·정지 cleanup
- Fedify inbox/outbox transport와 ActivityPub delivery 변경
- DB 물리 처리량을 별도 회계값으로 보존하기 위한 ledger, schema 또는 migration
- platform collector target 연결과 실제 scrape/sample 수집 검증

## Implementation Guidance

### Current Constraints

- API predicate에는 Account membership과 Recipient 자체 availability가 포함돼 있다. 이를 단순 부정하면 session이 없는 Worker에서 사용할 수 없고, Recipient 자체의 복구 가능한 비가시성까지 삭제하게 된다.
- 각 kind는 source와 Related 객체를 다르게 파생한다. cleanup 전용 SQL을 복사하면 이후 API visibility가 바뀔 때 drift한다.
- 기존 `deleteNotificationBySource(kind, sourceId)`는 source action cleanup용이다. page cleanup에서 사용하면 정확한 Notification ID 경계와 삭제 직전 revalidation을 잃는다.
- `(recipient_profile_id, id DESC)` index는 API 목록용이지만 Notification PK인 UUIDv7 `id`는 전역 ascending keyset sweep에 사용할 수 있다. `created_at`은 unique cursor가 아니다.
- Schedule을 Worker startup에서 create/update하면 복수 replica가 같은 Schedule을 mutate하고, disabled rollout이 기존 Schedule을 멈추지 못할 수 있다.
- Activity 완료 응답이 유실되면 DB commit은 성공했어도 retry 결과의 deleted count는 0일 수 있다. Workflow의 누적 counter는 수락한 Activity result의 논리적 합계이며 DB 물리 처리량 회계값이 아니다. Activity attempt log·duration·attempt error와 Workflow accepted-result counter·terminal error, backlog 상태를 서로 구분해야 한다.

### Recommended Approach

viewer-independent Notification source availability SQL을 core visibility 경계로 추출한다. API는 이 predicate에 membership을 더하고, cleanup은 Recipient 자체 state/instance availability를 삭제 원인에서 제외한 같은 predicate를 사용한다. Post/Profile visibility의 공통 하위 helper도 core로 이동해 API와 Worker가 역방향 의존 없이 공유한다. Cleanup의 cursor 검증, upper-bound 조회, bounded scan/transaction/delete와 Activity 관측 경계는 유일한 실행 owner인 Worker Activity가 소유하며, core에는 이 persistence 구현을 두지 않는다.

Workflow는 page 삭제 전에 별도 Activity로 현재 최대 Notification ID를 캡처하고, 그 결과를 durable state로 받은 시점을 sweep 시작으로 고정한다. page Activity는 explicit non-null upper bound와 `cursor < id <= upperBound`를 UUIDv7 ascending 순서로 제한해 읽고, 같은 transaction의 삭제 statement에서 Notification ID와 unavailable predicate를 다시 확인한다. 결과는 `nextCursor`, scanned/deleted/skipped와 done을 반환한다. Workflow는 완료되지 않은 모든 page 뒤에 rate-limit timer를 두고 cursor를 전달하며, history 임계치 또는 SDK 권고에 도달하면 cursor·upper bound·누적 관측 상태를 입력으로 continue-as-new 한다. 캡처보다 큰 ID는 다음 sweep으로 미루되, UUIDv7의 같은-millisecond random ordering 때문에 이 경계를 생성·commit 시각 snapshot으로 해석하지 않는다.

Activity는 page 시작과 완료에 heartbeat를 기록하고 bounded transaction에 start-to-close, schedule-to-close와 retry 상한을 둔다. DB 일시 오류는 retryable, 잘못된 cursor·설정은 non-retryable로 분류한다. Workflow/Activity는 replay-aware structured log를 사용하고 SDK counter/histogram으로 scanned/deleted/skipped/error와 duration을 노출한다. Workflow의 scanned/deleted/skipped counter는 수락한 Activity result의 논리적 합계이고, Activity duration·attempt error와 로그는 개별 attempt 실행 사실이다. Worker Runtime의 Prometheus endpoint와 Helm endpoint metadata를 제공한다. Notification에 unavailable 전이 시각이 저장되지 않으므로 생성 시각을 unavailable age나 cleanup lag로 해석하지 않는다.

Temporal client를 사용하는 one-shot Schedule reconciler를 application runtime image에 추가하고 namespace PreSync 뒤, workload sync 전에 실행한다. 환경별 deterministic Schedule ID, 24시간 interval, `SKIP` overlap, 공용 task queue와 cleanup Workflow action을 선언값으로 create/update한다. cleanup disabled 상태도 Job을 생략하지 않고 기존 Schedule을 pause하도록 reconcile한다.

### Allowed Alternatives

- page Activity가 하나의 parameterized SQL CTE/DELETE statement로 scan과 조건부 삭제를 함께 수행해도 된다. exclusive cursor, upper bound, bounded row 수, 삭제 직전 unavailable revalidation과 결과 관측을 보존해야 한다.
- page마다 continue-as-new를 고정하지 않고 `continueAsNewSuggested` 또는 보수적인 page 상한을 사용할 수 있다. 어느 방식이든 history가 무한히 커지면 안 된다.

### Known Traps

- 전체 `visibleNotificationWhere`를 부정해 membership 실패나 Recipient 자체 inactivity를 삭제 원인으로 삼지 않는다.
- source availability predicate를 API와 core에 두 벌로 유지하지 않는다.
- page scan 결과만 믿고 `DELETE WHERE id IN (...)`를 실행하지 않는다. 삭제 statement에서 availability를 다시 확인한다.
- `kind + sourceId` bulk delete, offset pagination, unbounded transaction 또는 한 Workflow의 무한 loop를 사용하지 않는다.
- Schedule template를 disabled일 때 렌더하지 않는 방식으로 rollback하지 않는다. 이미 생성된 Schedule이 계속 실행될 수 있다.
- namespace/Worker foundation 성공을 cleanup Workflow 실행 또는 DB 수렴 증거로 보고하지 않는다.

## Risks / Trade-offs

- [매일 전체 Notification keyspace를 scan해 table 성장에 따라 비용이 증가한다] → upper bound, PK keyset, configurable bounded page/rate limit와 scan duration metrics로 비용을 제한하고, 실제 근거가 생길 때만 추가 index나 event-driven 구조를 별도 change로 검토한다.
- [API predicate refactor가 기존 visibility를 바꿀 수 있다] → 기존 GraphQL integration suite와 kind별 source/hidden fixture를 그대로 통과시키고 SQL filtering이 limit 전에 유지되는지 검증한다.
- [source가 scan과 delete 사이에 회복될 수 있다] → 정확한 Notification ID와 unavailable predicate를 delete statement에서 재평가한다.
- [Schedule outage로 다음 sweep이 24시간 뒤로 밀릴 수 있다] → 24시간을 deadline이 아닌 best-effort interval로 해석하고 failed/missed run과 Workflow 완료·오류를 구분해 관측한다.

## Migration Plan

1. shared source availability predicate를 core visibility 경계에 두고 Worker Activity에 bounded cleanup 저장 경계를 추가한 뒤 기존 API visibility 및 Worker DB regression을 통과시킨다.
2. cleanup Activity/Workflow, continue-as-new, heartbeat, structured log와 SDK metrics를 Worker registry에 추가한다.
3. Worker metrics endpoint와 Schedule reconciler/Helm values·PreSync Job을 추가하되 처음에는 Schedule을 paused 상태로 배포해 render와 idempotent reconcile을 검증한다.
4. dev에서 수동 trigger로 source missing, invalid Recipient, Related Profile/Post unavailable, retry·restart·partial failure와 large page 수렴을 확인한다.
5. dev Schedule을 unpause하고 24시간 interval, overlap SKIP, Worker drain, metrics endpoint·Helm endpoint metadata와 API latency/DB budget을 확인한다.
6. rollback은 Schedule을 pause하는 선언값을 sync한다. API visibility와 Worker의 다른 Workflow는 유지하며 cleanup code 제거는 후속 revert로 분리한다.

## Open Questions

없음.
