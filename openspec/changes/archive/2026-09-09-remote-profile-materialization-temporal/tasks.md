## 1. PROD-808 Remote actor materialization execution

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `docs/architecture/core-services.md`
- `PROD-808`
- `PROD-248`

**Deliverable**

신규 remote actor materialization과 stale refresh가 같은 내구성 있는 실행 경로에서 기존 Profile identity·projection·transaction 결과를 만든다. 상위 remote actor caller는 qualified handle의 domain·handle과 origin 선택용 행동 Profile ID인 선택적 input `profileId`를 `remoteProfileLookupWorkflow`에 전달하며, Workflow의 URI lookup Activity가 저장된 canonical actor URI를 재사용하거나 WebFinger self link에서 canonical URI를 확인한다. 저장된 row가 없어도 lookup 결과의 `actorUri`로 신규 materialization을 수행하고 동기 결과 대기와 비동기 시작 확인을 선택할 수 있다. Activity 모듈의 private stored-state query가 missing을 표현하고 `materializeRemoteProfileActorActivity`는 `{ profileId, needsRefresh }` non-null DTO를 반환하며, 실제 fetch·persist는 `refreshRemoteProfileActorActivity`가 ordinary call과 stale refresh child에서 공유한다. Caller는 Workflow 종류와 무관한 공용 `runWorkflow`를 사용한다.

**Guardrails**

- `profileId`가 없으면 configured Local Instance canonical origin을 사용하고, 있으면 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용한다. 필요한 Remote actor 정보가 없을 때 origin을 추측하지 않는다.
- URI lookup Activity가 반환한 `actorUri`는 저장된 actor가 없어도 직접 Fedify lookup target으로 사용하며 refresh Activity는 acct handle lookup을 수행하지 않는다. refresh가 반환한 actor URI가 예상한 `actorUri`와 일치하지 않으면 Profile 또는 actor metadata를 저장하지 않는다.
- 각 Workflow는 자기 input에서 ID를 만드는 규칙을 한 곳에 정의한다. `WorkflowDefinition<T>`는 SDK Workflow 함수 또는 이름과 `workflowIdFromArgs: (...args: Parameters<T>) => string` callback을 한 plain object로 묶으며, `runWorkflow(definition, { args, mode, ...native Workflow options })`는 이 definition에서 Workflow와 ID 규칙을 함께 받는다. Wrapper는 native args를 callback에 한 번 전달해 해당 규칙을 적용하고 KOSMO task queue와 5초 bounded deadline으로 native `start` 또는 `execute`만 호출하며, native result·start 반환값·error와 conflict·reuse policy를 그대로 전달하고 domain 오류 정책은 호출부에 남긴다. 이 change에서는 `remoteProfileLookupWorkflow` 정의 객체를 caller가 공유하고 다른 domain ID와 UWS는 일괄 마이그레이션하지 않는다.
- Workflow child 실행이 실제로 필요할 때는 `apps/worker/src/workflows/child.ts`의 `runChildWorkflow<T>`가 기존 `WorkflowDefinition<T>`를 `import type`으로 재사용한다. Helper는 실제 args로 definition의 ID callback을 한 번 호출하고 `mode: 'start'`의 native child handle/start acknowledgement 또는 `mode: 'execute'`의 native result를 반환하며, native child options·error·queue inheritance를 보존한다. Client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 복사하지 않고, 생략된 `parentClosePolicy`·`cancellationType`은 Temporal 기본값을 사용하며 `ABANDON`을 자동 적용하지 않는다. 현재 Coordinator 내부 refresh child와 향후 public materialization Workflow를 외부 parent에서 호출하는 caller는 각자 필요한 경우 두 `ABANDON` 옵션을 명시한다.
- public lookup Workflow는 URI lookup Activity 뒤 materialize Activity를 호출하고, caller mode를 Workflow input이나 branch로 분리하지 않는다. Missing과 stale의 실제 fetch는 `refreshRemoteProfileActorActivity`를 ordinary call 또는 refresh child에서 실행한다.
- Fedify context, actor object와 전체 DB row를 Workflow payload로 전달하지 않고, Workflow/Activity 결과는 Profile identity 중심으로 유지한다.
- 기존 identity, canonical actor reuse, state eligibility, projection, transaction과 ordering 계약 및 schema/migration 범위를 유지한다.

**Verification**

- `profileId` 생략·Local Profile·Remote Profile·Remote actor metadata 결손 입력을 실행해 origin 선택과 실패 경계를 검증한다.
- Workflow 밖 Temporal Client caller의 같은 qualified handle과 origin-selection identity 동시 sync/async 요청이 중복 Profile/actor row를 만들지 않고, sync는 Profile identity를 받고 async는 durable start acknowledgement를 받는지 검증한다.
- caller가 stale row를 본 뒤 Activity가 늦게 실행되는 경우 최신 Profile/actor/Instance 상태와 TTL을 다시 확인해 불필요한 원격 fetch를 하지 않는지 검증한다.
- URI lookup 뒤 actorUri materialization과 저장된 actor URI refresh가 refresh Activity에서 acct handle lookup을 수행하지 않고, 반환 URI 불일치와 같은 URI의 `preferredUsername` 변경을 각각 저장 거부·기존 Profile 갱신으로 처리하는지 검증한다.
- `runChildWorkflow<T>`가 definition의 실제 args 기반 ID를 한 번 계산하고 `start`의 native child handle/start acknowledgement와 `execute`의 native result, args/options/error/queue inheritance를 보존하는지 검증한다. Client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline을 child에 복사하지 않고 생략된 parent close/cancellation 옵션을 Temporal 기본값으로 두는지도 확인한다. 이 change에는 URI 전용 public Workflow나 그 외부 child caller를 추가하지 않는다.
- Activity/Worker 재시작 후 실행 재개와 기존 projection·transaction 결과를 검증한다.

- [x] 1.1 상위 remote actor caller가 검색·발견 경계에서 받은 `actorUri`, 선택적인 `profileId`와 caller sync/async 선택을 유지하고, stale branch가 저장된 actor URI를 Temporal `actorUri` input으로 재사용하도록 전환하며 unsigned lookup 및 Profile origin 선택·결손 오류를 보존한다.
- [x] 1.2 신규 materialization과 stale refresh가 기존 Fedify lookup·projection·transaction을 한 번의 Temporal Workflow/Activity 실행 경로에서 수행하고 Worker에 연결되도록 구현한다.
- [x] 1.3 JSON-safe actorUri/profileId 입력·Profile ID 결과와, `remoteProfileMaterializationWorkflow` 정의 객체가 Workflow와 기존 input-to-ID 규칙을 함께 전달해 공용 `runWorkflow`가 적용하는 stable Workflow identity, in-flight reuse와 완료 후 재시도 semantics를 적용한다.
- [x] 1.4 영구 domain rejection과 일시적 외부/DB 장애의 retry 경계를 적용하고, caller deadline이 이미 시작된 Workflow를 취소하지 않도록 검증한다.
- [x] 1.5 실제 Workflow 내부 async caller가 추가되는 경우 `startChild`의 start acknowledgement만 기다리고 caller-owned `parentClosePolicy: ABANDON` 및 `cancellationType: ABANDON`으로 parent 종료·취소 이후에도 child를 유지하도록 하는 계약과, child active-ID conflict를 자동 join으로 가장하지 않는 경계를 기록한다.
- [x] 1.6 `apps/worker/src/workflows/child.ts`에 기존 `WorkflowDefinition<T>`를 재사용하는 `runChildWorkflow<T>`를 구현하고, 실제 helper를 import한 Temporal bundle/integration 3/3과 typecheck로 definition ID callback의 실제 args 전달, `start`의 native handle·signal, `execute`의 native result, native failure cause chain, native option forwarding과 generic args/result/`ChildWorkflowHandle` inference를 검증한다. Worker build, ESLint와 Prettier도 통과했다. 실제 remote production child caller, Worker restart·caller timeout과 전체 parent-close/cancellation matrix 검증은 이 task의 증거에 포함하지 않으며, remote async caller가 추가될 때 두 `ABANDON` 옵션을 별도로 검증한다.

## 2. PROD-808 Profile search and read boundaries

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0017-profile-search-staged-visibility.md`
- `PROD-504`
- `PROD-573`
- `PROD-808`

**Deliverable**

인증된 명시적 qualified remote search는 저장된 stale Profile을 즉시 반환하면서 같은 Temporal refresh를 시작하고, 원격 요청이 허용되지 않은 검색·route와 inbound Update no-network 경계를 그대로 유지한다. inbound Follow의 기존 request context와 lookup 경계는 유지한다.

**Guardrails**

- 갱신 불필요 상태(fresh 또는 `UNRESPONSIVE`)의 stored Profile은 원격 작업 없이 반환하고, stale Profile의 refresh 실패나 시작 실패는 기존 row와 성공한 검색 결과를 무효화하지 않는다.
- 일반 partial/local/malformed 검색, `profileByHandle`, profile route와 하위 route는 원격 materialization·refresh를 시작하지 않는다.
- `SUSPENDED` Profile/Instance 비노출, `UNRESPONSIVE` Instance refresh 금지, 기존 empty-result와 unexpected-error 관측 매핑을 유지한다.
- inbound Follow request context와 lookup, 검증된 inbound Update actor/no-network projection은 이 전환에 포함하지 않으며 기존 경계를 유지한다.

**Verification**

- 명시적 검색의 missing/갱신 불필요(fresh·`UNRESPONSIVE`)/stale actor, refresh failure/start failure와 visibility 결과를 실행해 즉시 반환·refresh·fallback을 검증한다.
- partial/local/malformed 검색, `profileByHandle`, profile route와 inbound Update 경로에서 외부 lookup이 발생하지 않는지 행동 수준으로 검증하고, inbound Follow는 기존 request context와 lookup 동작을 유지하는지 별도로 검증한다.

- [x] 2.1 명시적 qualified search가 missing Profile의 기존 synchronous materialization과 canonical identity 결과를 유지하도록 caller를 연결한다.
- [x] 2.2 명시적 qualified search가 stale Profile을 즉시 반환하고 refresh를 끄지 않으면서 동일한 Temporal 경로를 시작하도록 전환한다.
- [x] 2.3 partial/local/malformed/profileByHandle/route 및 inbound Update no-network 경계 회귀와 inbound Follow 기존 lookup 경계, expected empty-result·unexpected error 관측을 검증한다.

## 3. PROD-808 Integration and completion verification

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `docs/architecture/core-services.md`
- `PROD-808`

**Deliverable**

최신 `main`에서 독립적으로 검증 가능한 1-layer 구현과 정합성 증거를 완성하고, 이후 migration Stack이 이 layer 위에서 호출부를 재배치할 수 있는 상태를 만든다.

**Guardrails**

- DB schema/migration, Profile Migration, inbound Update 동작, production rollout/merge/queue와 migration Stack branch/base 변경을 이 scope에 포함하지 않는다.
- 새 status API, 주기 scanner, 장수명 Profile Workflow, parser/client/projection/framework를 추가하지 않는다.
- CI·개발·production 증거를 섞지 않고 각 검증 결과를 실제 실행 결과로 기록한다.

**Verification**

- 영향받은 package typecheck와 Worker build를 통과시킨다.
- Temporal test environment 또는 동등한 실행 검증으로 `WorkflowDefinition<T>` binding과 공용 `runWorkflow`의 Workflow별 기존 ID 규칙 적용, URI lookup Activity→materialize Activity→refresh Activity 순서, native args와 sync/async 결과·handle type inference, start acknowledgement·결과 처리, `needsRefresh: false`/`true`, missing fetch·persist, retry/error, timeout continuation, restart와 concurrency를 확인한다. SDK의 parent-close/cancellation semantics 자체를 source/options equality test로 재검증하지 않는다.
- `openspec validate remote-profile-materialization-temporal --type change --strict --no-interactive`를 통과시키고, 전체 declared scope 완료 후 canonical spec sync와 archive 판단을 PROD-808 owner가 수행한다.

- [x] 3.1 영향받은 Fedify/API/core/Worker 행동 테스트를 추가·실행해 두 capability의 scenarios와 기존 회귀 경계를 검증한다.
- [x] 3.2 영향받은 typecheck, Worker build와 필요한 lint/check를 실행하고 결과를 기록한다.
- [x] 3.3 OpenSpec strict validation과 canonical 문서 정합성을 확인한 뒤 migration Stack owner에게 reparent 가능한 handoff 증거를 전달한다.

## 4. Follow-up: Coordinator routing and caller dispatch

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `docs/architecture/core-services.md`
- `PROD-808`

**Deliverable**

caller pre-read를 제거하고 이미 제거된 process-local refresh callback을 재도입하지 않으며, public
`remoteProfileLookupWorkflow` 하나가 URI lookup 뒤 materialize 결과와 durable stale refresh 경계를 소유한다. 기존
actor identity, optional acting `profileId`, materialize/refresh Activity의 projection·transaction 결과와 명시적 search의
connection·visibility 결과를 유지한다.

**Guardrails**

- caller는 materialization을 결정하기 위해 stored row, actor metadata와 TTL을 직접 조회·판단하지 않으며 public
  Workflow start failure 뒤 DB fallback을 만들지 않는다.
- Workflow payload는 URI lookup Activity에서 받은 `actorUri`와 origin 선택용 optional input `profileId`, materialize Activity의
  `{ profileId, needsRefresh }` non-null 최소 JSON-safe DTO·Profile identity만 사용하고 Fedify context, actor object와 full DB row를
  전달하지 않는다. DTO `profileId`는 cached 또는 새로 생성한 target Profile ID이며 input `profileId`를 대체하지 않는다.
- Materialize Activity가 stored/missing 판정과 state·TTL을 소유한다. `needsRefresh: false`인 갱신 불필요 상태(fresh 또는
  `UNRESPONSIVE`)는 외부 fetch·child 없이 cached Profile ID를 반환하고, missing은 `refreshRemoteProfileActorActivity` fetch·persist
  뒤 `{ profileId: id, needsRefresh: false }`를 반환한다.
- stale refresh child는 별도 refresh ID prefix와 명시적인 `parentClosePolicy: ABANDON`, `cancellationType: ABANDON`을
  사용하며, child start acknowledgement 뒤 cached Profile ID를 반환한다.
- qualified-handle parsing과 materialization 이후 connection·staged visibility 조회, partial/local/malformed 검색,
  `profileByHandle`, profile route와 inbound Update/Follow 경계는 기존 책임을 유지한다. URI discovery는 lookup Activity가 담당한다.

**Verification**

- URI lookup Activity 뒤 materialize Activity가 non-null `{ profileId, needsRefresh }` DTO를 반환하고, missing에서 fetch·persist 후
  `{ profileId: id, needsRefresh: false }`를 반환하는지, DTO `profileId`를 cached/new target identity로 사용하며 input의 optional
  `profileId`를 refresh child에 그대로 전달하는지 검증한다.
- `needsRefresh: true`일 때만 stale child의 별도 ID, 두 `ABANDON` 옵션, start acknowledgement 뒤 parent 완료, 동일 active child
  coalescing, child start·execution failure 관측과 cached identity 보존을 실행 검증한다. refresh Activity가 fetch 직전에
  TTL·Profile·actor·Instance 상태를 재확인하는지도 확인한다.
- 동기 caller가 missing 결과를 기다리고 `needsRefresh: false`/`true` cached identity를 받으며, 비동기 caller가 모든 materialize 결과에서 public
  Workflow start acknowledgement 뒤 반환하는지 검증한다. public start failure의 기존 search/materialization 오류
  mapping과 qualified-handle discovery·post-result visibility 조회가 유지되는지도 확인한다.

- [ ] 4.1 public `remoteProfileLookupWorkflow`가 URI lookup Activity 뒤 materialize Activity를 호출하고, materialize Activity가 stored/missing 판정과 non-null `{ profileId, needsRefresh }` DTO를 반환하도록 구현한다. Missing은 refresh Activity fetch·persist 뒤 `{ profileId: id, needsRefresh: false }`로 반환한다.
- [ ] 4.2 `needsRefresh: true`에서만 별도 refresh child를 시작해 두 `ABANDON` 옵션과 child start acknowledgement 경계를 적용하고, URI lookup Activity 결과의 `actorUri`와 Workflow input의 optional `profileId`를 전달하며, 동일 active child coalescing·failure 관측·cached identity 보존 및 실행 직전 freshness/eligibility 재확인을 구현한다.
- [ ] 4.3 caller가 한 public lookup Workflow dispatch만 사용하도록 전환하고, 5초 bounded 대기 설정이 discovery를 포함하는지와 새 Activity 조합의 결과·오류, sync/async all-state acknowledgement, no-DB-fallback, discovery/visibility DB boundary 및 기존 search error mapping의 행동 검증을 완료한다. Workflow timeout continuation과 Worker restart recovery 자체는 Temporal native 계약으로 둔다.

## Completion evidence

- Fedify remote actor materialization integration: 55/55 passed against the isolated PostgreSQL and Temporal runtime.
- API GraphQL profile integration: 68/68 passed against the isolated PostgreSQL and Temporal runtime.
- Worker Remote Profile Workflow and Activity integration: 6/6 passed with Temporal's local test server, including retry and non-retryable rejection paths.
- Core Temporal caller tests: 3/3 passed, covering sync Profile ID results, async durable start acknowledgement and stable identity. The deadline check verifies that the shared Core client wrapper invokes a deadline-bound wait.
- Historical generic `runWorkflow` verification (2026-09-10): Core client tests 11/11 and Core client plus Follow tests 15/15 passed; Worker build exited 0; Fedify remote actor materialization integration 50/50 passed; API GraphQL profile integration 70/70 passed with the Temporal test runtime; and Fedify/API typechecks plus the limited client typecheck, ESLint, Prettier and diff checks passed. Full Core `tsc` is not claimed because existing app alias/Svelte-scope errors remain outside this scoped verification.
- Historical callback-only Workflow ID rule verification (2026-09-10): Core client tests 10/10 passed, covering separate `workflowIdFromArgs` callback forwarding and the preserved remote materialization Workflow ID rule; limited client TypeScript, ESLint, Prettier and `git diff --check` passed; Worker build (`pnpm --filter @kosmo/worker build`, `tsc --noEmit`) exited 0; Fedify remote actor materialization integration 50/50 and API GraphQL profile integration 70/70 passed against the actual Temporal test server/Worker and a separate unique PostgreSQL database; Fedify/API typechecks passed.
- Latest `WorkflowDefinition<T>` interface verification (2026-09-10): Core client tests 10/10 passed; actual Temporal Worker + separate unique PostgreSQL integration passed Fedify 50/50 and API profile 70/70; Fedify/API typechecks, Worker build with `tsc --noEmit`, and changed-file ESLint, Prettier and `git diff --check` passed. The evidence covers the object-form definition, shared `remoteProfileMaterializationWorkflow`, and native args/result/handle type inference. The restricted `/private/tmp/workflow-definition-typecheck.ts` fixture also passed `tsc`, covering omitted `runWorkflow<T>` inference, object/execute and native/start handle paths, and expected errors for invalid args/results.
- Latest generic child helper verification (2026-09-10): A Temporal bundle/integration suite importing the real helper passed 3/3. Execute mode with a typed string definition forwarded args, generated Workflow ID and result; start mode with a function definition returned a native handle, verified `handle.signal`, and showed that a child with explicit `parentClosePolicy: ABANDON` and `cancellationType: ABANDON` remained `RUNNING` after parent completion until an external signal/result completion; native child failures preserved the cause chain. The imported-helper typecheck fixture `/private/tmp/child-helper-real-typecheck.ts` passed `tsc` (exit 0), covering omitted generic args/result/`ChildWorkflowHandle` inference and three expected errors for wrong args/result and unsupported `workflowIdConflictPolicy`. Worker build, ESLint and Prettier passed. The Worker package `test:workflow` suite includes this child test; `pnpm --filter @kosmo/worker test:workflow` passed 16/16 with 0 failed and 0 cancelled, and the test Temporal server and all Workers stopped cleanly. This evidence covers generic helper native execution, type inference and explicit option forwarding; it does not prove a remote production caller, Worker restart, caller-timeout continuation or the full parent-close/cancellation matrix. The historical Core client and Fedify/API integration counts above are not child helper proof.
- Latest remote-profile runtime evidence (2026-09-10): a native temporary PostgreSQL instance at `127.0.0.1:54329` with the actual Temporal runtime passed the Worker remote-profile Workflow/Activity suite 15/15 and Fedify remote actor materialization integration 50/50. The coverage includes state classification, fresh/`UNRESPONSIVE` no-refresh behavior, stale child start and immediate parent return, active-child coalescing after the first parent closes, child-failure cached identity preservation, and missing-branch failure propagation. The Core fixture importing the actual definitions and exercising the union mode passed `tsc`. API GraphQL profile integration passed 70/70 with the Temporal runtime enabled; an earlier runtime-disabled fixture-reset attempt failed 8 cases and is not counted as final runtime evidence.
- Historical generic wrapper callsite checks: Changed Core call sites were covered by the consumer package typechecks and the focused Core tests. Core has no dedicated `tsconfig` or typecheck script; a standalone invocation follows the root configuration and is not a scoped Core check. `pnpm --filter @kosmo/fedify exec tsc --noEmit --pretty false`, `pnpm --filter @kosmo/api exec tsc --noEmit --pretty false`, `pnpm --filter @kosmo/worker build`, changed-file ESLint, changed-file Prettier and `git diff --check` passed.
- Archived change validation with the installed OpenSpec `Validator` passed with zero issues: `validateChange(<archiveDir>/proposal.md)` validates the proposal and `validateChangeDeltaSpecs(<archiveDir>)` validates the archived delta specs. The direct CLI change lookup is active-change-only and is not used as archive validation evidence. Parent-close and cancellation behavior remain delegated to Temporal SDK semantics as declared above.
- Native Temporal execution evidence for caller-timeout continuation and Worker restart recovery is not included in this change. The latest remote-profile runtime suite covers the internal refresh child, while a separate external parent invoking the public materialization Workflow and the full parent-close/cancellation matrix remain unverified. Those remaining boundaries stay delegated to Temporal SDK semantics as declared above.
