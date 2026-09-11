## Context

초기 remote actor 경계는 검색·발견 caller의 직접 조회와 process-local callback으로 나뉘어 있었다. 이전 전환에서
public Workflow와 materialization Activity의 durable path를 마련하고 callback을 제거했지만, caller가 여전히 저장
row·actor metadata·TTL을 미리 읽어 상태를 판단하고 cached return과 refresh lifetime을 소유하는 문제가 남아 있다.
이 상태에서는 public Workflow가 URI lookup 이후 materialize Activity 결과와 refresh child 생명주기를 내구성 있게 소유하지 못한다.

새 경계에서는 caller가 하나의 public `remoteProfileLookupWorkflow`를 dispatch하고, Workflow가 URI lookup Activity 뒤
`materializeRemoteProfileActorActivity`를 호출한다. Materialize Activity가 stored/missing 판정과 현재 state·TTL을 소유하고
`{ profileId, needsRefresh }`를 반환하며, `needsRefresh: true`일 때만 Workflow가 refresh child를 시작한다. Temporal
Workflow에는 Fedify `Context`, hydrated actor 또는 DB row를 전달할 수 없으므로 JSON-safe DTO와 URI lookup·materialize·refresh
Activity를 사용한다. stale refresh child가
실행될 때 parent close와 cancellation 전파는 child caller가 별도 옵션으로 제어한다. inbound Follow의 요청
context와 기존 lookup, inbound Update의 검증된 actor/no-network projection은 이 전환의 호출 경계 밖에 남는다.

## Goals / Non-Goals

**Goals:**

- 신규 materialization과 stale refresh가 하나의 public lookup Workflow dispatch와 durable coordinator 경로를 사용한다.
- URI lookup Activity 뒤 materialize Activity가 최소 JSON-safe DTO를 반환하고, `needsRefresh: false`인 fresh 또는
  `UNRESPONSIVE` 상태는 cached Profile ID를 즉시 반환하며, missing은 Activity가 refresh Activity의 fetch·persist 결과를
  반영한 target ID를 반환하도록 한다.
- stale는 별도 refresh child를 start acknowledgement까지 시작한 뒤 cached Profile ID를 반환하게 하고, child가
  `refreshRemoteProfileActorActivity`를 실제 fetch·projection·transaction 경로로 재사용하도록 한다.
- `mode: 'execute'` caller는 public Workflow 결과를 기다리고 `mode: 'start'` caller는 모든 분기에서 public Workflow의
  native start acknowledgement만 받도록 하며, caller mode를 Workflow input이나 branch에 넣지 않는다.
- caller가 materialization을 위해 DB row·actor metadata·TTL을 직접 pre-read하거나 public lookup Workflow start failure 뒤
  DB fallback을 만들지 않도록 한다. qualified-handle parsing과 materialization 이후 visibility 조회는 기존 검색 경계에
  유지하고 URI discovery는 lookup Activity가 담당한다.
- 기존 actor projection, transaction, identity/state/ordering, 오류 관측과 검색 fallback을 재사용한다.

**Non-Goals:**

- DB schema/migration, target eligibility 정책, Profile Migration 동작
- inbound Update 또는 inbound Follow context의 동작 변경
- 새 HTTP client, parser, projection, status API, 주기 scanner, 장수명 Profile Workflow 또는 범용 Workflow framework
- Temporal Workflow wire payload에 actor object·DB row·caller mode를 추가하는 것
- production rollout, merge/queue와 migration Stack의 branch/base 재배치

## Implementation Guidance

### Current Constraints

- 검색·발견 caller는 `RemoteProfileLookupInput { domain, handle, profileId? }`로 public
  `remoteProfileLookupWorkflow`를 dispatch한다. Workflow ID는 기존 handle identity 규칙과 domain, acting `profileId`로
  계산한다. Workflow의 URI lookup은 저장된 canonical
  `actorUri`를 재사용하거나 없을 때만 WebFinger의 ActivityPub self link에서 canonical URI를 확인하고, WebFinger 응답만으로
  Instance를 추출하지 않는다. Caller의 bounded 5초 대기 deadline에는 discovery가 포함되며 이미 시작된 Workflow는 계속
  실행한다. Materialization 성공 뒤 connection·staged visibility 조회는 기존 검색 경계가 수행한다.
- `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>` plain interface는 SDK Workflow 함수 또는 이름과
  `workflowIdFromArgs: (...args: Parameters<T>) => string` callback을 한 객체로 묶는다. Workflow caller는 Workflow
  종류와 무관한 공용 `runWorkflow(definition, { args, mode, ...native Workflow options })`에 이 객체와 native 정책을
  전달한다. `runWorkflow`는 definition의 callback에 native args를 한 번 전달해 기존 ID 문자열을 계산하고 KOSMO
  task queue와 5초 bounded deadline으로 native `start` 또는 `execute`만 호출하며, native result·start 반환값·error와
  conflict·reuse policy를 그대로 전달한다.
- Activity 모듈의 private stored-state query가 missing을 `null`로 표현하고, `materializeRemoteProfileActorActivity`는 stored/missing
  판정과 현재 Profile/Instance 상태·actor TTL 확인을 소유해 `{ profileId, needsRefresh }` non-null 최소 JSON-safe DTO를 반환한다.
  `needsRefresh: false`는 갱신이 불필요하거나 허용되지 않는 상태(fresh 또는 `UNRESPONSIVE`), `needsRefresh: true`는
  갱신 가능한 stale을 나타낸다. DTO의 `profileId`는 cached 또는 missing fetch 뒤 새로 생성된 target Profile ID이고,
  Workflow input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다. Refresh child에는 URI lookup Activity에서 받은
  `actorUri`와 Workflow input의 선택적인 `profileId`를 그대로 전달하며 state `profileId`로 대체하지 않는다. DTO에는 Fedify
  context, actor object와 full DB row를 포함하지 않는다.
- `refreshRemoteProfileActorActivity`는 `actorUri`와 선택적인 `profileId`로 origin을 재구성하고 actor URI를 직접 Fedify
  lookup target으로 사용한다. Activity는 외부 lookup 직전에 현재 Profile·actor metadata·TTL·Instance 상태를 다시
  확인해 갱신이 불필요하거나 더 이상 eligible하지 않은 대상은 fetch하지 않는다.
- stale Workflow가 시작하는 refresh child는 별도 refresh ID prefix를 사용하고 `refreshRemoteProfileActorActivity`를
  호출한다. child start에는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시하고, child start
  acknowledgement 뒤 Coordinator가 cached Profile ID를 반환한다. 이미 실행 중인 동일 child는 정상 coalescing으로
  처리하며, 그 밖의 start·execution failure는 관측 경계에 기록하고 cached identity를 유지한다.
- `apps/worker/src/workflows/child.ts`의 generic `runChildWorkflow<T>`는 native child options·error·queue inheritance를
  보존하고, `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용한다. helper는 `ABANDON`을
  자동 적용하지 않으며 Client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 child에 복사하지 않는다.
- actor 미해결·identity 충돌·suspended/unresponsive 같은 예상 domain 결과는 non-retryable로 분류하고 일시적 외부·DB
  장애는 기존 Activity retry 정책을 사용한다.

### Recommended Approach

1. 검색·발견 caller가 handle과 domain, 선택적인 acting `profileId`로 `remoteProfileLookupWorkflow` 정의 객체와 input을
   공용 `runWorkflow`에 직접 전달한다. Workflow가 저장된 canonical `actorUri`를 재사용하거나 WebFinger self link에서 URI를
   확인하므로 caller는 Profile row를 다시 읽지 않는다. WebFinger 응답만으로 Instance를 추출하지 않으며, `mode: 'execute'`는
   native Workflow 결과(Profile ID)를 사용하고 `mode: 'start'`는 native start acknowledgement만 사용한다.
2. `remoteProfileLookupWorkflow`는 기존 handle identity 규칙으로 stable ID를 계산하고, Workflow input에는 caller mode나
   별도 derived identity field를 넣지 않는다. public lookup Workflow의 native conflict/reuse/error 의미를 보존한다.
3. Workflow가 URI lookup 뒤 `materializeRemoteProfileActorActivity`를 호출한다. Materialize Activity가 stored/missing 상태와
   state·TTL을 확인하고, missing이면 `refreshRemoteProfileActorActivity`의 fetch·persist를 ordinary call로 수행해 새 target
   ID와 `needsRefresh: false`를 반환한다. 갱신 불필요 상태이면 cached ID와 `needsRefresh: false`를 반환한다.
4. Materialize Activity가 `needsRefresh: true`를 반환하면 DTO의 `profileId`를 cached target identity로 반환하는 데만 사용하고,
   URI lookup Activity에서 받은 `actorUri`와 Workflow input의 선택적인 `profileId`를 refresh input으로 그대로 전달한다. Workflow는
   별도 refresh child를
   `runChildWorkflow`로 시작하고 두 `ABANDON` 옵션을 전달한 뒤 start acknowledgement를 기다린다. child 결과를
   기다리지 않고 cached Profile ID를 반환하며, 이미 실행 중인 동일 child는 정상 coalescing으로 처리한다. child start 또는
   이후 execution failure는 관측하고 cached identity를 무효화하지 않는다.
5. refresh child가 호출한 `refreshRemoteProfileActorActivity`는 fetch 직전에 최신 Profile·actor metadata·TTL·Instance 상태를
   재확인하고, stale 조건이 사라졌거나 대상이 비활성·unavailable이면 원격 fetch 없이 종료한다. actor URI mismatch는
   저장 없이 실패하고, 일치하는 canonical URI의 preferredUsername 변경은 같은 Profile identity를 갱신한다.
6. 동기 caller가 Profile identity를 받으면 기존 검색 경계가 필요한 connection과 staged visibility를 다시 조회한다.
   public Workflow start/execute 자체가 실패하면 caller는 DB fallback을 만들지 않고 기존 materialization 또는 explicit
   search 오류 경계로 전달한다. 명시적 search의 예상 lookup/domain 실패는 기존 빈 connection mapping과 관측 정책을
   유지한다.
7. partial/local/malformed search, `profileByHandle`, profile route는 DB-only로 남긴다. inbound Follow는 기존 request
   context와 lookup을, inbound Update는 검증된 actor/no-network projection을 사용한다.

### Allowed Alternatives

공용 `runWorkflow`가 `WorkflowDefinition<T>`와 `{ args, mode, ...native options }`를 받아 definition의 ID 규칙을
적용하고 caller-only mode 경계를 유지한다면, 내부적으로 native `workflow.execute`/`workflow.start`를 사용하는
구현은 허용한다. Workflow가 URI lookup Activity 뒤 materialize Activity를 호출하고, 반환된 `needsRefresh`에 따라 refresh child를
시작하는 구현도 허용한다. stale child는 별도 ID prefix와 명시적인 `parentClosePolicy: ABANDON`,
`cancellationType: ABANDON`을 사용해 start acknowledgement 뒤 cached identity를 반환해야 하며, child 실행 완료를
기다리거나 실패를 cached Profile 무효화로 바꾸어서는 안 된다. `runChildWorkflow<T>`가 같은 `WorkflowDefinition<T>`와
native args로 ID를 만들고 native `startChild`/`executeChild`의 handle·result·options·error·queue inheritance를
보존하는 구현도 허용한다. helper에서 `ABANDON`과 client queue/deadline을 자동 적용하거나 child에
`workflowIdConflictPolicy`를 설정하지 않는다.

### Known Traps

- Fedify `Context`, hydrated actor 또는 전체 Profile row를 Workflow wire payload에 넣는 것
- caller가 stored Profile·actor metadata·TTL을 pre-read해 missing·갱신 불필요·stale를 분기하거나, public Workflow start
  failure 뒤 DB fallback을 합성하는 것
- materialize Activity 밖에서 state 판단을 복제하거나, Workflow가 refresh child 완료를 기다리는 것
- stale 검색에서 refresh callback을 no-op으로 주거나 stale row를 refresh 완료까지 기다리게 하는 것
- fresh row와 `UNRESPONSIVE`/`SUSPENDED` 대상에 불필요한 원격 작업을 시작하는 것
- actual refresh Activity가 실행 직전 TTL·Profile·actor·Instance 상태를 재확인하지 않는 것
- refresh child에서 `parentClosePolicy`만 설정하고 `cancellationType`을 빠뜨리거나 둘 중 하나만 설정하는 것
- child start acknowledgement 전에 Coordinator를 완료시키거나 async caller가 child result를 기다려 계약을 동기화하는 것
- client caller 전용 `USE_EXISTING`을 ChildWorkflowOptions에 억지로 적용하거나 active child coalescing을 start success로
  가장하는 것
- `runChildWorkflow`에 client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 복사하거나 native queue
  inheritance를 덮어쓰는 것
- Workflow별 ID 규칙을 무시한 random ID, URI materialization용 별도 public Workflow, refresh child 이름을 계약 없이 발명하는 것
- inbound Update의 검증된 actor/no-network 경계를 일반 원격 lookup 경로로 바꾸는 것

## Risks / Trade-offs

- [Temporal 시작·Worker 가용성 장애] public Workflow start failure와 신규 materialization 실패는 기존
  materialization 또는 explicit-search 오류 경계로 매핑한다. explicit search는 기존 빈 connection으로 처리하며,
  caller는 DB fallback을 만들지 않는다.
- [stale child start 또는 execution failure] Coordinator는 child start acknowledgement 뒤 cached identity를
  반환하며 실패를 관측한다. child failure가 cached Profile을 삭제·실패 처리로 바꾸지 않는다.
- [Activity retry 중 외부 fetch 재실행] 기존 transaction의 actor URI·handle uniqueness와 `lastFetchedAt` ordering으로
  중복 저장과 오래된 projection 덮어쓰기를 막는다.
- [동기 caller timeout 뒤 늦은 완료] 공용 `runWorkflow`의 caller deadline은 대기만 끝내며 이미 시작된 Workflow는
  계속 실행한다. 이후 요청은 기존 Workflow ID 또는 DB visibility 조회로 결과를 관찰한다.
- [alias domain이 같은 canonical actor를 가리킴] discovery가 전달한 actor URI와 기존 origin 선택 identity를
  public Workflow ID에 사용하고, 최종 actor URI uniqueness와 canonical instance 저장 정책은 materializer에 맡긴다.
- [remote refresh child lifetime] child caller가 두 `ABANDON` 옵션을 명시해 Coordinator 종료·취소 이후 child를
  유지한다. generic helper는 lifetime 정책을 자동 적용하지 않으며 parent lifecycle 이후 child 생존은 Temporal SDK
  책임으로 둔다.
- [동일 active child ID] 이미 실행 중인 동일 child는 정상 coalescing으로 처리한다. 그 밖의 start conflict/error는
  cached identity를 유지하면서 관측하며, 범용 join wrapper로 오류를 감추지 않는다.

## Migration Plan

이 change는 `main → PROD-808-temporal-runtime (공용 definition/client/child와 공용 테스트) → PR #829 (원격 전용 통합과 전체 change 검증/archive)`의 2-layer 범위다. 공용 layer는 `WorkflowDefinition`·client/child 실행 경계와 공용 테스트를 담당하고, PR #829는 public `remoteProfileLookupWorkflow`와 그 handle/domain/profileId ID 규칙을 사용해 원격 caller와 Worker를 Coordinator 구조로 전환한다. Worker에 URI lookup·materialize·refresh Activity를 연결하고
`materializeRemoteProfileActorActivity`가 missing에서, Workflow의 refresh child가 stale에서 `refreshRemoteProfileActorActivity`를
재사용한 뒤, caller가 공용 `runWorkflow`로 하나의
public lookup Workflow를 dispatch하도록 전환한다. stale child는 별도 refresh ID prefix와 명시적인 두 `ABANDON` 옵션을 사용한다. 이 change는
새 DB schema/migration, public status API, 주기 scanner, 장수명 Workflow 또는 다른 domain Workflow ID/UWS의 일괄
마이그레이션을 추가하지 않는다. qualified-handle parsing과 materialization 이후 connection·visibility DB 조회는 기존
검색 경계에 남기고, URI discovery는 lookup Activity가 담당한다. inbound Update/Follow 경계도 기존 위치에 남긴다. 롤백은
caller와 Worker를 호환되는 이전 버전으로 함께 되돌리는
범위로 한정하며, caller timeout 때문에 진행 중 Workflow를 취소하지 않는다.

## Open Questions

없음.
