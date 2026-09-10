## Context

초기 remote actor 경계는 검색·발견 caller의 직접 조회와 process-local callback으로 나뉘어 있었다. 이전 전환에서
public Workflow와 materialization Activity의 durable path를 마련하고 callback을 제거했지만, caller가 여전히 저장
row·actor metadata·TTL을 미리 읽어 상태를 판단하고 cached return과 refresh lifetime을 소유하는 문제가 남아 있다.
이 상태에서는 public Workflow가 missing·갱신 불필요·stale routing을 내구성 있게 소유하지 못한다.

새 경계에서는 caller가 하나의 public `remoteProfileMaterializationWorkflow`를 dispatch하고, Coordinator Workflow가
stored-state Activity 결과로 missing·갱신 불필요·stale를 분기한다. Temporal Workflow에는 Fedify `Context`, hydrated actor
또는 DB row를 전달할 수 없으므로 JSON-safe DTO와 기존 materialization Activity를 사용한다. stale refresh child가
실행될 때 parent close와 cancellation 전파는 child caller가 별도 옵션으로 제어한다. inbound Follow의 요청
context와 기존 lookup, inbound Update의 검증된 actor/no-network projection은 이 전환의 호출 경계 밖에 남는다.

## Goals / Non-Goals

**Goals:**

- 신규 materialization과 stale refresh가 하나의 public Workflow dispatch와 durable coordinator 경로를 사용한다.
- Workflow가 최소 JSON-safe stored-state DTO로 missing·갱신 불필요·stale를 분기하고, 갱신 불필요 상태(fresh 또는
  `UNRESPONSIVE`)는 cached Profile ID를 즉시 반환하며 missing은 기존 materialization Activity 결과를 기다리도록 한다.
- stale는 별도 refresh child를 start acknowledgement까지 시작한 뒤 cached Profile ID를 반환하게 하고, child가
  기존 materialization Activity를 실제 fetch·projection·transaction 경로로 재사용하도록 한다.
- 동기 caller는 public Workflow 결과를 기다리고 비동기 caller는 모든 분기에서 public Workflow start acknowledgement만
  받도록 하며, caller mode를 Workflow input이나 branch에 넣지 않는다.
- caller가 materialization을 위해 DB row·actor metadata·TTL을 직접 pre-read하거나 public Workflow start failure 뒤
  DB fallback을 만들지 않도록 한다. qualified-handle discovery와 materialization 이후 visibility 조회는 기존 검색
  경계를 유지한다.
- 기존 actor projection, transaction, identity/state/ordering, 오류 관측과 검색 fallback을 재사용한다.

**Non-Goals:**

- DB schema/migration, target eligibility 정책, Profile Migration 동작
- inbound Update 또는 inbound Follow context의 동작 변경
- 새 HTTP client, parser, projection, status API, 주기 scanner, 장수명 Profile Workflow 또는 범용 Workflow framework
- Temporal Workflow wire payload에 actor object·DB row·caller mode를 추가하는 것
- production rollout, merge/queue와 migration Stack의 branch/base 재배치

## Implementation Guidance

### Current Constraints

- 검색·발견 경계는 qualified handle을 canonical `actorUri`로 해석한다. materialization caller는 canonical
  `actorUri`와 선택적인 `profileId`를 public Workflow에 전달하고, materialization을 결정하기 위한 stored state와
  TTL은 caller에서 직접 판단하지 않는다. materialization 성공 뒤 connection·staged visibility 조회는 기존 검색
  경계가 수행한다.
- `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>` plain interface는 SDK Workflow 함수 또는 이름과
  `workflowIdFromArgs: (...args: Parameters<T>) => string` callback을 한 객체로 묶는다. Workflow caller는 Workflow
  종류와 무관한 공용 `runWorkflow(definition, { args, mode, ...native Workflow options })`에 이 객체와 native 정책을
  전달한다. `runWorkflow`는 definition의 callback에 native args를 한 번 전달해 기존 ID 문자열을 계산하고 KOSMO
  task queue와 5초 bounded deadline으로 native `start` 또는 `execute`만 호출하며, native result·start 반환값·error와
  conflict·reuse policy를 그대로 전달한다.
- Coordinator Workflow는 state Activity가 반환한 `{ profileId, needsRefresh } | null` 최소 JSON-safe DTO만 사용한다.
  `null`은 missing, `needsRefresh: false`는 갱신이 불필요하거나 허용되지 않는 상태(fresh 또는 `UNRESPONSIVE`),
  `needsRefresh: true`는 갱신 가능한 stale을 나타낸다. DTO의 `profileId`는 조회 대상인 cached Remote Profile ID이고,
  Workflow input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다. Refresh child에는 Workflow가 원래 받은
  input(`actorUri`와 선택적인 `profileId`)을 그대로 전달하며 state `profileId`로 대체하지 않는다. DTO에는 Fedify
  context, actor object와 full DB row를 포함하지 않는다.
- 기존 materialization Activity는 `actorUri`와 선택적인 `profileId`로 origin을 재구성하고 actor URI를 직접 Fedify
  lookup target으로 사용한다. Activity는 외부 lookup 직전에 현재 Profile·actor metadata·TTL·Instance 상태를 다시
  확인해 갱신이 불필요하거나 더 이상 eligible하지 않은 대상은 fetch하지 않는다.
- stale Workflow가 시작하는 refresh child는 별도 refresh ID prefix를 사용하고 기존 materialization Activity를
  호출한다. child start에는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시하고, child start
  acknowledgement 뒤 Coordinator가 cached Profile ID를 반환한다. 이미 실행 중인 동일 child는 정상 coalescing으로
  처리하며, 그 밖의 start·execution failure는 관측 경계에 기록하고 cached identity를 유지한다.
- `apps/worker/src/workflows/child.ts`의 generic `runChildWorkflow<T>`는 native child options·error·queue inheritance를
  보존하고, `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용한다. helper는 `ABANDON`을
  자동 적용하지 않으며 Client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 child에 복사하지 않는다.
- actor 미해결·identity 충돌·suspended/unresponsive 같은 예상 domain 결과는 non-retryable로 분류하고 일시적 외부·DB
  장애는 기존 Activity retry 정책을 사용한다.

### Recommended Approach

1. 검색·발견 caller가 qualified handle을 canonical `actorUri`로 해석한 뒤 `remoteProfileMaterializationWorkflow`
   정의 객체와 `[input]` args를 공용 `runWorkflow`에 전달한다. caller는 stored state나 TTL을 pre-read해 Workflow
   분기를 결정하지 않는다. `mode: 'execute'`는 Coordinator 결과를 기다리고 `mode: 'start'`는 모든 분기에서 public
   Workflow start acknowledgement 뒤 반환한다.
2. `remoteProfileMaterializationWorkflow`는 기존 `actorUri`·`profileId` input-to-ID 규칙을 유지한다. Workflow
   input에는 caller mode를 넣지 않으며, public Workflow의 existing ID와 native conflict/reuse/error 의미를 보존한다.
3. Coordinator가 state Activity를 한 번 호출해 missing·갱신 불필요·stale DTO를 받는다. 갱신 불필요 상태이면 외부
   lookup과 refresh child 없이 cached Profile ID를 반환한다. missing이면 기존 materialization Activity를 직접 호출하고
   Profile ID 결과를 반환한다.
4. stale이면 DTO의 `profileId`를 cached target identity로 반환하는 데만 사용하고, Workflow가 원래 받은 `actorUri`와
   선택적인 input `profileId`를 refresh input으로 그대로 전달한다. Coordinator는 별도 refresh child를
   `runChildWorkflow`로 시작하고 두 `ABANDON` 옵션을 전달한 뒤 start acknowledgement를 기다린다. child 결과를
   기다리지 않고 cached Profile ID를 반환하며, 이미 실행 중인 동일 child는 정상 coalescing으로 처리한다. child start 또는
   이후 execution failure는 관측하고 cached identity를 무효화하지 않는다.
5. refresh child가 호출한 materialization Activity는 fetch 직전에 최신 Profile·actor metadata·TTL·Instance 상태를
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
구현은 허용한다. Coordinator가 state Activity 결과를 받아 branch를 선택하고 기존 materialization Activity를
재사용하는 구현도 허용한다. stale child는 별도 ID prefix와 명시적인 `parentClosePolicy: ABANDON`,
`cancellationType: ABANDON`을 사용해 start acknowledgement 뒤 cached identity를 반환해야 하며, child 실행 완료를
기다리거나 실패를 cached Profile 무효화로 바꾸어서는 안 된다. `runChildWorkflow<T>`가 같은 `WorkflowDefinition<T>`와
native args로 ID를 만들고 native `startChild`/`executeChild`의 handle·result·options·error·queue inheritance를
보존하는 구현도 허용한다. helper에서 `ABANDON`과 client queue/deadline을 자동 적용하거나 child에
`workflowIdConflictPolicy`를 설정하지 않는다.

### Known Traps

- Fedify `Context`, hydrated actor 또는 전체 Profile row를 Workflow wire payload에 넣는 것
- caller가 stored Profile·actor metadata·TTL을 pre-read해 missing·갱신 불필요·stale를 분기하거나, public Workflow start
  failure 뒤 DB fallback을 합성하는 것
- state Activity가 public Workflow 밖에서 child를 시작하거나, Coordinator가 stale child 완료를 기다리는 것
- stale 검색에서 refresh callback을 no-op으로 주거나 stale row를 refresh 완료까지 기다리게 하는 것
- fresh row와 `UNRESPONSIVE`/`SUSPENDED` 대상에 불필요한 원격 작업을 시작하는 것
- actual materialization Activity가 refresh 실행 직전 TTL·Profile·actor·Instance 상태를 재확인하지 않는 것
- refresh child에서 `parentClosePolicy`만 설정하고 `cancellationType`을 빠뜨리거나 둘 중 하나만 설정하는 것
- child start acknowledgement 전에 Coordinator를 완료시키거나 async caller가 child result를 기다려 계약을 동기화하는 것
- client caller 전용 `USE_EXISTING`을 ChildWorkflowOptions에 억지로 적용하거나 active child coalescing을 start success로
  가장하는 것
- `runChildWorkflow`에 client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 복사하거나 native queue
  inheritance를 덮어쓰는 것
- Workflow별 ID 규칙을 무시한 random ID, 새 public Workflow 종류, refresh child 이름을 계약 없이 발명하는 것
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

이 change는 기존 public `remoteProfileMaterializationWorkflow`와 Workflow ID를 유지하면서 caller와 Worker를
Coordinator 구조로 전환하는 1-layer 범위다. Worker에 state Activity를 연결하고 Coordinator가 기존 materialization
Activity를 missing과 refresh child 양쪽에서 재사용한 뒤, caller가 공용 `runWorkflow`로 하나의 public Workflow를
dispatch하도록 전환한다. stale child는 별도 refresh ID prefix와 명시적인 두 `ABANDON` 옵션을 사용한다. 이 change는
새 DB schema/migration, public status API, 주기 scanner, 장수명 Workflow 또는 다른 domain Workflow ID/UWS의 일괄
마이그레이션을 추가하지 않는다. qualified-handle discovery와 materialization 이후 connection·visibility DB 조회,
inbound Update/Follow 경계는 기존 위치에 남긴다. 롤백은 caller와 Worker를 호환되는 이전 버전으로 함께 되돌리는
범위로 한정하며, caller timeout 때문에 진행 중 Workflow를 취소하지 않는다.

## Open Questions

없음.
