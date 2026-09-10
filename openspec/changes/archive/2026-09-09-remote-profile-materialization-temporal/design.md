## Context

현재 상위 remote actor caller는 검색·발견 경계에서 받은 canonical `actorUri`와 Fedify `Context`를 조합해 직접 원격 조회를 수행한다. 저장된 actor가 stale하면 기본 scheduler가 process-local fire-and-forget callback으로 같은 materializer를 다시 호출하고, `searchProfiles`는 별도 callback seam을 주입해 refresh를 끈다. 반면 Worker는 하나의 Kosmo task queue에서 Workflow가 Activity를 호출하는 구조이며, core Temporal client에는 안정적인 Workflow ID와 caller deadline을 사용하는 선례가 있다.

Temporal Workflow에는 Fedify `Context`, hydrated actor 또는 DB row를 전달할 수 없다. 원격 HTTP와 DB transaction은 Activity가 소유해야 하며, Activity 실행 시각도 Activity 내부에서 정한다. 이 Workflow가 다른 Workflow의 child로 실행될 때 Temporal의 parent close와 cancellation propagation은 별도 옵션으로 제어해야 한다. inbound Follow의 요청 context와 기존 lookup, inbound Update의 검증된 actor/no-network projection은 이 전환의 호출 경계 밖에 남는다.

## Goals / Non-Goals

**Goals:**

- 신규 materialization과 stale refresh를 하나의 짧은 Workflow와 하나의 Activity 실행 경로로 통합한다.
- 검색·발견 경계가 제공한 `actorUri`로 신규 materialization과 저장된 `actorUri` refresh를 같은 wire input 경계에서 처리하고, 선택적인 `profileId`에 따른 origin 선택, unsigned lookup, sync/async caller 계약과 fresh/stale fast path를 유지한다.
- stale Profile과 명시적 qualified remote search는 기존 row를 즉시 반환하고 동일한 Workflow refresh를 시작한다.
- sync caller의 대기 제한이 끝나도 이미 시작된 Workflow가 계속 실행되도록 하며, 결과 payload는 Profile identity로 제한한다.
- async child caller가 start acknowledgement 뒤 parent 종료·실패·취소를 거쳐도 child가 계속 실행되도록 한다.
- 기존 actor projection, transaction, identity/state/ordering, 오류 관측과 검색 fallback을 재사용한다.

**Non-Goals:**

- DB schema/migration, target eligibility 정책, Profile Migration 동작
- inbound Update 또는 inbound Follow context의 동작 변경
- 새 HTTP client, parser, projection, status API, 주기 scanner, 장수명 Profile Workflow 또는 범용 Workflow framework
- Temporal Workflow 안에서 caller mode에 따라 분기하거나 wire payload에 actor object·DB row를 추가하는 것
- production rollout, merge/queue와 migration Stack의 branch/base 재배치

## Implementation Guidance

### Current Constraints

- 상위 materializer가 stale 판단과 저장 Profile 반환을 담당하고, 실제 remote lookup과 transaction은 별도 low-level 경로로 분리해야 Activity가 상위 Temporal coordinator를 재귀 호출하지 않는다.
- Activity는 JSON-safe `actorUri`와 선택적인 `profileId`로 필요한 origin을 재구성해야 한다. `profileId`가 없으면 configured Local Instance의 canonical origin을 사용하고, 있으면 DB에서 Profile과 actor metadata를 읽어 Local Instance canonical origin 또는 Remote actor URI origin을 선택한다. 필요한 Remote actor 정보가 없으면 실패한다. `actorUri`는 저장된 actor가 없어도 직접 Fedify lookup target으로 사용할 수 있으며, acct handle lookup을 수행하지 않는다.
- Temporal payload에 Fedify context, actor object, DB row를 넣을 수 없으므로 Activity가 새 federation context를 만들고 실행 시각을 정한다. 결과는 Profile ID만 반환한 뒤 caller가 필요하면 DB에서 다시 읽는다.
- 현재 Activity 기본 재시도 설정은 외부 일시 장애에는 유용하지만, actor 미해결·identity 충돌·suspended/unresponsive 같은 예상 domain 결과를 그대로 재시도하면 불필요한 원격 요청이 반복된다.
- Child Workflow 옵션은 `workflowIdConflictPolicy`를 지원하지 않으므로 client caller의 `USE_EXISTING`을 child 호출에 그대로 적용할 수 없다. parent close와 parent cancellation 전파는 각각 별도 옵션으로 다뤄야 한다.

### Recommended Approach

1. 상위 remote actor caller는 검색·발견 경계에서 canonical `actorUri`를 전달받고, 선택적인 `profileId`와 caller mode를 유지한다. stale row를 관찰하면 저장된 actor URI를 `actorUri` input으로 재사용하고, 저장된 row가 없어도 검색·발견 결과의 `actorUri`로 신규 materialization을 요청한다. Workflow input에는 caller mode를 넣지 않고, caller가 동기 요청이면 같은 stable Workflow ID로 실행 결과를 기다리고 비동기 요청이면 같은 ID로 durable start acknowledgement만 기다린다.
2. 입력 identity(`actorUri`)와 origin 선택 identity(`profileId` 값 또는 기본 origin marker)로 stable Workflow ID를 만든다. Workflow 밖 Temporal Client caller가 같은 actor URI라도 다른 origin 선택 identity를 사용하면 실행을 합치지 않으며, 같은 identity로 동시에 요청하면 `USE_EXISTING`으로 진행 중 실행에 합류한다. 완료 후에는 DB fast path가 새 실행을 막지 않도록 한다.
3. Activity는 `actorUri`와 선택적인 `profileId`를 검증하고 origin에서 새 federation context를 만든다. `actorUri`를 직접 조회하며 acct handle lookup을 수행하지 않는다. 외부 lookup 전에 현재 Profile·actor metadata·Instance 상태와 staleness를 다시 확인하고, 이미 fresh하거나 더 이상 eligible하지 않은 대상은 원격 작업 없이 종료한다. 반환 actor URI가 예상한 `actorUri`와 일치하는지 확인한 뒤 기존 actor 검증·projection, canonical identity 재사용, transaction과 stale ordering을 한 번 호출한다. URI 불일치는 저장 없이 실패한다. Workflow는 이 Activity를 한 번 호출하고 Profile ID를 반환한다.
4. 상위 caller는 저장 row를 먼저 확인한다. fresh row는 Workflow를 시작하지 않고 반환한다. stale active row는 eligibility가 허용되는 경우 row를 즉시 반환하면서 동일한 Workflow를 시작하고, 시작 실패는 row를 무효화하지 않는다. 저장 row가 없으면 동기 caller만 Activity 결과를 기다려 Profile ID를 다시 읽고, 비동기 caller는 durable start acknowledgement 뒤 반환한다.
5. caller가 다른 Workflow인 경우에도 동기 mode는 같은 Workflow child의 완료를 기다린다. 비동기 mode는 같은 Workflow를 child로 `startChild`하고 child start event acknowledgement만 기다린다. 이 child에는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 각각 적용해 start acknowledgement 이후 parent 종료·실패·취소가 child 완료를 막지 않게 한다. `ChildWorkflowOptions`에 없는 `workflowIdConflictPolicy`를 설정하거나, 동일 active child를 자동 join하는 wrapper를 추가하지 않는다.
6. `searchProfiles`의 명시적 qualified handle은 이 helper의 기본 refresh 경계를 사용한다. partial/local/malformed 검색, `profileByHandle`, profile route는 DB-only로 유지한다. inbound Follow는 기존 request context와 lookup 경계를 유지하고, inbound Update는 검증된 actor를 직접 투영하는 기존 no-network 경계를 유지한다.
7. Activity에서 예상 가능한 영구 domain rejection은 non-retryable 결과로 매핑하고, 일시적인 외부/DB 장애는 기존 Temporal retry 정책을 사용한다. caller는 신규 materialization의 기존 오류·empty-result 매핑과 stale Profile 보존을 구분한다. client deadline은 기다리는 RPC에만 적용하고 이미 시작된 Workflow를 취소하지 않는다.

### Allowed Alternatives

동일한 stable Workflow ID와 caller-only mode 경계를 유지한다면, 동기 caller가 `workflow.execute` 또는 `executeChild`를 사용하고 비동기 caller가 `workflow.start` 또는 `startChild` 후 start acknowledgement만 기다리는 구현은 허용한다. child 호출에서는 `workflowIdConflictPolicy`를 설정하지 않으며, 두 경우 모두 Workflow 종류를 나누거나 wire payload에 mode를 넣어서는 안 된다.

### Known Traps

- Fedify `Context`, hydrated actor 또는 전체 Profile row를 Workflow wire payload에 넣는 것
- Activity가 다시 public materializer를 호출해 Workflow를 재귀 시작하는 것
- stale 검색에서 refresh callback을 no-op으로 주거나 stale row를 refresh 완료까지 기다리게 하는 것
- fresh row와 `UNRESPONSIVE`/`SUSPENDED` 대상에 불필요한 원격 작업을 시작하는 것
- caller timeout을 Workflow cancellation으로 전파하거나 이미 커밋된 Profile을 rollback하는 것
- child 호출에 `parentClosePolicy`만 설정하고 `cancellationType`을 빠뜨리거나, 반대로 하나만 설정해 parent 종료·취소 전파를 혼동하는 것
- child start acknowledgement 전에 parent를 완료시키거나 async child의 result를 기다려 async 계약을 동기화하는 것
- client caller 전용 `USE_EXISTING`을 `ChildWorkflowOptions`에 억지로 적용하거나 active child conflict를 성공 start로 가장하는 것
- domain rejection을 무조건 재시도하거나 input identity와 origin 선택 identity를 무시한 random 값으로 Workflow ID를 만들어 동시 fetch를 늘리는 것
- inbound Update의 검증된 actor/no-network 경계를 일반 원격 lookup 경로로 바꾸는 것

## Risks / Trade-offs

- [Temporal 시작·Worker 가용성 장애] stale Profile은 기존 row와 검색 결과를 유지하고, 신규 materialization은 기존 예상 실패/empty-result 경계로 매핑한다.
- [Activity retry 중 외부 fetch 재실행] 기존 transaction의 actor URI·handle uniqueness와 `lastFetchedAt` ordering으로 중복 저장과 오래된 projection 덮어쓰기를 막는다.
- [동기 caller timeout 뒤 늦은 완료] caller deadline은 대기만 끝내며 Workflow는 계속 실행한다. 이후 요청은 같은 stable ID 또는 DB fast path로 결과를 관찰한다.
- [alias domain이 같은 canonical actor를 가리킴] 신규 요청과 stale refresh 모두 `actorUri`와 origin 선택 identity 단위로 Workflow ID를 안정화하고, 최종 actor URI uniqueness와 canonical instance 저장 정책은 기존 materializer에 맡긴다.
- [async child lifetime] 실제 Workflow child 호출부가 추가되는 경우에만 child start acknowledgement를 기다리고 async caller가 child result를 기다리지 않는 경계를 검증한다. parent close와 cancellation 이후 child가 유지되는 동작은 Temporal SDK 책임으로 둔다.
- [동일 active child ID의 재시작] ChildWorkflowOptions의 conflict policy 부재를 숨기지 않고 start conflict를 기존 오류 의미로 전달하며, 범용 join wrapper를 추가하지 않는다.

## Migration Plan

이 change는 최신 `main`에서 Worker Workflow·Activity와 caller를 함께 검증하는 선행 1-layer 범위다. Worker가 새 Workflow와 Activity를 등록한 뒤 caller가 같은 Temporal 경로를 사용하도록 전환하고, 이후 migration Stack이 이 layer 위에서 호출부를 재배치한다. DB schema와 migration은 추가하지 않는다. 롤백은 caller와 Worker를 호환되는 이전 버전으로 함께 되돌리는 범위로 한정하며, caller timeout 때문에 진행 중 Workflow를 취소하지 않는다.

## Open Questions

없음.
