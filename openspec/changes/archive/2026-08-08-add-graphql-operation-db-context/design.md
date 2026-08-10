## Context

Hono middleware는 인증 identity와 request-level context를 만든다. Yoga는 HTTP batch item마다 context factory를 호출하므로, 여기서 operation별 session snapshot, Pothos cache와 DataLoader registry를 새로 만들 수 있다. 현재 resolver는 대부분 global `db`를 직접 사용하며 `ctx.db` 이전은 후속 이슈가 담당한다.

초기 PROD-708은 Query/Mutation을 operation-wide transaction으로 감싸는 dormant seam을 함께 구현했다. 이후 rollout은 CloudNativePG PgBouncer의 session pooling에서 operation별 client session을 열고 session-level actor GUC를 사용하는 구조로 정정됐다. 따라서 transaction seam은 후속 구현 기반이 아니라 제거 대상이다.

## Goals / Non-Goals

**Goals:**

- request 인증 identity를 operation마다 다시 조회하지 않는다.
- batch operation마다 session snapshot, Pothos/DataLoader cache와 DB handle을 분리한다.
- 현재 production resolver와 DB connection 동작을 그대로 유지한다.
- downstream SQL 이전이 명시적 `ctx.db`를 소비할 수 있게 한다.

**Non-Goals:**

- operation 전용 connection이나 operation-wide transaction을 열지 않는다.
- PostgreSQL actor GUC, PgBouncer, RLS policy/grant 또는 workload credential을 구현하지 않는다.
- Post 또는 다른 도메인의 SQL을 `ctx.db`로 이전하지 않는다.
- Subscription event DB session lifecycle을 정의하지 않는다.

## Implementation Guidance

request context는 검증된 session identity를 유지한다. Yoga context factory는 각 operation마다 그 identity를 얕은 snapshot으로 복사하고 새 Pothos cache와 DataLoader registry를 만든다. `ctx.db`는 기존 global DB handle을 기본값으로 사용한다.

request에서 만든 loader closure를 그대로 복사하면 내부 registry가 공유될 수 있으므로 operation factory가 새 registry를 캡처하는 loader closure를 만든다. 반면 인증 identity는 같은 request의 batch operation이 공유하는 값이므로 인증 SQL을 반복하지 않는다.

PROD-726은 모든 GraphQL DB consumer가 `ctx.db`로 정렬되고 PROD-728의 session pool이 준비된 뒤 operation별 PgBouncer client connection을 생성·종료한다. 기존 도메인 transaction은 그 connection 안에서 유지하되 operation 전체 transaction은 만들지 않는다.

## Risks / Trade-offs

- [operation마다 cache를 새로 만들어 같은 batch 안의 중복 조회를 합치지 못한다] → GraphQL operation은 독립 실행·오류·DB session 경계이므로 operation 내부 batching만 허용한다.
- [`ctx.db`가 아직 global handle이라 이 단계만으로 RLS actor context가 생기지 않는다] → 이 change는 additive seam만 배포하며 실제 session 활성화는 PROD-726이 소유한다.
- [미사용 transaction helper를 남기면 향후 잘못 재활성화할 수 있다] → helper와 전용 lifecycle tests를 제거하고 Linear/OpenSpec에서 session 구조만 후속 계약으로 유지한다.

## Migration Plan

1. operation context와 `ctx.db` seam을 유지한다.
2. dormant transaction plugin, actor setting과 AsyncIterable bridge를 제거한다.
3. context/cache 격리와 기존 API 회귀를 검증한다.
4. PROD-371은 Post SQL을 `ctx.db`로 이전하고, PROD-728은 session pool을 additive 배포한다.
5. PROD-726이 전체 consumer 정렬 뒤 operation DB session을 활성화한다.
