## 1. PROD-708 Operation context 격리

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-708`

**Deliverable**

각 GraphQL operation이 request에서 검증된 인증 identity를 유지하면서 독립된 session snapshot, Pothos cache, DataLoader registry와 명시적 DB handle을 사용한다.

**Guardrails**

- 인증 SQL은 operation마다 반복하지 않는다.
- 같은 HTTP batch의 operation이 session 객체나 loader cache를 공유하지 않는다.
- 기존 resolver의 전역 DB 동작과 GraphQL schema를 바꾸지 않는다.

**Verification**

- operation context 단위 테스트에서 session, loader registry/cache와 DB handle 격리를 확인한다.
- 기존 API unit/type/schema 검증이 통과한다.

- [x] 1.1 request 인증 identity와 operation 실행 context 생성을 분리한다.
- [x] 1.2 명시적인 operation DB handle 타입과 operation별 session/cache/loader 격리를 구현한다.
- [x] 1.3 HTTP batching을 포함한 context 격리 회귀 테스트를 추가한다.

## 2. PROD-708 Query/Mutation transaction과 actor setting

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-708`

**Deliverable**

유효한 Query는 read-only, Mutation은 read-write operation transaction과 같은 transaction의 account/profile actor setting을 사용하며 Subscription은 장기 transaction을 열지 않는다.

**Guardrails**

- parse/validation 실패에는 transaction을 열지 않는다.
- `kosmo.account_id`와 `kosmo.profile_id`는 transaction 시작 시의 검증된 identity snapshot을 사용하고 transaction 밖으로 누출되지 않는다.
- Post SQL, RLS policy·grant, application predicate와 workload credential을 변경하지 않는다.

**Verification**

- 실제 PostgreSQL에서 Query/Mutation access mode와 actor setting을 확인한다.
- 익명, account-only, selected profile 및 pool connection 재사용 뒤 setting 누출이 없음을 확인한다.
- Subscription 경로가 primary transaction을 열지 않는지 확인한다.

- [x] 2.1 validation 이후 Query/Mutation execution을 operation DB transaction으로 감싸고 `ctx.db`를 같은 handle로 제공한다.
- [x] 2.2 transaction 시작 시 account/profile actor setting을 transaction-local로 설정한다.
- [x] 2.3 access mode, actor snapshot, pool 누출과 Subscription no-transaction 검증을 추가한다.

## 3. PROD-708 ExecutionResult와 AsyncIterable lifecycle

**Authority / Provenance**

- `PROD-708`

**Deliverable**

일반 결과와 AsyncIterable의 완료·오류·취소·abort에서 transaction commit/rollback과 connection 반환이 operation 소비 수명에 맞는다.

**Guardrails**

- 정상 반환된 `ExecutionResult.errors`를 새로운 sibling mutation 전체 rollback 계약으로 해석하지 않는다.
- AsyncIterable을 반환하자마자 transaction을 commit하거나 subscription stream 전체에 transaction을 유지하지 않는다.
- 기존 Yoga error 변환과 execution cancellation 동작을 보존한다.

**Verification**

- 일반 성공, field errors 정상 결과와 execute throw를 구분해 commit/rollback을 확인한다.
- AsyncIterable 정상 완료, source throw, consumer `return`/`throw`와 request abort에서 자원 해제를 확인한다.
- OpenSpec strict validation, API 정적 검증과 관련 integration test가 통과한다.

- [x] 3.1 일반 ExecutionResult가 transaction 완료 뒤 반환되도록 lifecycle을 구현한다.
- [x] 3.2 AsyncIterable의 정상 완료·오류·consumer 취소·abort를 transaction 수명과 연결한다.
- [x] 3.3 모든 lifecycle 경로의 회귀 테스트와 관련 정적·OpenSpec 검증을 통과시킨다.
