## Why

Post와 Post Content의 행 접근을 PostgreSQL RLS로 단계적으로 이전하려면, policy와 workload credential 전환보다
먼저 기존 owner 동작을 유지하는 table-level RLS 기반을 독립 배포해야 한다. PROD-737은 두 테이블의 RLS metadata와
후속 Post policy가 의존할 기존 join/index 경계를 준비한다.

## What Changes

- `post`와 `post_content`에 ROW LEVEL SECURITY를 활성화한다.
- Drizzle table 선언을 `.withRLS`로 표시하고 migration snapshot을 동기화한다.
- `FORCE ROW LEVEL SECURITY`, policy, grant 없이 기존 owner SELECT·DML을 보존하고 policy 없는 non-owner는
  fail-closed인지 확인한다.
- Post/Profile/Instance, Follow, Post Content/Post, Repost Source의 concrete join 경로를 기존 index로 지원할 수
  있는지 배포 전 PostgreSQL에서 일회성 검증한다. 증명되지 않은 speculative index는 추가하지 않는다.
- 빈 database 전체 migration replay와 RLS catalog 상태를 기존 generic smoke 경계에서 확인한다.
- actor setting/helper, API·system policy/grant, credential·endpoint·DB handle 전환, 애플리케이션 predicate 제거는
  별도 이슈로 남긴다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/instance.md`, `docs/domain/policies/post-list.md`, `memory/database-design.md`, `memory/database-migrations.md`, `docs/operations/production-migrations.md`
- Linear Contract: `PROD-737` (parent `PROD-368`, blocks `PROD-713`)
- Linear Implementations: `PROD-737`; actor setting/helper is separately owned by `PROD-370`

## Capabilities

### New Capabilities

- `post-rls-base`: owner-bypass를 유지하는 Post/Post Content RLS 활성화와 후속 policy join/index 기반 검증

### Modified Capabilities

없음.

## Impact

- `packages/core/db/tables.ts`의 Post/Post Content Drizzle schema 선언
- `drizzle/`의 additive migration과 snapshot
- 기존 generic migration replay
- PostgreSQL table metadata와 non-owner 접근 경계
- API, Fedify, credential, actor context helper 및 애플리케이션 조회 predicate에는 동작 변경 없음
