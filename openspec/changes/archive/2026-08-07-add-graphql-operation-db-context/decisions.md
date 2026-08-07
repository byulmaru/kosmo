## Context

이 기록은 PROD-708의 additive GraphQL 실행 기반, `api-platform` delta spec과 현재 Yoga 5/Drizzle 구조를 반영한다. Post SQL 이전은 PROD-371, RLS policy/helper와 credential 전환은 별도 이슈가 소유한다.

## Decision Records

### 인증 context와 operation 실행 context를 분리한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-708
- Status: Active
- Context / Problem: HTTP request에서 인증과 loader registry를 함께 만들면 batch item이 같은 cache를 공유하고, actor setting과 resolver SQL을 operation transaction에 묶을 수 없다.
- Decision Outcome: Hono request 단계는 검증된 session identity만 만들고, Yoga가 parse/validate 뒤 operation마다 Pothos cache, DataLoader registry와 DB handle을 새로 만든다.
- Alternatives Considered: request context를 얕게 복사하면 loader closure가 원래 registry를 계속 캡처하므로 격리를 증명하지 못한다.
- Consequences: 인증 SQL은 batch마다 반복하지 않고, execution cache만 operation별로 분리된다.
- Confirmation / Follow-up: 같은 HTTP batch의 두 operation이 서로 다른 loader와 transaction을 관찰하는 테스트로 확인한다.

### Query와 Mutation만 primary transaction으로 감싼다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-708
- Status: Active
- Context / Problem: RLS actor setting은 실제 SQL과 같은 transaction에 있어야 하지만 subscription stream 전체에 connection을 고정할 수 없다.
- Decision Outcome: validation 이후 Query는 read-only, Mutation은 read-write primary transaction으로 감싸고 `ctx.db`에 같은 handle을 둔다. Subscription은 독립 context를 사용하되 primary transaction을 열지 않는다.
- Alternatives Considered: 모든 operation을 read-write로 열면 Query 의도를 DB에 강제하지 못하고, subscription을 감싸면 장기 connection 점유가 발생한다.
- Consequences: 모든 Query/Mutation에 transaction 비용이 추가되지만 schema/credential/기존 resolver SQL은 변하지 않는다.
- Confirmation / Follow-up: transaction access mode, parse/validation no-transaction과 subscription no-transaction을 검증한다.

### actor setting 이름과 operation-start snapshot을 고정한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-708
- Status: Active
- Context / Problem: 후속 policy와 SQL 이전이 재사용할 안정적인 setting seam이 필요하고, operation 중 session 객체가 변경되더라도 같은 transaction의 actor identity가 흔들리면 안 된다.
- Decision Outcome: transaction 시작 시 검증된 초기 identity를 `kosmo.account_id`, `kosmo.profile_id` transaction-local setting에 각각 설정한다. 값이 없으면 빈 문자열을 설정하며 operation 중 context 변경으로 다시 설정하지 않는다.
- Alternatives Considered: setting 자체를 후속 policy 이슈까지 미루면 PROD-708의 actor context 완료 기준을 충족하지 못한다. nullable/missing setting을 섞으면 pooled connection 누출과 익명 상태를 구분하기 어렵다.
- Consequences: 후속 RLS helper는 이 이름과 빈 값의 fail-closed 해석을 사용해야 한다. `selectProfile` 같은 mutation의 새 선택값은 다음 operation부터 actor snapshot에 반영된다.
- Confirmation / Follow-up: actor별 순차 operation과 transaction 밖 `current_setting(..., true)` 검증으로 누출이 없음을 확인한다.

### AsyncIterable은 deferred transaction bridge로 소비 수명까지 유지한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-708
- Status: Active
- Context / Problem: Drizzle transaction callback에서 iterator를 즉시 반환하면 stream 전에 commit되고, callback이 소비 완료를 기다린 뒤 iterator를 반환하면 교착된다.
- Decision Outcome: execute 결과 종류를 먼저 전달하는 deferred signal과 source iterator proxy를 사용한다. 일반 결과는 transaction 완료 뒤 반환하고, AsyncIterable callback은 proxy의 정상 종료까지 대기해 commit하며 오류·취소·abort에서는 reject해 rollback한다.
- Alternatives Considered: 전체 buffering은 incremental 수명과 backpressure를 깨뜨리고, iterator 즉시 반환은 transaction-local actor context를 보장하지 못한다.
- Consequences: iterator protocol의 `next`, `return`, `throw`와 abort cleanup을 모두 구현하고 독립 검증해야 한다.
- Confirmation / Follow-up: 정상 완료, source throw, consumer return/throw와 abort 각각에서 commit/rollback 및 connection 반환을 검증한다.

### GraphQL field error는 새 operation atomicity 신호로 해석하지 않는다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: PROD-708
- Status: Active
- Context / Problem: GraphQL execute는 field error를 throw하지 않고 `ExecutionResult.errors`로 정상 반환할 수 있다. 이를 자동 rollback하면 기존 부분 실행과 sibling mutation 동작이 바뀐다.
- Decision Outcome: execute 함수가 정상적으로 반환한 `ExecutionResult`는 errors 존재 여부와 무관하게 transaction callback의 정상 완료로 취급한다. throw와 stream 실패·취소·abort만 rollback 경로다.
- Alternatives Considered: `errors.length > 0` 전체 rollback은 PROD-708에서 금지한 sibling mutation atomicity 계약을 새로 만든다.
- Consequences: 도메인별 원자성은 기존 core transaction/savepoint와 후속 SQL 이전이 계속 소유한다.
- Confirmation / Follow-up: errors가 포함된 정상 result와 execute throw를 구분하는 lifecycle 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
