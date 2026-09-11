# Temporal Workflow Memory: Orchestration

## Purpose

- Kosmo의 Temporal Workflow, Activity 등록과 domain transaction 이후 Workflow start 코드를 작성하거나 리뷰할 때 이 문서를 따른다.
- 이 문서는 코드 구조와 실행 경계에 관한 개발 규칙이다. 각 domain의 실제 transition, retry 허용 범위와 delivery 성공 의미는 canonical domain 문서와 해당 capability가 소유한다.

## Ownership And Flow

- domain state transition, 권한, transaction과 멱등성 판정은 `packages/core/services`의 transport-neutral policy가
  소유한다. capability 계약에 따라 caller가 직접 호출하거나 Temporal transaction Activity가 호출할 수 있다.
- 기본 effects-only capability는 실제 transition commit 뒤 core service가 Workflow를 시작한다. Follow처럼
  durable admission부터 transaction을 연결해야 하는 capability는 caller 검증 뒤 directed Profile pair Workflow를
  Update-with-Start하고 transaction Activity가 core policy를 실행한다.
- Workflow는 결정론적 orchestration만 수행한다. DB domain transition은 Activity에서 실행하고, pair Workflow의
  source identity와 effect queue는 JSON-serializable한 Workflow state로 보존한다.
- Activity는 Notification projection이나 Fedify queue handoff처럼 retry 가능한 하나의 외부 효과 경계를 소유한다.
- transition eligibility와 effect execution을 분리한다. transaction Activity는 각 시도에서 현재 Profile/Instance
  상태를 평가해 effect plan을 반환한다. commit 전에 실패한 시도의 retry가 다른 상태를 관찰하면 delivery를
  포함하거나 생략할 수 있다. commit 뒤 completion 응답이 유실되어 retry가 기존 create row를 관찰하면 이번
  transition의 commit이라고 추론해 create effect를 재구성하지 않는다. Workflow는 반환된 plan을 그대로 실행하고
  effect Activity는 이후 mutable 상태를 다시 조회해 delivery를 추가하거나 취소하지 않는다.
- Workflow start 실패가 이미 commit된 domain 결과를 바꾸지 않는 capability에서는 start 호출부가 deadline과 오류 격리를 명시한다.

## Workflow Source Structure

- `apps/worker/src/workflows`에서는 exported Workflow 하나를 파일 하나가 소유한다. create/delete처럼 lifecycle이 다르면 파일도 나눈다.
- `workflows/index.ts`는 Worker bundle에 포함할 Workflow를 re-export하기만 한다. 실행 로직이나 adapter를 두지 않는다.
- 한 Workflow에서 서로 독립적인 sibling Activity를 모두 시도해야 하면 공용 `settleEffects`를 사용한다. 이 helper는 모든 Promise가 settle될 때까지 기다린 뒤 실패가 있으면 하나를 다시 throw한다. Follow pair Workflow의
  transition effects는 domain contract가 정한 FIFO queue에 넣고, queue 순서를 보존해 drain한다.
- `settleEffects` 같은 deterministic Workflow 전용 공통 로직은 `workflows` 아래 공용 모듈 한 곳에 둔다. 특정 domain Workflow 파일에 복사하거나 그 파일의 private helper로 두지 않는다.
- Workflow effect는 개수와 관계없이 `settleEffects`로 정산해 종료와 실패 보고 경계를 일관되게 유지한다.
- origin이나 transition variant와 무관하게 실행하는 Activity는 match 바깥에서 선언한다. `ts-pattern`의 exhaustive match는 variant별 추가 Activity만 선택하고, 공통 Activity를 각 branch에 반복해서 나열하지 않는다.
- notification과 effect 목록처럼 한 번만 소비하는 중간 변수는 만들지 않는다. 공통 Activity와 variant별 추가 Activity를 `settleEffects([...])` 호출에 함께 인라인해 실제 실행 조합을 한 위치에서 읽을 수 있게 한다.
- Workflow code에서는 wall clock, network, database와 process-local state에 직접 접근하지 않고 Temporal이 허용하는 deterministic API와 proxied Activity만 사용한다.

## Starting A Workflow

- 각 Workflow는 자기 input과 그 input에서 stable Workflow ID를 만드는 규칙을 한 곳에 정의한다. commit 결과와 transition을 소유한 service는 Workflow 정의와 input을 호출 위치에서 읽을 수 있게 명시한다.
- Workflow caller는 Workflow 종류와 무관한 공용 `runWorkflow`에 `WorkflowDefinition<T>`와 `{ args, mode, ...native Workflow options }`를 전달한다. `WorkflowDefinition<T>`는 SDK Workflow 함수 또는 이름과 `workflowIdFromArgs: (...args: Parameters<T>) => string` callback을 한 plain object로 묶고, 해당 Workflow가 정의한 input-to-ID 규칙을 함께 참조하게 한다. 이 interface는 기존 `packages/core/temporal/client.ts`에 둔다.
- `runWorkflow`는 definition의 callback에 native args를 한 번 전달해 ID 문자열을 얻고, 그 ID와 공통 task queue·bounded deadline으로 native `start` 또는 `execute`를 호출한다. Callback 오류는 native 호출 전에 원본 그대로 전파한다. Native rejection은 `Error.cause` chain에서 첫 `ApplicationFailure`를 동일 객체로 전파하고, 없으면 최초 rejection 객체를 그대로 전파한다. Caller는 전달받은 `ApplicationFailure.type`을 분류하며 expected type, fallback과 reporting을 포함한 domain 오류 정책을 소유한다. Unknown `ApplicationFailure` 관측 tradeoff는 PROD-808 archived decision에 기록한다. Remote profile lookup caller는 `packages/core/temporal/remote-profile.ts`의 `remoteProfileLookupWorkflow` 정의 객체를 공유한다. 공통 ID format·name prefix·JSON 조합, Workflow 자동 감지, trampoline, registry/decorator/framework, domain별 pass-through wrapper를 추가하지 않으며, 실제 child caller가 없는 domain에 child helper 호출이나 `ABANDON` 정책을 추가하지 않는다. 기존 domain의 ID와 UWS를 자동으로 마이그레이션하지 않는다.
- Workflow 안에서 다른 Workflow를 native child로 실행해야 하는 경우에는 `apps/worker/src/workflows/child.ts`의 `runChildWorkflow<T>`를 사용한다. 이 helper는 기존 `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>`를 `import type`으로 재사용하고, definition의 ID callback에 실제 args를 한 번 전달해 ID를 만든다. `mode: 'start'`는 native child start handle/acknowledgement를 반환하고 `mode: 'execute'`는 native child result를 반환한다. Native child options·error·queue inheritance를 그대로 보존하며 client `runWorkflow`의 KOSMO task queue와 bounded deadline을 복사하지 않는다. `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용하고, helper가 `ABANDON`을 자동으로 정하지 않는다. 실제 remote async child caller가 있는 경우에만 caller가 두 옵션을 명시한다.
- 명시적 qualified handle 검색은 `RemoteProfileLookupInput { domain, handle, profileId? }`로 `remoteProfileLookupWorkflow`를 dispatch한다. Workflow ID는 기존 pure handle normalization으로 계산한 `normalizedHandle`, domain과 acting `profileId`에서 만들며 `normalizedHandle`을 wire input에 중복해 넣지 않는다. Workflow는 state-independent `lookupRemoteActorUriActivity`로 저장된 canonical actor URI를 먼저 재사용하고, 없을 때만 WebFinger의 ActivityPub self link에서 URI를 확인한 뒤 `materializeRemoteProfileActorActivity`에 canonical `actorUri`와 optional `profileId`를 전달한다. WebFinger 응답만으로 Instance를 추출하거나 상태를 판정하지 않는다. Caller의 bounded 5초 대기 deadline에는 URI discovery가 포함되며 이미 시작된 Workflow는 caller가 더 기다리지 않아도 계속 실행할 수 있다. Materialization 이후 connection·visibility DB 조회는 기존 검색 경계가 유지한다.
- `needsRefresh: true`인 경우 lookup Workflow는 URI lookup Activity가 반환한 `actorUri`와 원래 받은 optional `profileId`를 별도 refresh ID prefix child에 그대로 전달해 `refreshRemoteProfileActorActivity`를 실행한다. Child는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`으로 시작하고 start acknowledgement 뒤 cached ID를 반환한다. 이미 실행 중인 같은 child는 정상 coalescing으로 처리하고, 그 밖의 child start·execution failure는 관측한 뒤 cached ID를 유지한다. Public Workflow 자체의 start failure는 caller가 DB fallback을 만들지 않고 기존 오류 경계로 전달한다. Async caller는 모든 분기에서 public Workflow start acknowledgement만 기다린다.
- 조건별 Workflow start가 대부분 하나이고 각 start 오류를 이미 격리한다면 Promise를 `effects` 배열에 push한 뒤 `Promise.all`로 모으지 않는다. 한 transaction 결과에서 두 Workflow가 필요한 경우에도 각 조건에서 직접 `await`해 type, input과 Workflow별 ID 규칙을 가까이 둔다. 실제 동시 start가 계약인 경우에만 배열과 병렬 대기를 사용한다.
- Client Workflow start에는 repository의 공통 task queue와 bounded deadline을 명시한다. 일반적인 새 실행은 `USE_EXISTING` conflict
  policy와 `REJECT_DUPLICATE` reuse policy를 사용하지만, directed Profile pair Workflow는 실행 중인 lifecycle에는
  `USE_EXISTING`을 사용하고 완료된 lifecycle의 새 실행에는 `ALLOW_DUPLICATE` reuse policy를 사용한다.
- post-commit start 오류는 최소 identity와 transition context로 관찰하고 committed action 결과와 분리한다. observer callback 자체의 실패도 결과를 바꾸지 않는다.
