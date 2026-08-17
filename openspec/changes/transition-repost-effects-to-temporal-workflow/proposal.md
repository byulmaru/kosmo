## Why

Repost 생성·취소와 verified ActivityPub Announce·Undo materialization은 Core transaction에서 동기적으로
확정되지만, Repost Notification과 Local-origin federation queue handoff는 process-local `postCommit`에
남아 있다. PROD-725는 이 callback과 caller database handle 조립을 제거하고, 실제 Repost 상태 전이가
commit된 뒤에만 Temporal Workflow가 후속 효과를 재시도하도록 경계를 통일한다.

## What Changes

- Local GraphQL Repost는 Repost 상태를 Core transaction에 저장한다. verified ActivityPub Announce·Undo는
  Repost 상태와 필요한 current ActivityPub mapping을 specialized Core action의 같은 transaction에 저장한다.
  transaction Activity, proposed domain ID, command receipt 또는 outbox를 추가하지 않는다.
- 최초 실제 Repost 생성·Tombstone commit만 create/delete를 구분하는 stable transition identity와
  `origin: LOCAL | ACTIVITYPUB`으로 Repost effects Workflow start를 시도한다. Workflow input은
  `repostId`, `origin`, `transition`만 가지며, delete Activity는 Tombstone row에 보존된 Repost projection에서
  actor·source·createdAt·visibility identity를 다시 사용한다. duplicate·no-op·rollback은 Workflow를 시작하지
  않는다.
- accepted Workflow는 Repost Notification 생성·정리와 Local-origin Announce·Undo Fedify queue handoff를
  독립 Activity로 멱등 재시도한다. ActivityPub-origin transition은 Notification lifecycle만 수행하고 outbound
  echo를 만들지 않는다. Notification은 canonical Best Effort projection과 unavailable 결과 숨김을 유지하며,
  create/delete 직렬화를 위한 `FOR UPDATE` 또는 row lock을 추가하지 않는다.
- Fedify queue acceptance를 Activity 성공 경계로 유지한다. queue acceptance 뒤 remote retry·ordering은
  Fedify가 소유하며, acknowledgement가 모호한 handoff의 cross-system exactly-once는 보장하지 않는다.
- Core Repost action과 pure Repost delete 경로의 database handle 및 반환형 `postCommit`, API/Fedify caller의
  후속 효과 조립을 제거한다. Workflow start 실패와 commit→start process gap은 관측하지만 committed Repost와 기존
  GraphQL/ActivityPub 성공 결과를 유지한다.
- Worker는 하나의 process-global host와 task queue를 유지하면서 compile-time business registration에 Repost
  Workflow·Activity를 추가한다. domain별 Workflow 계약은 Core의 분리된 Temporal module에 둔다.
- 기존 `add-post-reposts` active change에 남은 PROD-669 process-local `postCommit` 실행 경계는 PROD-725의
  Temporal 경계로 동기화하되, canonical Best Effort·hidden unavailable 효과 계약은 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`,
  `docs/domain/decisions/0014-post-structure-relations.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-725`
- Linear Implementations: `PROD-725`; 기존 Repost 기반과 ActivityPub wiring은 `PROD-401`, `PROD-411`,
  `PROD-412`, `PROD-416`, `PROD-495`, `PROD-496`, `PROD-669`
- OpenSpec dependency: active `add-post-reposts`가 Repost Notification 요구사항을 canonical spec에 먼저
  동기화·archive한 뒤 이 change를 archive한다. 두 change의 구현은 PROD-725에서 함께 검증할 수 있지만
  archive 순서는 `add-post-reposts` → 이 change다.

## Capabilities

### New Capabilities

- `temporal-repost-effects`: 실제 create/delete commit에서 시작해 Repost Notification lifecycle과
  Local-origin Announce·Undo queue handoff를 독립적으로 재시도하는 effects Workflow

### Modified Capabilities

- `post`: pure Repost의 최초 Tombstone commit 뒤 직접 Notification cleanup을 실행하는 계약을 effects Workflow
  start로 변경한다.
- `activitypub-local-repost-delivery`: 최초 Local Repost create/delete의 Announce·Undo handoff를 process-local
  post-commit 실행에서 Temporal Activity retry 경계로 이동한다.
- `activitypub-remote-repost`: verified Announce·Undo가 Repost와 current ActivityPub mapping을 같은 Core
  transaction에 저장하고 commit 뒤 Notification-only effects Workflow를 시작하도록 caller 경계를 변경한다.
- `temporal-worker-runtime-foundation`: singleton Worker host의 compile-time business registration을 Post Create
  전용에서 Post Create와 Repost effects를 함께 등록하는 고정 registry로 확장한다.

## Impact

- `packages/core/services/post.ts`와 Repost domain service: transaction ownership, stable transition 결과,
  database handle·`postCommit` 제거, Workflow start 관측
- `packages/core/temporal`: Repost Workflow type/input/identity/start 계약을 domain별 module로 추가
- `apps/api`: Repost/create-delete resolver에서 database handle과 `postCommit` 조립 제거
- `packages/fedify`: inbound Announce·Undo caller를 공통 Core transaction 경계로 단순화하고 기존 canonical
  Announce·Undo producer를 Activity에서 재사용
- `apps/worker`: Repost Workflow·Activity registration과 독립 effects 실행
- `openspec/changes/add-post-reposts`: 최신 PROD-725가 대체한 PROD-669 post-commit lifecycle 문구 동기화
- OpenSpec archive: Repost Notification base requirement를 제공하는 `add-post-reposts`를 먼저 archive한 뒤 이
  change의 delta를 archive
- 외부 GraphQL schema, Repost·Notification read API, Fedify MessageQueue consumer와 production rollout은
  변경하지 않는다.
