## Context

현재 상위 remote actor caller는 검색·발견 경계에서 받은 canonical `actorUri`와 Fedify `Context`를 조합해 직접 원격 조회를 수행한다. 저장된 actor가 stale하면 기본 scheduler가 process-local fire-and-forget callback으로 같은 materializer를 다시 호출하고, `searchProfiles`는 별도 callback seam을 주입해 refresh를 끈다. 반면 Worker는 하나의 Kosmo task queue에서 Workflow가 Activity를 호출하는 구조이며, Core Temporal client에는 Workflow별 input-to-ID 규칙을 적용하는 `runWorkflow` transport 경계가 필요하다.

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
- 각 Workflow는 자기 input에서 Workflow ID를 만드는 규칙을 한 곳에 정의한다. `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>` plain interface는 SDK Workflow 함수 또는 이름과 `workflowIdFromArgs: (...args: Parameters<T>) => string` callback을 한 객체로 묶는다. Workflow caller는 Workflow 종류와 무관한 공용 `runWorkflow(definition, { args, mode, ...native Workflow options })`에 이 객체와 native 정책을 전달한다. `runWorkflow`는 definition의 callback에 native args를 한 번 전달해 ID 문자열을 얻고, KOSMO task queue와 5초 bounded deadline을 적용해 native `start` 또는 `execute`만 호출하며, native result·start 반환값·error와 conflict·reuse policy를 그대로 전달하고 domain 오류 정책은 공통화하지 않는다.
- Activity는 JSON-safe `actorUri`와 선택적인 `profileId`로 필요한 origin을 재구성해야 한다. `profileId`가 없으면 configured Local Instance의 canonical origin을 사용하고, 있으면 DB에서 Profile과 actor metadata를 읽어 Local Instance canonical origin 또는 Remote actor URI origin을 선택한다. 필요한 Remote actor 정보가 없으면 실패한다. `actorUri`는 저장된 actor가 없어도 직접 Fedify lookup target으로 사용할 수 있으며, acct handle lookup을 수행하지 않는다.
- Temporal payload에 Fedify context, actor object, DB row를 넣을 수 없으므로 Activity가 새 federation context를 만들고 실행 시각을 정한다. 결과는 Profile ID만 반환한 뒤 caller가 필요하면 DB에서 다시 읽는다.
- 현재 Activity 기본 재시도 설정은 외부 일시 장애에는 유용하지만, actor 미해결·identity 충돌·suspended/unresponsive 같은 예상 domain 결과를 그대로 재시도하면 불필요한 원격 요청이 반복된다.
- Child Workflow 옵션은 `workflowIdConflictPolicy`를 지원하지 않으므로 client caller의 `USE_EXISTING`을 child 호출에 그대로 적용할 수 없다. parent close와 parent cancellation 전파는 각각 별도 옵션으로 다뤄야 한다. `apps/worker/src/workflows/child.ts`의 generic `runChildWorkflow<T>`는 native child options·error·queue inheritance를 보존하고, `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용하며 `ABANDON`을 자동 적용하지 않는다. Client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline은 child에 복사하지 않는다.

### Recommended Approach

1. 상위 remote actor caller는 검색·발견 경계에서 canonical `actorUri`를 전달받고, 선택적인 `profileId`와 caller mode를 유지한다. stale row를 관찰하면 저장된 actor URI를 `actorUri` input으로 재사용하고, 저장된 row가 없어도 검색·발견 결과의 `actorUri`로 신규 materialization을 요청한다. Caller는 `packages/core/temporal/remote-profile.ts`의 `remoteProfileMaterializationWorkflow` 정의 객체와 `[input]` args를 `runWorkflow`에 전달해 remote Workflow의 기존 input-to-ID 규칙을 적용한다. Workflow input에는 caller mode를 넣지 않고, caller가 동기 요청이면 같은 ID의 실행 결과를 기다리고 비동기 요청이면 같은 ID의 durable start acknowledgement만 기다린다.
2. `remoteProfileMaterializationWorkflow` 정의 객체는 SDK Workflow 이름과 canonical `actorUri`·origin 선택 identity(`profileId` 값 또는 기본 origin marker)를 기존 규칙으로 조합하는 ID callback을 함께 보유한다. 기존 ID 문자열은 `${REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE}:${JSON.stringify([input.actorUri, input.profileId ?? 'configured-local'])}`로 유지한다. `runWorkflow`는 definition과 native args로 이 규칙을 적용하며, Workflow 밖 Temporal Client caller가 같은 actor URI와 origin 선택 identity로 요청하면 기존과 같은 ID를 사용한다. definition에서 native args와 Workflow 결과/handle type이 함께 추론되고, 진행 중 실행의 `USE_EXISTING`과 완료 후 새 실행의 reuse policy는 caller가 native options로 명시한다. 완료 후에는 DB fast path가 새 실행을 막지 않도록 한다.
3. Activity는 `actorUri`와 선택적인 `profileId`를 검증하고 origin에서 새 federation context를 만든다. `actorUri`를 직접 조회하며 acct handle lookup을 수행하지 않는다. 외부 lookup 전에 현재 Profile·actor metadata·Instance 상태와 staleness를 다시 확인하고, 이미 fresh하거나 더 이상 eligible하지 않은 대상은 원격 작업 없이 종료한다. 반환 actor URI가 예상한 `actorUri`와 일치하는지 확인한 뒤 기존 actor 검증·projection, canonical identity 재사용, transaction과 stale ordering을 한 번 호출한다. URI 불일치는 저장 없이 실패한다. Workflow는 이 Activity를 한 번 호출하고 Profile ID를 반환한다.
4. 상위 caller는 저장 row를 먼저 확인한다. fresh row는 Workflow를 시작하지 않고 반환한다. stale active row는 eligibility가 허용되는 경우 row를 즉시 반환하면서 동일한 Workflow를 시작하고, 시작 실패는 row를 무효화하지 않는다. 저장 row가 없으면 동기 caller만 Activity 결과를 기다려 Profile ID를 다시 읽고, 비동기 caller는 durable start acknowledgement 뒤 반환한다.
5. `apps/worker/src/workflows/child.ts`에 Workflow-safe generic `runChildWorkflow<T>(definition, { args, mode: 'start' | 'execute', ...nativeChildOptions })` primitive를 둔다. 기존 `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>`를 `import type`으로 재사용하고, definition의 ID callback에 실제 args를 한 번 전달해 child Workflow ID를 만든다. `mode: 'start'`는 native child handle/start acknowledgement를 반환하고 `mode: 'execute'`는 native child result를 반환한다. Native child options·error·queue inheritance는 그대로 전달하고 client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline은 복사하지 않으며, `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용한다. Helper는 `ABANDON`을 자동으로 적용하지 않는다. 실제 remote async child caller가 추가되는 경우에만 그 caller가 두 옵션을 모두 명시해 parent 종료·실패·취소 이후에도 child를 유지하며, 이 change에는 production child caller를 추가하지 않는다. `ChildWorkflowOptions`에 없는 `workflowIdConflictPolicy`를 설정하거나 동일 active child를 자동 join하는 wrapper를 추가하지 않는다.
6. `searchProfiles`의 명시적 qualified handle은 검색·발견 경계에서 canonical `actorUri`로 해석한 뒤 공용 `runWorkflow`를 통한 actor materialization 경계를 사용한다. partial/local/malformed 검색, `profileByHandle`, profile route는 DB-only로 유지한다. inbound Follow는 기존 request context와 lookup 경계를 유지하고, inbound Update는 검증된 actor를 직접 투영하는 기존 no-network 경계를 유지한다.
7. Activity에서 예상 가능한 영구 domain rejection은 non-retryable 결과로 매핑하고, 일시적인 외부/DB 장애는 기존 Temporal retry 정책을 사용한다. caller는 신규 materialization의 기존 오류·empty-result 매핑과 stale Profile 보존을 구분한다. client deadline은 기다리는 RPC에만 적용하고 이미 시작된 Workflow를 취소하지 않는다.

### Allowed Alternatives

공용 `runWorkflow`가 `WorkflowDefinition<T>`와 `{ args, mode, ...native options }`를 받아 definition의 ID 규칙을 적용하고 caller-only mode 경계를 유지한다면, 내부적으로 native `workflow.execute`/`workflow.start`를 사용하는 구현은 허용한다. `runChildWorkflow<T>`가 같은 `WorkflowDefinition<T>`와 native args로 ID를 만들고 native `startChild`/`executeChild`의 handle·result·options·error·queue inheritance를 보존하는 구현도 허용한다. Child helper에서 parent close/cancellation 옵션을 생략하면 Temporal 기본값을 사용하고 자동 `ABANDON`을 적용하지 않으며, 실제 remote async child caller가 존재할 때만 caller가 두 `ABANDON` 옵션을 명시한다. Client queue/deadline을 child에 복사하거나 child에 `workflowIdConflictPolicy`를 설정하지 않는다. 두 경우 모두 Workflow 종류를 나누거나 wire payload에 mode를 넣어서는 안 된다.

### Known Traps

- Fedify `Context`, hydrated actor 또는 전체 Profile row를 Workflow wire payload에 넣는 것
- Activity가 다시 public materializer를 호출해 Workflow를 재귀 시작하는 것
- stale 검색에서 refresh callback을 no-op으로 주거나 stale row를 refresh 완료까지 기다리게 하는 것
- fresh row와 `UNRESPONSIVE`/`SUSPENDED` 대상에 불필요한 원격 작업을 시작하는 것
- caller timeout을 Workflow cancellation으로 전파하거나 이미 커밋된 Profile을 rollback하는 것
- 실제 remote async child caller에서 `parentClosePolicy`만 설정하고 `cancellationType`을 빠뜨리거나, 반대로 하나만 설정해 parent 종료·취소 전파를 혼동하는 것. Generic helper가 caller 대신 `ABANDON`을 자동 적용해서도 안 된다.
- child start acknowledgement 전에 parent를 완료시키거나 async child의 result를 기다려 async 계약을 동기화하는 것
- client caller 전용 `USE_EXISTING`을 `ChildWorkflowOptions`에 억지로 적용하거나 active child conflict를 성공 start로 가장하는 것
- `runChildWorkflow`에 client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 복사하거나 native queue inheritance를 덮어쓰는 것
- domain rejection을 무조건 재시도하거나 Workflow별 ID 규칙을 무시한 random 값으로 Workflow ID를 만들어 동시 fetch를 늘리는 것
- Workflow name과 해당 Workflow의 ID 규칙을 호출부에서 따로 반복하거나 숨기는 remote 전용 wrapper, Workflow 자동 감지, trampoline, registry, decorator 또는 framework를 추가하는 것. 기존 모듈의 `WorkflowDefinition<T>` plain interface/object로 Workflow와 ID callback을 함께 전달하는 것은 이 명시된 API 경계이며, 실제 child caller 없이 remote `ABANDON` 동작을 추가하는 근거가 아니다.
- inbound Update의 검증된 actor/no-network 경계를 일반 원격 lookup 경로로 바꾸는 것

## Risks / Trade-offs

- [Temporal 시작·Worker 가용성 장애] stale Profile은 기존 row와 검색 결과를 유지하고, 신규 materialization은 기존 예상 실패/empty-result 경계로 매핑한다.
- [Activity retry 중 외부 fetch 재실행] 기존 transaction의 actor URI·handle uniqueness와 `lastFetchedAt` ordering으로 중복 저장과 오래된 projection 덮어쓰기를 막는다.
- [동기 caller timeout 뒤 늦은 완료] 공용 `runWorkflow`의 caller deadline은 대기만 끝내며 Workflow는 계속 실행한다. 이후 요청은 같은 Workflow별 ID 규칙으로 계산된 ID 또는 DB fast path로 결과를 관찰한다.
- [alias domain이 같은 canonical actor를 가리킴] 신규 요청과 stale refresh 모두 remote materialization Workflow의 기존 `actorUri`·origin 선택 ID 규칙을 사용하고, 최종 actor URI uniqueness와 canonical instance 저장 정책은 기존 materializer에 맡긴다.
- [generic child lifecycle] `runChildWorkflow<T>`는 definition ID callback, native start/execute handle·result와 native options·error·queue inheritance를 보존한다. `parentClosePolicy`와 `cancellationType`을 생략한 결과는 Temporal SDK 기본값으로 두고 helper 자체의 동작으로 확장하지 않는다.
- [remote async child lifetime] 실제 Workflow child caller가 추가되는 경우에만 child start acknowledgement를 기다리고 async caller가 child result를 기다리지 않는 경계를 검증하며, 해당 caller가 두 `ABANDON` 옵션을 명시한다. parent close와 cancellation 이후 child가 유지되는 동작은 Temporal SDK 책임으로 둔다.
- [client child options] client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 child helper에 복사하지 않고, child의 native queue inheritance와 호출부가 준 options를 유지한다.
- [동일 active child ID의 재시작] ChildWorkflowOptions의 conflict policy 부재를 숨기지 않고 start conflict를 기존 오류 의미로 전달하며, 범용 join wrapper를 추가하지 않는다.

## Migration Plan

이 change는 최신 `main`에서 Worker Workflow·Activity와 caller를 함께 검증하는 선행 1-layer 범위다. Worker가 새 Workflow와 Activity를 등록하고 `runChildWorkflow<T>` generic primitive를 제공한 뒤 caller가 공유 `remoteProfileMaterializationWorkflow` 정의 객체를 공용 `runWorkflow`에 전달해 같은 Temporal 경로를 사용하도록 전환한다. Child helper는 실제 child caller가 사용할 때 native child lifecycle과 queue/options inheritance를 제공하며, 이 change에는 production remote child caller를 추가하지 않는다. Remote async caller가 이후 추가되는 경우에만 caller가 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시한다. 이 change에서는 remote materialization Workflow만 기존 Workflow별 ID 규칙을 공용 wrapper에 적용한다. 다른 domain의 canonical Workflow ID와 UWS는 일괄 마이그레이션하지 않으며, 새 registry/runtime factory/fake Workflow function/new contracts file도 추가하지 않는다. 이후 migration Stack이 이 layer 위에서 호출부를 재배치한다. DB schema와 migration은 추가하지 않는다. 롤백은 caller와 Worker를 호환되는 이전 버전으로 함께 되돌리는 범위로 한정하며, caller timeout 때문에 진행 중 Workflow를 취소하지 않는다.

## Open Questions

없음.
