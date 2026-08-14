## Why

GraphQL Follow Request Node, incoming/outgoing connection과 승인·거절·취소 경로는 애플리케이션 predicate만으로 participant 권한을 판정한다. PROD-770은 `kosmo_api` non-owner principal에서 현재 selected Profile 외 관계를 PostgreSQL RLS로 차단하면서 기존 pending lifecycle과 command 방향을 보존한다.

## What Changes

- `profile_follow_request`에 RLS를 활성화하고 FORCE RLS는 비활성 상태로 유지한다.
- `kosmo_api`의 SELECT는 현재 selected Profile이 follower 또는 followee인 participant row로 제한한다.
- follower-only INSERT와 participant DELETE policy를 SELECT policy와 분리하고 UPDATE는 닫아 둔다. 승인·거절은 followee만, 취소는 follower만 수행하는 기존 application command 검사를 유지한다.
- missing, empty, malformed actor context와 Account의 다른 membership Profile은 권한을 얻지 못한다.
- 기존 Node/loader/connection과 GraphQL mutation의 애플리케이션 권한 predicate를 유지해 additive RLS parity를 검증한다.
- row 존재 자체가 pending인 lifecycle, 승인 시 established `profile_follow` 생성, 승인·거절·취소 시 Follow Request Notification 제거, 승인 시 Follow Notification 생성 side effect를 보존한다.
- `kosmo_worker` BYPASSRLS와 ActivityPub/trusted ingress, owner/migration 경계를 유지하며 Worker policy를 만들지 않는다.
- established `profile_follow`, Notification과 다른 table의 RLS·ACL·credential·session lifecycle은 변경하지 않는다.
- 파일별 migration behavior test는 추가하지 않고 GraphQL observable contract, generic migration replay와 정확한 비운영 `kosmo_api` role matrix로 검증한다.
- production preflight, sync/apply, principal cutover와 post-apply live 검증은 별도 명시 승인 전 수행하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `memory/database-migrations.md`
- Linear Contract: PROD-770
- Linear Implementations: PROD-770
- Upstream: PROD-707 inventory, PROD-370 actor helper, PROD-724 runtime object ACL, PROD-726 GraphQL operation session
- Related reference slice: PROD-713
- Downstream: PROD-767 GraphQL RLS coverage·cross-domain Notification 분류 gate, PROD-716 credential cutover

## Capabilities

### New Capabilities

- `profile-follow-request-row-level-security`: GraphQL `kosmo_api`의 selected Profile participant 조회와 followee/follower command 방향을 강제하는 `profile_follow_request` RLS contract를 정의한다.

### Modified Capabilities

- `profile`: pending Follow Request mutation의 nonparticipant/absent `NOT_FOUND`와 wrong-role participant `PERMISSION_DENIED` 오류 경계를 명시한다.

## Impact

- `packages/core/db/tables.ts`의 `ProfileFollowRequests` RLS metadata
- 새 additive Drizzle migration과 snapshot의 table RLS 및 `kosmo_api` policy DDL
- ProfileFollowRequest GraphQL Node/loader, incoming/outgoing connection, 승인·거절·취소 integration 회귀 검증
- core Follow Request pending lifecycle과 selected recipient의 Notification side effect 회귀 검증
- generic blank migration replay와 정확한 비운영 revision의 `kosmo_api`/`kosmo_worker` role-level matrix
- GraphQL schema shape, established `profile_follow`, 다른 table policy, credential selector, production sync/apply와 actual principal cutover에는 변화가 없다.
- Account membership 기반 cross-profile Notification 표시 parity는 PROD-767 coverage gate에서 별도 분류하며 이 change 단독 완료 증거로 삼지 않는다.
