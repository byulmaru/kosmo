## Context

이 기록은 PROD-726의 확정 실행 경계, 기존 core transaction 계약, 배포된 PgBouncer session pool과 PROD-370 actor helper를 실제 GraphQL Query/Mutation lifecycle로 결합할 때 여러 구현 slice가 공유해야 하는 선택을 정리한다. 제품·도메인 결과는 바꾸지 않고 connection owner, session state, Yoga execution 수명과 workload endpoint 경계를 고정한다.

## Decision Records

### API workload만 Pooler endpoint로 전환한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726, Linear PROD-728, Linear PROD-716
- Status: Active
- Context / Problem: 기존 Pooler는 direct Service와 독립적으로 배포됐고 API/Web/worker/migration은 같은 direct URL 경계를 사용한다. operation session을 활성화하면서 credential transition이나 다른 workload traffic까지 결합하면 rollback 단위가 커진다.
- Decision Outcome: GraphQL API workload만 `<release>-postgres-pooler-rw`를 사용한다. Web BFF, worker와 migration은 `<release>-postgres-rw`를 유지하고 모든 Secret 참조는 그대로 둔다.
- Alternatives Considered: API/Web 전체를 동시에 전환하면 Web에 operation lifecycle이 없고 rollback이 결합된다. Pooler 준비만 유지하면 PROD-726 runtime을 활성화할 수 없다.
- Consequences: Helm은 API endpoint와 API-role credential selector를 구분해 렌더해야 한다. PROD-716은 후속 non-owner credential 전환 시 workload별 endpoint/credential 조합을 이어서 소유한다.
- Confirmation / Follow-up: dev/prod Helm render와 live Rollout env에서 API host, Web/worker/migration host와 Secret ref를 비민감하게 확인한다.

### operation마다 실제 PgBouncer frontend connection을 만들고 종료한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726
- Status: Active
- Context / Problem: postgres.js global pool의 lease를 반환하면 application frontend connection이 operation 사이에 유지되어 client disconnect를 기준으로 한 PgBouncer `DISCARD ALL` reset을 증명할 수 없다.
- Decision Outcome: 각 Query/Mutation은 `max: 1`인 별도 postgres.js client owner로 실제 frontend connection을 만들고 operation 종료 후 client를 종료한다. operation 사이에 client나 lease를 재사용하지 않는다.
- Alternatives Considered: global pool `reserve()`는 frontend connection을 닫지 않는다. operation별 transaction과 transaction pooling은 sibling atomicity와 기존 결정 경계를 바꾼다.
- Consequences: connection churn과 handshake latency가 늘지만 session reset 경계가 단순하고 관찰 가능하다. 기존 domain transaction은 per-operation Database 안에서 계속 사용한다.
- Confirmation / Follow-up: frontend connection identity, backend affinity, close 횟수, PgBouncer client metrics와 same-backend reset을 검증한다.

### 두 actor GUC를 모든 operation에서 명시하고 helper는 일회성 검증한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-370, Linear PROD-726
- Status: Active
- Context / Problem: actor가 없는 setting을 생략하면 missing 상태와 재사용 backend의 이전 session state를 구분하기 어렵다. 반대로 방금 성공한 setting을 public helper로 매번 다시 읽으면 operation마다 추가 round trip이 생긴다.
- Decision Outcome: Account/Profile setting을 매 operation 모두 session-level로 설정한다. 값이 있으면 UUID, 없으면 빈 문자열을 쓰고 setting SQL 실패 시 operation을 중단한다. Public helper의 UUID/`NULL` 의미는 integration test와 dev live gate에서 일회성 검증하며 runtime read-back은 하지 않는다.
- Alternatives Considered: 존재하는 actor만 설정하면 이전 state 방어가 불완전하다. 매 operation helper read-back은 이미 성공한 setting을 중복 확인하고 runtime을 helper 구현에 불필요하게 결합한다.
- Consequences: 익명, Account-only, Account+Profile operation이 동일한 설정 경로를 사용하고 정상 operation에는 추가 read-back SQL이 없다.
- Confirmation / Follow-up: 세 identity matrix와 helper 의미를 PostgreSQL integration 및 live probe로 확인하고 runtime query inventory에 read-back SQL이 없음을 확인한다.

### 현재 일반 Query/Mutation 결과만 session lifecycle로 소유한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: Linear PROD-726
- Status: Active
- Context / Problem: 현재 저장소와 production runtime에는 `@defer`, `@stream` 또는 incremental executor가 없다. 이를 선제 지원하려면 custom AsyncIterator cleanup과 사용되지 않는 cancellation 분기를 추가해야 한다.
- Decision Outcome: 일반 Query/Mutation `ExecutionResult`만 operation session lifecycle로 소유하고 execute 완료·오류·abort의 `finally`에서 close를 await한다. Query/Mutation incremental execution과 Subscription은 제외한다.
- Alternatives Considered: incremental result 종료까지 connection을 유지하는 wrapper는 미래 기능을 미리 구현하는 비용이 크다. 최초 payload 뒤 close는 향후 incremental 기능을 올바르게 지원하지 못하므로 실제 도입 시 별도 계약으로 설계한다.
- Consequences: 현재 behavior를 모두 보존하면서 iterator bridge와 그 테스트를 제거한다. 향후 incremental executor를 활성화할 때 connection lifecycle을 다시 결정해야 한다.
- Confirmation / Follow-up: repository에 incremental executor/directive가 없음을 확인하고 일반 result, GraphQL 오류, execution throw와 abort에서 close가 정확히 한 번 완료되는지 검증한다.

### execute wrapper의 finally가 connection cleanup을 소유한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, Linear PROD-726
- Status: Active
- Context / Problem: connection은 각 HTTP request가 아니라 batch 안의 각 Query/Mutation operation이 소유해야 하며 execute 오류에서도 비동기 close 완료를 기다려야 한다.
- Decision Outcome: Yoga execution hook이 일반 Query/Mutation client를 초기화하고 context를 확장한 뒤 execute function을 `try/finally`로 감싼다. `finally`에서 idempotent close를 await한다. AsyncIterable wrapper는 만들지 않는다.
- Alternatives Considered: transport handler 전체를 감싸면 HTTP batch operation별 lifecycle을 분리하기 어렵다. `onExecuteDone` callback만 사용하면 execute throw 경계를 함께 소유하기 어렵다.
- Consequences: lifecycle code가 일반 execution 경로로 제한되고 batch operation별 owner가 명확해진다.
- Confirmation / Follow-up: installed Yoga/Envelop behavior를 대상으로 정상 result, GraphQL 오류, throw, abort와 batch unit/integration test를 유지한다.

### overload는 postgres.js connect timeout으로 제한한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726
- Status: Active
- Context / Problem: operation별 client가 동시에 몰릴 때 별도 semaphore나 retry queue를 추가하면 application 내부에 PgBouncer와 중복되는 대기·공정성·shutdown 상태가 생긴다.
- Decision Outcome: postgres.js의 bounded connect timeout만 사용한다. 제한 시간 안에 frontend connection을 만들지 못하면 operation을 실패시키고 custom semaphore, retry loop 또는 queue를 추가하지 않는다.
- Alternatives Considered: application semaphore는 PgBouncer capacity와 이중 조정이 필요하다. 무제한 대기는 request와 connection leak을 장기화한다.
- Consequences: 순간 overload 일부는 오류로 노출되며 timeout 값은 실제 dev 부하와 metrics로 검증해야 한다.
- Confirmation / Follow-up: capacity 안의 completion, 초과 부하 timeout, `cl_waiting`/`maxwait`와 종료 뒤 connection baseline 복귀를 확인한다.

### API endpoint rollback만으로 application activation을 되돌린다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726, Linear PROD-728
- Status: Active
- Context / Problem: activation 실패 시 Pooler, Cluster 또는 Web/migration traffic을 out-of-band 수정하면 GitOps ownership과 독립 배포 경계를 깨뜨린다.
- Decision Outcome: 실패 시 Git revert로 API endpoint만 direct Service로 되돌린다. operation code가 direct PostgreSQL connection을 열더라도 physical connection 종료가 session state를 폐기하므로 안전한 rollback 경계가 된다. Pooler, Cluster, Web/worker/migration과 Secret은 유지한다.
- Alternatives Considered: Pooler 삭제는 별도 PROD-728 resource lifecycle이고 다른 검증을 방해한다. credential 변경은 PROD-716 범위다.
- Consequences: code와 endpoint rollback을 같은 revert로 수행할 수 있고 database migration/data rollback은 없다.
- Confirmation / Follow-up: rollback render와 dev rollout에서 API direct host, 나머지 workload 불변, GraphQL smoke를 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
