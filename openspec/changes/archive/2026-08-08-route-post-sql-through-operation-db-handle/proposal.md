## Why

PROD-708이 각 GraphQL operation에 명시적 `ctx.db` seam을 추가했지만, 현재 Post/PostContent API SQL은 여전히 전역 DB handle을 직접 사용한다. 후속 PROD-726이 operation별 DB session을 안전하게 활성화하려면 먼저 Post 도메인의 모든 resolver, loader와 core action이 같은 operation handle을 소비하도록 행동 변화 없이 정렬되어야 한다.

## What Changes

- production GraphQL의 모든 Post/PostContent 조회·변경 SQL에 `ctx.db`를 전달한다.
- Post가 호출하는 core service와 savepoint가 전달받은 `DatabaseHandle` 안에서 기존 transaction 의미를 유지하도록 정렬한다.
- 정적 검증과 회귀 테스트로 Post SQL 경로의 전역 DB fallback을 차단한다.
- 기존 owner credential, 권한 predicate, 목록·제품 행동과 GraphQL 응답을 그대로 유지한다.
- PgBouncer endpoint, operation DB session, actor GUC, RLS policy·grant와 credential은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`, `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`
- Linear Contract: PROD-368
- Linear Implementations: PROD-371. 선행 PROD-708은 operation context/handle seam을 완료했으며, 후속 PROD-726은 전체 GraphQL consumer 정렬과 operation DB session 활성화를, PROD-716은 credential 전환을 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `api-platform`: production GraphQL Post/PostContent SQL이 operation별 `ctx.db` handle을 사용하고 전역 DB fallback을 갖지 않도록 실행 계약을 확장한다.

## Impact

- `apps/api/src/graphql/resolvers`의 Post/PostContent loader, field, query, mutation 및 Post를 투영하는 bookmark/reaction/notification 경로
- `packages/core/services`의 Post 생성·삭제·repost와 관련 notification/savepoint action
- API integration/unit test와 Post SQL handle 정적 인벤토리 검증
- database schema, migration, GraphQL schema, application endpoint와 Kubernetes resource에는 영향 없음
