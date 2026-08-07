## Why

현재 GraphQL 인증 context와 DataLoader cache는 HTTP 요청 수명에서 파생되고 resolver는 전역 DB를 사용한다. 향후 RLS 정책이 actor setting과 실제 SQL을 같은 transaction에 묶을 수 있도록, 도메인 SQL이나 credential을 바꾸기 전에 operation 단위 실행 기반을 독립적으로 추가해야 한다.

## What Changes

- parse/validate가 끝난 각 Query와 Mutation에 독립된 primary DB transaction을 제공한다.
- Query transaction은 read-only, Mutation transaction은 read-write로 연다.
- 인증으로 파생한 account/profile identity를 transaction-local actor setting으로 설정하는 공통 seam과 명시적 `ctx.db`를 제공한다.
- HTTP batching의 각 operation이 transaction, Pothos context cache와 DataLoader cache를 공유하지 않게 한다.
- 일반 `ExecutionResult`와 `AsyncIterable`의 완료, 오류, 취소 및 request abort에서 transaction 수명을 닫는다.
- Subscription에는 장기 transaction을 열지 않고 operation context만 격리한다.
- 기존 resolver가 전역 DB를 계속 사용하는 동작과 GraphQL 응답 계약을 보존한다.
- Post/PostContent SQL 이전, RLS policy/grant, workload credential 전환과 `@defer` 활성화는 제외한다.

## Authority / Provenance

- Canonical: 도메인·UI 행동 변경 없음. 실행 계층 책임은 `docs/architecture/core-services.md`를 따른다.
- Linear Contract: PROD-708
- Linear Implementations: PROD-708. Downstream PROD-371은 이 change를 구현하지 않고 DB handle 소비만 담당한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `api-platform`: GraphQL operation별 DB transaction, actor context, cache 격리와 실행 결과 수명 계약을 추가한다.

## Impact

- `apps/api`: Yoga execution plugin, operation context 생성, context 타입과 lifecycle 테스트가 변경된다.
- `packages/core/db`: 기존 Drizzle DB/transaction 타입을 operation context가 재사용하며 schema나 credential은 변경하지 않는다.
- GraphQL public schema와 기존 resolver 결과에는 변경이 없다.
