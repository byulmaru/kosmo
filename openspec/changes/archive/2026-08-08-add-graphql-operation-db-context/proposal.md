## Why

GraphQL HTTP batching에서 인증 identity는 request에 속하지만 DataLoader cache와 이후 DB execution handle은 operation에 속한다. PROD-708의 최초 구현은 이 경계와 함께 operation-wide transaction seam까지 제공했으나, PgBouncer session pooling을 사용하기로 한 현재 rollout 계약에는 불필요하며 잘못된 transaction 의미와 lifecycle 복잡도를 남긴다.

## What Changes

- request에서 한 번 검증한 session/account/profile identity는 batch operation이 공유한다.
- 각 operation은 독립된 session snapshot, Pothos cache, DataLoader registry와 명시적 `ctx.db` handle을 가진다.
- PROD-708의 `ctx.db`는 기존 global DB handle을 가리키며 새 connection이나 transaction을 열지 않는다.
- operation-wide Query/Mutation transaction, transaction-local actor setting과 AsyncIterable transaction bridge를 제거한다.
- PgBouncer session pool은 PROD-728, 모든 DB consumer 이전과 operation별 client session 활성화는 PROD-726이 소유한다.
- Post SQL 이전, RLS policy/grant, workload credential과 PgBouncer 배포는 제외한다.

## Authority / Provenance

- Canonical: 도메인·UI 행동 변경 없음. 실행 계층 책임은 `docs/architecture/core-services.md`를 따른다.
- Linear Contract: PROD-708
- Linear Implementations: PROD-708. Downstream PROD-371은 Post DB handle 소비를, PROD-728은 PgBouncer session pool을, PROD-726은 전체 DB consumer 정렬과 operation DB session 활성화를 담당한다.

## Capabilities

### Modified Capabilities

- `api-platform`: GraphQL operation별 context/cache/DB handle 격리만 유지하고 operation transaction 계약을 제거한다.

## Impact

- `apps/api`: operation context 생성과 cache 격리 테스트를 유지하고 dormant transaction plugin과 lifecycle 테스트를 제거한다.
- GraphQL public schema, 기존 resolver SQL과 production DB connection 수에는 변경이 없다.
