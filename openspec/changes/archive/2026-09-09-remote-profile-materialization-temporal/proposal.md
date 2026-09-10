## Why

원격 actor 신규 materialization과 stale refresh가 API 프로세스의 직접 조회와 process-local callback에 나뉘어 있어, 호출자가 Fedify context와 origin을 조합하고 프로세스 종료·재시작 이후 작업을 보장해야 한다. 두 경로를 하나의 내구성 있는 Temporal 실행 경로로 정리해 호출자 응답 계약을 유지하면서 재시도와 Worker 재개를 가능하게 한다.

## What Changes

- 상위 remote profile 검색 경계가 qualified handle을 canonical `actorUri`로 해석한 뒤, 선택적인 `profileId`와 함께 필요한 local 또는 remote origin을 선택하고 기존 unsigned lookup을 유지한다.
- Temporal Workflow와 Activity wire input을 canonical `actorUri`와 선택적인 `profileId`로 제한한다. 저장된 actor나 Profile이 없어도 actor URI로 신규 materialization을 수행할 수 있다.
- 신규 materialization과 stale refresh를 하나의 Temporal Workflow와 하나의 Activity 실행 경로로 통합한다.
- 호출자가 동기 모드에서는 신규 결과를 기다리고 비동기 모드에서는 Workflow 시작 확인만 받도록 하며, 이 선택은 Workflow 종류를 나누지 않는다.
- fresh Profile은 원격 작업 없이 즉시 반환하고, stale Profile과 명시적 qualified remote search는 기존 row를 즉시 반환한 뒤 Temporal refresh를 시작한다.
- 다른 Workflow가 async로 같은 작업을 시작하면 child start acknowledgement를 확인한 뒤 parent가 종료되어도 child materialization/refresh가 계속 실행된다.
- 일반 partial/local/malformed 검색, `profileByHandle`, profile route와 inbound Update의 no-network 경계를 유지한다.
- 기존 identity·state·projection·ordering·empty-result 오류 매핑을 보존하고, 시작·조회 실패가 기존 stale Profile을 무효화하지 않도록 한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`
- Linear Contract: `PROD-808`
- Linear Implementations: `PROD-808` (현재 change owner)
- Related boundaries: `PROD-248` (Fedify actor materialization), `PROD-625` (remote avatar/header projection), `PROD-607` (inbound Update 경계), `PROD-665` (Local Profile 후속 효과)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-remote-profile-federation`: 신규 materialization과 stale refresh의 실행 경계, caller sync/async 계약, origin/context 소유권을 Temporal 경로에 맞게 구체화한다.
- `profile`: 명시적 qualified remote search에서 stale Profile을 즉시 반환하고 refresh를 시작하는 동작을 추가하며, 그 밖의 DB-only 검색 경계를 유지한다.

## Impact

- `packages/fedify`의 remote actor lookup/materialization 호출 경계와 refresh scheduling seam
- `packages/core`의 Temporal client 호출 보조와 `apps/worker`의 Workflow·Activity 등록 경계
- `apps/api`의 profile handle lookup 및 명시적 remote search caller
- remote profile lookup, stale refresh, retry/error mapping, concurrent trigger, Worker restart 검증
- DB schema와 migration, inbound Update 동작, production rollout은 변경하지 않는다.
