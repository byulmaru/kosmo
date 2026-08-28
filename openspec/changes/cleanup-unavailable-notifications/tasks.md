## 1. PROD-328 공통 availability 계약

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-328`

**Deliverable**

API와 cleanup이 같은 kind별 source·Recipient·Related Post/Profile availability 계약을 사용하며 기존 API 결과가 바뀌지 않는다.

**Guardrails**

- Account membership은 API authorization에만 적용하고 cleanup 삭제 원인으로 사용하지 않는다.
- Recipient Profile 자체의 일시 비활성·정지는 API에서 숨기되 cleanup 삭제 원인에서 제외한다.

**Verification**

- 기존 Notification connection, count, Node와 Read integration suite가 kind별 source missing, mismatch와 hidden 관계에서 같은 결과를 유지한다.
- core visibility 수준에서 API와 Worker cleanup이 viewer-independent availability predicate를 공유함을 검증한다.

- [x] 1.1 현재 kind별 source·Related availability SQL을 API session/membership과 분리 가능한 core 경계로 정리한다.
- [x] 1.2 API connection, count, Node와 Read가 공통 availability 계약과 기존 membership을 조합하게 한다.
- [x] 1.3 Follow, Follow Request, Reaction, Repost와 Reply의 기존 visible/hidden integration regression을 통과시킨다.
- [x] 1.4 Recipient Profile 자체의 inactive/suspended 상태가 API에서는 숨겨지고 cleanup eligibility에서는 제외되는 regression을 추가한다.

## 2. PROD-328 bounded cleanup 저장 경계

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-328`

**Deliverable**

Notification row를 UUIDv7 exclusive cursor의 bounded page로 scan하고 실제 삭제 시점에도 unavailable인 정확한 row만 멱등 삭제한다.

**Guardrails**

- page 삭제 전에 durable하게 캡처한 최대 ID보다 큰 row는 현재 sweep에 끌어오지 않는다. 이 ID 경계를 생성·commit 시각 snapshot으로 해석하지 않는다.
- offset, createdAt-only cursor, unbounded transaction과 `kind + sourceId` page 삭제를 사용하지 않는다.
- Read State를 별도 전이하지 않고 삭제된 Notification row와 함께 제거한다.

**Verification**

- source missing, Recipient mismatch, Related Post/Profile unavailable, available row, Recipient inactive row를 Worker Activity의 한 page와 복수 page에서 검증한다.
- concurrent source deletion/recreation, concurrent Notification insert/delete, 삭제된 cursor row와 반복 호출이 대상 외 row를 삭제하지 않음을 독립 connection으로 검증한다.

- [x] 2.1 sweep upper bound와 exclusive cursor를 만들고 검증하는 bounded cleanup 입력·결과 계약을 구현한다.
- [x] 2.2 page의 scanned row 중 삭제 경계에서도 unavailable인 Notification ID만 조건부 삭제한다.
- [x] 2.3 page 결과에 next cursor, done과 scanned/deleted/skipped 수를 제공한다.
- [x] 2.4 empty table, empty/final page, exact page boundary와 다음 sweep의 새 row 포함을 검증한다.
- [x] 2.5 source missing·mismatch·Related unavailable 삭제와 available·Recipient inactive 보존을 검증한다.
- [x] 2.6 retry와 독립 connection 경합에서 idempotency, delete revalidation과 최종 수렴을 검증한다.
- [ ] 2.7 representative backlog query plan과 page duration을 확인하고 추가 index 없이 PK keyset과 DB budget을 만족하는지 기록한다.

## 3. PROD-328 Temporal cleanup 실행

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-328`
- `PROD-730`

**Deliverable**

공용 Worker가 bounded cleanup Activity를 cursor checkpoint와 rate limit으로 반복 실행하고 retry, Worker 재시작, 부분 실패와 긴 history 뒤에도 sweep을 완료한다.

**Guardrails**

- Workflow는 DB I/O를 직접 수행하지 않는다.
- Activity는 bounded page, timeout, heartbeat와 retry 상한을 가진다.
- history를 무한히 누적하지 않고 cursor와 upper bound를 continue-as-new에 전달한다.
- cleanup 실패가 다른 Post/Reaction/Repost/Profile Workflow의 결과를 바꾸지 않는다.

**Verification**

- package build/unit/database checks와 Temporal local test server에서 Workflow registry, stable input, retry, heartbeat, rate timer와 continue-as-new chain을 검증한다.
- Worker 종료와 부분 page 실패 뒤 같은 sweep이 checkpoint에서 최종 수렴함을 검증한다.

- [x] 3.1 cleanup page Activity를 Worker registry에 연결하고 bounded result를 안정적인 payload로 반환한다.
- [x] 3.2 cursor, upper bound, page 설정과 누적 관측 상태를 가진 cleanup Workflow를 등록한다.
- [x] 3.3 page 사이 처리율 제한과 Activity start-to-close/schedule-to-close/heartbeat/retry 정책을 적용한다.
- [x] 3.4 history 임계치에서 continue-as-new하고 run chain 전체가 같은 sweep 상관관계를 유지하게 한다.
- [x] 3.5 retryable DB 오류와 non-retryable cursor/config 오류를 구분한다.
- [x] 3.6 Temporal integration에서 첫 Activity 실패 후 stable retry, heartbeat, continue-as-new와 최종 cursor를 검증한다.
- [ ] 3.7 (PR #665 소유) Worker restart·Activity result loss·부분 page 실패 뒤 중복 삭제 없이 최종 수렴하는 database/Workflow integration을 검증한다. Activity commit 뒤 result 유실로 실제 DB 처리량과 Workflow accepted-result counter가 달라질 수 있음을 전제로 하며, DB count와 counter의 일치를 검증하지 않는다.
- [x] 3.8 기존 Worker build·unit·workflow·database 전체 검증을 통과시킨다.

## 4. PROD-328 cleanup 관측

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-328`

**Deliverable**

운영자가 schedule/run/page를 상관 지어 실행 성공·실패와 scanned/deleted/skipped/error, duration을 구조화 로그와 SDK metrics에서 확인할 수 있다.

**Guardrails**

- Workflow replay가 로그와 final-result metrics를 중복 성공으로 보이게 하지 않는다.
- Notification ID, Profile ID나 source ID를 metric tag로 사용해 cardinality와 개인정보 범위를 늘리지 않는다.
- Worker Runtime endpoint와 Helm endpoint metadata를 제공한다.

**Verification**

- unit/Temporal integration에서 log fields, metric names/types/tags와 success/error/retry 결과를 검증한다.
- dev Worker metrics endpoint와 Helm endpoint metadata를 확인한다.

- [x] 4.1 replay-aware Workflow log와 Activity structured log에 bounded 상관관계·cursor·attempt·result를 기록한다.
- [x] 4.2 SDK counter/histogram으로 scanned/deleted/skipped/error와 duration을 노출한다.
- [ ] 4.3 Worker Runtime metrics endpoint와 low-cardinality resource/schedule tags를 구성한다.
- [ ] 4.4 Helm에 metrics port와 endpoint metadata를 렌더하고 dev endpoint 및 metadata를 검증한다.
- [ ] 4.5 (PR #665 소유) 성공, retry, terminal failure와 empty backlog에서 우리 Activity attempt log와 Workflow accepted-result counter·terminal error의 의미가 구분되는지 검증한다. 외부 Temporal SDK 동작이나 golden 문자열 자체는 검증하지 않는다.

## 5. PROD-328 24시간 Schedule reconciliation

**Authority / Provenance**

- `PROD-328`
- `PROD-719`
- `PROD-730`

**Deliverable**

각 환경의 deterministic Temporal Schedule이 namespace 준비 뒤 24시간마다 cleanup Workflow를 best-effort로 시작하며, 선언적으로 create/update/pause되고 겹친 sweep을 누적하지 않는다.

**Guardrails**

- Schedule은 Worker replica startup에서 mutate하지 않는다.
- disabled 상태는 기존 Schedule을 방치하거나 delete하지 않고 pause한다.
- namespace 또는 Schedule reconciliation 실패 시 후속 rollout이 진행되지 않는다.
- prod live activation은 별도 배포 승인 없이 수행하지 않는다.

**Verification**

- dev/prod Helm render, production runtime dependency, PreSync wave/deadline/backoff/security context를 검증한다.
- dev에서 create, 같은 선언 no-op/update, drift 수렴, pause/unpause, overlap SKIP와 connection failure를 검증한다.

- [ ] 5.1 Temporal Schedule client를 production runtime dependency로 추가하고 package lockfile 정합성을 유지한다.
- [ ] 5.2 환경별 deterministic ID와 24시간 interval, 공용 task queue, cleanup action, overlap SKIP를 reconcile하는 one-shot command를 구현한다.
- [ ] 5.3 enabled=false가 기존 Schedule pause, enabled=true가 create/update/unpause로 수렴하게 한다.
- [ ] 5.4 namespace PreSync 뒤 workload보다 먼저 실행되는 bounded fail-closed Schedule reconciliation Job과 values를 추가한다.
- [ ] 5.5 dev/prod render에서 address, namespace, schedule desired state, security context와 prod activation 경계를 검증한다.
- [ ] 5.6 dev에서 반복 reconcile, drift update, pause/unpause, overlapping trigger와 frontend failure를 검증한다.

## 6. PROD-328 통합·rollout·archive

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `PROD-328`

**Deliverable**

dev에서 unavailable Notification cleanup이 API 즉시 숨김과 독립적으로 수렴하고, 안전한 pause rollback 및 완료 증거를 갖춘 뒤 이 OpenSpec change를 archive한다.

**Guardrails**

- CI, Helm render, dev live execution, merge와 production은 서로 다른 증거 수준으로 보고한다.
- Schedule pause는 cleanup만 중지하고 API visibility 및 다른 Worker Workflow를 변경하지 않는다.
- historical backfill, UI와 prod live activation을 archive gate로 끌어오지 않는다.

**Verification**

- dev에서 source missing, Recipient mismatch, Related Post/Profile unavailable, large backlog, retry, restart, pause rollback과 logs/metrics endpoint를 종단 검증한다.
- focused/full checks, strict OpenSpec validation과 canonical delta sync를 확인한다.

- [ ] 6.1 focused core/API/Worker/Helm checks와 workspace에서 요구하는 전체 검증을 실행하고 실패 경계를 기록한다.
- [ ] 6.2 dev fixture로 API 즉시 비노출 뒤 cleanup 삭제, Read State 제거와 available·Recipient inactive row 보존을 검증한다.
- [ ] 6.3 large backlog에서 bounded page/rate, DB connection/API latency budget과 continue-as-new 수렴을 확인한다.
- [ ] 6.4 DB·Temporal 일시 장애와 Worker restart 뒤 다음 성공한 실행이 checkpoint에서 수렴함을 확인한다.
- [ ] 6.5 24시간 Schedule desired state, Workflow 완료·실패, structured logs와 metrics endpoint·Helm endpoint metadata를 dev live evidence로 확인한다.
- [ ] 6.6 Schedule을 pause해 cleanup만 중지되고 API 즉시 숨김과 다른 Worker Workflow가 유지되는 rollback을 검증한다.
- [x] 6.7 구현 중 확인한 canonical/Linear 계약 변경을 먼저 정렬하고 OpenSpec delta·decision·task를 동기화한다.
- [ ] 6.8 모든 범위와 검증이 완료된 뒤 strict validation을 통과시키고 canonical spec sync를 확인한 후 change archive를 수행한다.
