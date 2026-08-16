## Why

Local GraphQL과 ActivityPub 수신의 Post transaction은 이미 Post·PostContent·ActivityPub mapping과
동기 응답을 소유하지만, Reply Notification과 Local-origin Fedify 전달은 transaction savepoint 또는
process-local `postCommit` 호출로 흩어져 있다. 이 효과는 재시작과 일시적 외부 실패에서 재시도할 durable
실행 경계가 없고, API와 ActivityPub ingress가 서로 다른 후속 lifecycle을 갖는다.

PROD-722는 기존 core/request Post transaction을 유지하면서 실제 commit 뒤 stable Post ID로 하나의
post-commit effects Workflow를 시작한다. Workflow가 수락되면 Reply Notification과 Local-origin Fedify
queue handoff를 재시도하고, ActivityPub-origin Post에는 outbound echo를 만들지 않는다. commit과 Workflow
start 사이의 process 종료 또는 start 실패는 허용된 유실 경계로 남기며, 이미 성공한 caller 응답을 실패로
바꾸지 않는다.

## What Changes

- `temporal-post-create-effects`를 추가한다. Local GraphQL과 verified ActivityPub Create의 기존 Post transaction이 실제 commit된 뒤 결과 Post ID에서 stable Workflow ID를 파생해 effects Workflow start를 시도한다.
- Post·PostContent·Author/Parent 관계·필요한 ActivityPub mapping 저장과 actor/profile/instance/permission/visibility/content/media 검증은 기존 core/request transaction에 남긴다. Temporal transaction Activity나 preallocated Post ID를 추가하지 않는다.
- Post transaction rollback에서는 effects Workflow를 시작하지 않는다. commit 뒤 process 종료, Temporal 연결 오류 또는 Workflow start 실패로 effects가 유실될 수 있지만, committed Post와 기존 GraphQL/ActivityPub 성공·acknowledgement 결과는 유지한다.
- accepted effects Workflow는 stable Post ID를 사용해 Reply Notification을 기존 recipient/self/visibility/uniqueness 정책으로 멱등 재시도하고, `origin: LOCAL`인 Post만 기존 canonical ActivityPub Create를 Fedify PostgreSQL MessageQueue producer에 handoff한다. `origin: ACTIVITYPUB`인 Post는 outbound echo를 만들지 않는다.
- Reply Notification transaction savepoint와 Post Create의 process-local direct Fedify effect를 제거하고, API/Fedify handler가 후속 효과를 직접 조립하지 않도록 공통 post-commit start 경계로 통합한다. 다른 domain의 `postCommit` lifecycle은 이 change에서 변경하지 않는다.
- Workflow start 실패를 보완하기 위한 command receipt table, transaction outbox/relay, 별도 delivery history 또는 cross-request exactly-once를 추가하지 않는다.
- 첫 business Workflow/Activity가 Worker registration을 소유한다. process당 하나의 registration과 Worker host만 두고, 빈 registration·idle polling·중복 startup API를 정상 경로로 허용하지 않는다. readiness, signal과 graceful drain은 Worker host가 한 번만 소유한다.
- Worker는 별도 `worker.enabled` 선택 없이 application release에 함께 배포되며, 첫 registration이 실제 RUNNING·readiness·restart 복구·drain을 dev에서 검증한다.
- Effects Activity는 platform이 공급하는 기존 process 기본 `db`와 표준 PG 환경변수 경계를 소비한다. DB principal·Secret·credential source·RLS를 선택하거나 별도 connection을 만들지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Existing specifications: `openspec/specs/post/spec.md`, `openspec/specs/notification/spec.md`, `openspec/specs/activitypub-local-post-delivery/spec.md`, `openspec/specs/temporal-worker-runtime-foundation/spec.md`
- Linear Contract: `PROD-722`
- Linear Implementations: `PROD-722`
- Dependency boundary: `PROD-730`의 독립 Worker runtime을 확장하고, `PROD-448` MessageQueue consumer 내부는 변경하지 않는다. DB role·Secret·ACL·credential source 선택과 RLS 취소 정리는 이 change의 dependency가 아니며 별도 소유자가 담당한다.

## Capabilities

### New Capabilities

- `temporal-post-create-effects`: 실제 commit된 Post ID에서 시작해 Reply Notification과 Local-origin Fedify queue handoff를 재시도하는 post-commit effects Workflow

### Modified Capabilities

- `temporal-worker-runtime-foundation`: 첫 business registration을 실제 Worker host에 연결하고, 빈/선택적 registration 없이 singleton lifecycle·readiness·restart·drain과 배포 계약을 확정한다.
- `notification`: Reply Notification 생성을 Post transaction savepoint에서 accepted post-commit effects Workflow의 멱등 효과로 이동한다.
- `activitypub-local-post-delivery`: root Post와 Reply의 Local Create를 post-commit effects Workflow에서 전달하고, `origin`에 따른 Local delivery와 ActivityPub echo suppression을 적용한다.

## Impact

- `packages/core/services`: 기존 Post transaction commit 결과에서 stable Post ID effects Workflow start를 시도하고, Post Create의 Notification savepoint/direct effect를 제거한다.
- `apps/api`, `packages/fedify`: 기존 Local·ActivityPub transaction과 acknowledgement를 유지하면서 공통 post-commit start 경계를 사용한다.
- `apps/worker`: Effects Workflow/Activity registration, singleton Worker host, health·signal·drain lifecycle
- `apps/helm`: `worker.enabled` 없는 Worker component, Temporal endpoint·probe와 dev readiness/restart/drain 검증 wiring
- 외부 GraphQL schema와 기존 Notification read API는 변경하지 않는다. Post transaction 결과와 caller 성공/acknowledgement 의미는 보존한다.

## Out of Scope

- PostgreSQL role, SCRAM Secret, object ACL, credential source provisioning/transition(PROD-369/724/715) 및 RLS policy·migration·cleanup
- `OPERATION_DATABASE_URL` 기반 GraphQL operation session, 별도 Worker application pool/handle, `WORKER_DATABASE_*` seam 또는 Fedify request DB context
- Temporal Post Create transaction Activity, command receipt table, proposed Post ID, transactional outbox/relay, custom delivery history
- Temporal Post Delete, Repost, Reaction, Follow, Profile 등 다른 business domain과 Temporal MessageQueue consumer/remote HTTP retry 내부
- cross-request client retry의 exactly-once 보장, Notification API/UI 변경
- production sync/apply/cutover/live verification 또는 production rollout. 실제 운영 변경은 별도 사용자 승인이 필요하다.
