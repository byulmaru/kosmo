## Why

현재 GraphQL 인증 context와 DataLoader cache는 HTTP 요청 수명에서 파생되고 resolver는 전역 DB를 사용한다. 향후 RLS 정책이 actor setting과 실제 SQL을 같은 transaction에 묶을 수 있도록 operation 단위 context와 transaction seam을 먼저 추가하되, 전역 DB consumer가 남은 동안 production transaction wrapper가 pool connection을 선점해서는 안 된다.

## What Changes

- Query read-only, Mutation read-write transaction을 여는 재사용 가능한 실행 seam을 제공하고 lifecycle을 검증한다.
- 인증으로 파생한 account/profile identity를 transaction-local actor setting으로 설정하는 공통 seam과 명시적 `ctx.db`를 제공한다.
- HTTP batching의 각 operation이 transaction, Pothos context cache와 DataLoader cache를 공유하지 않게 한다.
- 일반 `ExecutionResult`와 `AsyncIterable`의 완료, 오류, 취소 및 request abort에서 transaction 수명을 닫는다.
- Subscription에는 장기 transaction을 열지 않고 operation context만 격리한다.
- 기존 resolver가 전역 DB를 계속 사용하는 동작과 GraphQL 응답 계약을 보존한다.
- 모든 GraphQL DB consumer가 정렬될 때까지 production Yoga에는 transaction wrapper를 등록하지 않는다.
- Post/PostContent SQL 이전, RLS policy/grant, workload credential 전환과 `@defer` 활성화는 제외한다.

## Authority / Provenance

- Canonical: 도메인·UI 행동 변경 없음. 실행 계층 책임은 `docs/architecture/core-services.md`를 따른다.
- Linear Contract: PROD-708
- Linear Implementations: PROD-708. Downstream PROD-371은 Post DB handle 소비를, PROD-726은 전체 DB consumer 정렬과 production wrapper 활성화를 담당한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `api-platform`: GraphQL operation별 context/cache 격리, transaction·actor seam, production 활성화 guard를 추가한다.

## Impact

- `apps/api`: Yoga execution plugin, operation context 생성, context 타입과 lifecycle 테스트가 변경된다.
- `packages/core/db`: 기존 Drizzle DB/transaction 타입을 operation context가 재사용하며 schema나 credential은 변경하지 않는다.
- GraphQL public schema와 기존 resolver 결과에는 변경이 없다.
