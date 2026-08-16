## Context

현재 Local GraphQL과 ActivityPub Create는 공통 core `createPost` transaction으로 Post·PostContent와 필요한 ActivityPub mapping을 원자적으로 저장한다. Reply Notification은 transaction 안의 격리 savepoint에서 생성되고 Local ActivityPub Create delivery는 commit 뒤 process-local 호출로 실행된다. DB transaction 자체는 이미 원자성을 보장하므로 이를 Temporal Activity로 옮기면 commit 결과 모호성, stable proposed ID와 동기 요청의 Temporal 의존성만 추가된다.

이번 change는 기존 transaction을 유지하고 commit 이후 effects만 Temporal로 옮긴다. commit과 Workflow start 사이의 유실 가능성은 명시적으로 수용하며 transactional outbox/relay를 추가하지 않는다. Start가 accepted된 뒤에는 Temporal history와 Activity retry가 Reply Notification과 Local-origin Fedify queue handoff를 복구한다.

Worker foundation은 health·signal 경계를 제공하지만 production entrypoint에는 optional registration과 fail-fast 분기가 남아 있고 Helm은 `worker.enabled`로 Deployment를 숨긴다. PROD-722는 첫 실제 effects Workflow와 singleton Worker activation을 함께 전달한다. DB 역할·RLS cleanup은 별도 소유이며 Worker Activity는 platform의 표준 process 기본 `db`만 소비한다.

## Goals / Non-Goals

**Goals:**

- Local/AP Post transaction과 기존 동기 응답·acknowledgement 의미를 유지한다.
- core `createPost(input)`이 자체 transaction commit 뒤 stable Post ID의 effects Workflow start를 시도한다.
- accepted Workflow가 Reply Notification과 Local-origin Create queue handoff를 멱등 재시도하고 AP-origin echo를 억제한다.
- 실제 registration 하나와 process-global Worker host 하나를 구성하고 `worker.enabled` 없이 application workload에 Worker를 포함한다.
- dev에서 실제 effects, readiness, restart 복구와 graceful drain을 검증한다.

**Non-Goals:**

- Post transaction을 Temporal Activity로 이동하거나 transaction commit을 Temporal로 보장
- proposed Post ID, command receipt, transactional outbox/relay 또는 commit→start exactly-once
- Post Delete, Repost, Reaction, Follow, Profile effects 전환
- DB principal·Secret·ACL·RLS cleanup과 별도 Worker DB connection
- Fedify MessageQueue consumer/remote delivery retry 재설계
- production sync, rollout 또는 live verification

## Implementation Guidance

### Current Constraints

- `createPost`가 caller의 `DatabaseHandle`을 받거나 `postCommit` callback을 반환하면 API/Fedify가 transaction과 후속 효과의 실행 순서를 계속 조립해야 한다.
- 이 action의 production caller는 Post Create를 다른 outer transaction에 합성하지 않으므로 core action이 자체 transaction과 commit 이후 Workflow start를 연속해서 소유할 수 있다.
- ActivityPub duplicate/concurrent Create는 `created=false`로 수렴한다. 이 결과에서 과거 누락 effects를 backfill하면 duplicate 요청의 의미가 바뀐다.
- Workflow start 요청은 commit 뒤 실행되므로 process가 그 사이 종료되거나 Temporal start가 실패하면 effects가 누락될 수 있다. outbox 없이 이 구간을 복구한다고 주장할 수 없다.
- 하나의 effects Workflow 안에서 Notification과 Fedify handoff 중 하나의 최종 실패가 다른 효과의 실행을 막지 않아야 한다.
- 현재 Worker startup은 caller가 registration을 전달할 수 있고 entrypoint는 `undefined`를 전달한다. Helm도 별도 activation flag를 요구한다.

### Recommended Approach

공통 core `createPost(input)` action은 자체 transaction을 commit한 뒤 실제 생성 결과에만 committed Post ID의 effects Workflow start를 시도하고 최종 Post 결과를 반환한다. explicit `origin`은 Workflow input으로 전달한다. 실행 중인 동일 ID와 충돌하면 기존 execution으로 수렴하고, 종료된 동일 ID는 상태와 관계없이 재사용하지 않는다. start 실패는 action 내부에서 관측하고 격리해 기존 Post/GraphQL/ActivityPub 성공을 유지한다. API resolver와 Fedify handler는 database handle이나 후속 callback을 전달·호출하지 않는다.

Workflow input은 committed Post ID와 origin처럼 다시 조회 가능한 최소 identity만 포함한다. 같은 Post에 대한 반복 start는 Temporal의 Workflow ID conflict policy로 실행 중인 accepted execution에 수렴하고 reuse policy로 종료된 execution의 재시작을 거부한다. duplicate/no-op Post 결과에서는 start를 시도하지 않는다. Start가 accepted되기 전의 누락은 복구하지 않는다.

Accepted Workflow는 Reply Notification과 Local-origin Fedify queue handoff를 별도 Activity로 실행한다. 두 효과가 모두 적용될 수 있는 경우 서로 독립적으로 시작하고 각 Activity의 retry/최종 실패가 다른 효과를 선행 차단하지 않게 결과를 함께 수집한다. Notification Activity는 process 기본 `db`로 committed Post를 다시 조회해 기존 recipient·self suppression·visibility·uniqueness 정책과 멱등 insert를 직접 소유한다. production caller가 하나뿐인 별도 core service wrapper는 두지 않는다. Delivery Activity는 기존 canonical Local Note identity, audience/target과 queue producer를 재사용하며 `origin=ACTIVITYPUB`이면 생성하지 않는다.

Worker package는 compile-time registration을 직접 소유하고 production entrypoint 자체가 process-global host를 한 번 시작한다. 별도 `runWorker`/`startWorker` callable lifecycle은 두지 않는다. health server, Temporal connection, Worker와 signal handler도 같은 entrypoint가 단독 소유한다. Helm은 정상 application workload에서 Worker Deployment를 항상 render하고 chart-wide `workloads.enabled` bootstrap 경계만 유지한다. Worker DB principal·Secret wiring은 이 change에서 바꾸지 않고 표준 process `db`를 소비한다.

### Allowed Alternatives

- core action 내부의 commit 이후 start 구현은 달라질 수 있지만 API/Fedify caller에 database handle이나 callback 실행 책임을 노출해서는 안 된다.
- 두 effects Activity를 병렬 또는 독립 child로 구성할 수 있다. 다만 하나의 효과 실패가 다른 효과를 영구히 막지 않고 Post 성공과 분리되는 specs를 만족해야 한다. 현재는 단일 Workflow 안의 독립 Activity가 기본 경로다.
- Worker host 내부 함수 배치는 달라질 수 있지만 production caller가 registration을 주입하거나 같은 process에서 host를 두 번 시작할 수 있는 public API를 노출해서는 안 된다.

### Known Traps

- Post transaction을 Workflow/Activity로 옮기거나 proposed Post ID·command receipt를 추가하지 않는다.
- commit 전에 Workflow를 시작하거나 rollback될 수 있는 Post ID로 effects를 실행하지 않는다.
- commit→start 유실을 Temporal retry가 해결한다고 기록하지 않는다. start accepted 이후에만 durable recovery가 시작된다.
- duplicate/no-op Create를 누락 effects backfill 계기로 사용하지 않는다.
- Workflow 코드에서 DB, Fedify, 시간·난수 또는 process environment를 직접 사용하지 않는다.
- Notification과 Fedify handoff를 한 Activity에 합쳐 한쪽 실패가 다른 쪽 retry를 중복시키지 않는다.
- Temporal queue handoff retry와 Fedify consumer의 remote HTTP retry가 같은 delivery를 동시에 소유하지 않게 한다.
- optional registration, idle Workflow, smoke task queue 또는 `worker.enabled` 대체 flag를 추가하지 않는다.

## Risks / Trade-offs

- [Commit 뒤 Workflow start 전에 process가 종료되면 effects가 유실됨] → 현재 범위가 의도적으로 수용하며 실패 없는 exactly-once를 주장하지 않는다. 반드시 제거해야 한다면 별도 canonical/Linear 계약으로 transactional outbox를 검토한다.
- [Temporal start가 실패하면 Notification과 federation handoff가 모두 누락될 수 있음] → 실패를 Post ID와 함께 관측하고 committed Post/응답은 유지한다. 이번 change는 자동 reconciliation을 추가하지 않는다.
- [같은 Post의 start가 중복 호출됨] → deterministic Post-based Workflow ID와 start conflict 처리를 사용해 accepted execution 하나로 수렴한다.
- [한 effects Activity가 장기간 실패함] → 다른 Activity를 독립 실행하고 각 실패를 관측한다. Post와 caller 성공은 유지한다.
- [Worker와 ingress를 되돌리면 accepted Workflow가 polling되지 않을 수 있음] → Temporal history는 보존되므로 호환 Worker 재배포로 재개할 수 있다. production 전환에는 별도 drain·rollback 승인이 필요하다.

## Migration Plan

1. 최신 main에서 core-owned transaction 이후 Workflow start, Workflow/Activities와 singleton Worker registration을 구현하고 기존 Post transaction 회귀 검증을 통과시킨다.
2. 같은 revision에서 `worker.enabled`를 제거하고 dev/prod render에 Worker가 존재하는지 정적으로 검증한다. DB credential/RLS cleanup 파일은 흡수하지 않는다.
3. merge된 exact revision을 dev에 적용한 뒤 Worker RUNNING/readiness, Local/AP effects, accepted Workflow의 Activity retry와 Worker restart를 검증한다.
4. 실패 시 새 effects start와 Worker revision을 함께 되돌린다. 이미 accepted된 Workflow history는 삭제하지 않고 호환 Worker를 다시 배포해 처리한다.
5. production은 이 change에서 적용하지 않는다. 추후 별도 승인 시 commit→start 유실 수용, in-flight Workflow와 rollback Worker 호환성을 다시 검토한다.

## Open Questions

없음.
