## Why

Profile 수정 transaction은 Core가 동기적으로 소유하지만, federation-visible 변경의 `Update(Person)` 전달은 caller가 실행하는 process-local `postCommit`에 남아 있다. Commit된 변경의 후속 효과를 Temporal Activity retry와 Worker restart로 복구할 수 있도록 상태 변경은 유지하고 전달 효과만 Workflow로 이전해야 한다.

## What Changes

- 실제 federation-visible Profile 변경 commit 뒤에만 Profile Update Effects Workflow를 시작한다.
- 각 변경에 stable update identity를 부여하고 같은 Workflow retry에서 동일한 ActivityPub Update identity를 재사용한다.
- Activity는 실행 시점의 최신 committed Profile projection을 읽어 canonical `Update(Person)`을 Fedify queue에 handoff한다.
- displayName, bio, followPolicy, avatar, header 변경만 Workflow를 시작하고, Tag·default Post visibility 변경과 no-op은 시작하지 않는다.
- Core Profile action의 optional database handle과 반환형 `postCommit`, GraphQL caller의 callback 실행을 제거한다.
- Commit과 Workflow start 사이 유실, start 실패, 빠른 연속 수정의 last-write-wins를 명시적으로 수용한다.
- Profile projection version, ordering 보장, outbox·receipt·relay, DB migration과 production rollout은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-665`
- Linear Implementations: `PROD-629`, `PROD-448`

## Capabilities

### New Capabilities

- `temporal-profile-update-effects`: Committed federation-visible Profile 변경 뒤 canonical `Update(Person)` queue handoff를 retry하는 Effects Workflow 계약

### Modified Capabilities

- `profile`: Core-owned Profile update transaction과 실제 actor projection 변경 뒤 Workflow start 경계
- `activitypub-local-profile-update-delivery`: stable update identity, latest-at-delivery projection과 Temporal Activity queue handoff 경계
- `temporal-worker-runtime-foundation`: Profile Update Effects Workflow와 Activity의 compile-time 등록 및 retry·restart 검증

## Impact

- Core Profile update service가 자체 transaction과 commit 이후 Workflow start 시도를 소유한다.
- API caller의 Profile update 경계에서 database handle과 `postCommit`이 사라진다.
- Fedify Profile Update delivery가 stable update identity를 입력받는다.
- 기존 단일 Worker registry에 Profile Update Workflow와 delivery Activity가 추가된다.
- GraphQL schema, Profile DB schema, canonical Person projection, Fedify MessageQueue consumer와 production runtime은 변경하지 않는다.
