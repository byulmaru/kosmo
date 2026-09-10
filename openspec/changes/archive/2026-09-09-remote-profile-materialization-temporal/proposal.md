## Why

원격 actor 신규 materialization과 stale refresh가 API 프로세스의 직접 조회와 process-local callback에 나뉘어
있어, caller가 저장 row·actor metadata·TTL을 미리 읽고 각 상태를 판단해야 했다. 이 구조는 public API의
동기·비동기 응답과 refresh durability를 서로 다른 경로로 만들고, process 종료·재시작 이후 작업을 보장하지
못한다. public Temporal Workflow가 상태 확인과 분기를 소유하고 기존 materialization Activity를 재사용하면
호출자는 하나의 내구성 있는 실행 경계를 사용하면서 missing·갱신 불필요·stale 결과 계약을 유지할 수 있다.

## What Changes

- 검색·발견 경계가 qualified handle을 canonical `actorUri`로 해석하고, materialization caller는 domain wrapper나 Profile
  row 재조회 없이 canonical `actorUri`와 선택적인 acting `profileId`를 args로 공용
  `runWorkflow(remoteProfileMaterializationWorkflow, ...)`에 전달해 반환된 Profile ID를 사용한다. 기존 Workflow ID
  규칙과 `profileId`에 따른 origin 선택은 유지한다.
- Coordinator Workflow가 `{ profileId, needsRefresh } | null` 형태의 최소 JSON-safe stored-state DTO를 반환하는
  state Activity를 호출해 missing·갱신 불필요·stale를 분기한다. `null`은 missing, `needsRefresh: false`는 갱신이
  불필요하거나 허용되지 않는 상태(fresh 또는 `UNRESPONSIVE`), `needsRefresh: true`는 갱신 가능한 stale을 나타내며
  DB row나 actor object는 포함하지 않는다. DTO의 `profileId`는 조회 대상인 cached Remote Profile ID이고, Workflow
  input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다. Refresh child에는 Workflow가 원래 받은 input
  (`actorUri`와 선택적인 `profileId`)을 그대로 전달하며 state `profileId`로 대체하지 않는다.
- 갱신 불필요 분기는 외부 lookup이나 child 없이 cached Profile ID를 반환하고, missing 분기는 기존 materialization
  Activity를 직접 실행해 그 결과를 반환한다.
- stale 분기는 별도 refresh child를 시작하고 child start acknowledgement까지 기다린 뒤 cached Profile ID를
  반환한다. refresh child는 기존 materialization Activity를 실제 fetch 경로로 재사용하고 별도 refresh ID prefix,
  `parentClosePolicy: ABANDON`, `cancellationType: ABANDON`을 사용한다. 이미 실행 중인 같은 child는 정상 coalescing으로
  처리하고, 그 밖의 child start·execution failure는 관측하면서 cached identity를 유지한다.
- `mode: 'execute'` caller는 public Workflow 결과를 기다려 missing에서는 materialization 완료를, fresh/stale에서는
  Profile identity를 받는다. `mode: 'start'` caller는 fresh/missing/stale 모든 분기에서 public Workflow의 native
  start acknowledgement만 받은 뒤 반환한다. public Workflow 자체의 start failure에서는 caller가 DB fallback을
  만들지 않고 기존 오류 경계로 전달한다.
- Worker의 Workflow-safe generic `runChildWorkflow<T>`는 `WorkflowDefinition<T>`와 native child lifecycle을
  재사용하며, child ID·args·result/handle·native options/error/queue inheritance를 보존한다. helper는 caller의
  parent lifetime 정책을 자동으로 정하지 않는다.
- 일반 partial/local/malformed 검색, `profileByHandle`, profile route와 inbound Update의 no-network 경계를
  유지하고, qualified-handle discovery는 Workflow dispatch 전에 기존 검색 경계가, materialization 성공 뒤
  connection·staged-visibility DB 조회는 기존 검색 경계가 수행한다.
- 기존 identity·state·projection·ordering·empty-result 오류 매핑을 보존하고, stale Profile이 refresh 시작 또는
  실행 실패 때문에 무효화되지 않도록 한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`
- Linear Contract: `PROD-808`
- Linear Implementations: `PROD-808` (현재 change owner)
- Related boundaries: `PROD-248` (Fedify actor materialization), `PROD-625` (remote avatar/header projection), `PROD-607` (inbound Update 경계), `PROD-665` (Local Profile 후속 효과)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-remote-profile-federation`: public coordinator Workflow의 stored-state routing, 신규 materialization과
  stale refresh의 실행 경계, caller의 native result/start mode와 child lifetime을 구체화한다.
- `profile`: 명시적 qualified remote search가 하나의 public Workflow를 dispatch하고, 갱신 불필요/missing/stale 결과를
  기존 connection·staged visibility 경계에 연결하는 동작을 구체화한다.

## Impact

- `packages/fedify`의 remote actor lookup/materialization 호출 경계와 refresh scheduling seam
- `packages/core`의 Temporal client 호출 보조와 `apps/worker`의 public coordinator Workflow·state Activity 등록 경계
- `apps/worker/src/workflows/child.ts`의 generic child Workflow 실행 helper와 native lifecycle 검증
- `apps/api`의 profile handle discovery, materialization caller와 기존 connection·visibility 조회 경계
- remote profile state routing, stale child refresh, retry/error mapping, concurrent trigger와 Worker restart 검증
- DB schema와 migration, inbound Update 동작, production rollout은 변경하지 않는다.
