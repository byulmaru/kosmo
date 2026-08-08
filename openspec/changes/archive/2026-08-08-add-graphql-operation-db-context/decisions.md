## Context

이 기록은 PROD-708의 정정된 operation context/DB handle 범위와 PgBouncer session-pooling 후속 구조를 반영한다.

## Decision Records

### 인증 identity는 request에, 실행 cache와 DB handle은 operation에 둔다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-708
- Status: Active
- Context / Problem: 같은 HTTP batch의 operation은 같은 인증 주체를 사용하지만 독립 실행 단위이므로 loader 결과와 이후 DB session 상태를 공유해서는 안 된다.
- Decision Outcome: request 단계에서 session/account/profile identity를 한 번 검증한다. Yoga context factory는 operation마다 session snapshot, Pothos cache, DataLoader registry와 명시적 `ctx.db`를 새로 만든다.
- Alternatives Considered: request context 전체를 공유하면 loader cache와 mutable session 선택이 sibling operation에 노출된다. 인증까지 operation마다 다시 조회하면 동일 request의 인증 SQL을 불필요하게 반복한다.
- Consequences: 같은 batch의 중복 DB 조회는 operation 사이에서 합쳐지지 않지만 각 operation의 실행 경계가 보존된다.
- Confirmation / Follow-up: 같은 batch의 두 operation이 다른 loader registry/session snapshot을 사용하고 인증 identity는 유지하는 테스트로 확인한다.

### PROD-708의 DB handle은 새 connection을 열지 않는 additive seam이다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: PROD-708, PROD-371
- Status: Active
- Context / Problem: 아직 global DB consumer가 남아 있고 operation session pool도 배포되지 않았으므로 이 change에서 connection lifecycle을 활성화할 수 없다.
- Decision Outcome: `ctx.db`는 기존 global DB handle을 기본값으로 제공한다. production Yoga는 operation connection이나 transaction wrapper를 등록하지 않는다.
- Alternatives Considered: selective connection 활성화는 한 operation의 nested resolver와 core service가 global DB를 사용하는지 안전하게 판별할 metadata가 없다.
- Consequences: 기존 resolver와 connection 동작을 보존하면서 PROD-371이 SQL을 명시적 handle로 이전할 수 있다.
- Confirmation / Follow-up: context 단위 테스트와 API 회귀 검증으로 확인한다.

### 실제 actor context는 PgBouncer operation session으로 활성화한다

- Decision Date: 2026-08-08
- Decision Class: Derived Contract
- Authority / Provenance: PROD-726, PROD-728
- Status: Active
- Context / Problem: operation-wide transaction은 GraphQL 실행 전체에 불필요한 transaction 의미와 AsyncIterable cleanup 복잡도를 만들며, global DB consumer와 함께 쓰면 pool 교착 위험이 있다.
- Decision Outcome: PROD-728이 CloudNativePG PgBouncer session pool을 additive 배포한다. PROD-726은 모든 DB consumer 정렬 뒤 Query/Mutation operation마다 하나의 client session을 열고 session-level actor GUC를 설정하며 완료·오류·abort에서 client를 종료한다.
- Alternatives Considered: transaction pooling은 session-level actor 상태를 operation 수명에 고정하지 못한다. request별 session 공유는 batch sibling operation의 독립 DB execution 경계를 잃는다.
- Consequences: 기존 도메인 transaction은 operation connection 안에서 유지하지만 operation 전체 transaction이나 sibling field 원자성은 생기지 않는다.
- Confirmation / Follow-up: PROD-728의 reset 검증과 PROD-726의 전체 consumer 인벤토리·동시성/session 누출 검증이 소유한다.

## Superseded Decisions

- `Query와 Mutation만 primary transaction으로 감싼다`: operation actor context를 PgBouncer client session으로 유지하기로 해 폐기한다.
- `transaction-local GraphQL actor context`: session-level actor GUC를 PROD-726에서 설정하므로 폐기한다.
- `AsyncIterable은 deferred transaction bridge로 소비 수명까지 유지한다`: operation-wide transaction 자체를 제거하므로 폐기한다.
- `GraphQL field error는 새 operation atomicity 신호로 해석하지 않는다`: operation transaction이 없어 별도 lifecycle 결정이 필요하지 않으며 기존 도메인 transaction 의미를 그대로 유지한다.
