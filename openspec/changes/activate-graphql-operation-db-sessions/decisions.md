## Context

이 기록은 PROD-726의 확정 실행 경계, 기존 core transaction 계약, 배포된 PgBouncer session pool과 PROD-370 actor helper를 실제 GraphQL Query/Mutation lifecycle로 결합할 때 여러 구현 slice가 공유해야 하는 선택을 정리한다. 제품·도메인 결과는 바꾸지 않고 connection owner, session state, Yoga execution 수명과 workload endpoint 경계를 고정한다.

## Decision Records

### API workload만 Pooler endpoint로 전환한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726, Linear PROD-728, Linear PROD-716
- Status: Active
- Context / Problem: 기존 Pooler는 direct Service와 독립적으로 배포됐고 API/Web BFF/migration은 각자의 기존 owner-compatible direct 경계를 사용한다. PR #564(merge `2c65b6dc`)는 Web trusted federation ingress와 Temporal Worker를 위한 선택적 `WORKER_DATABASE_*` SCRAM seam을 추가했지만, 이 seam은 GraphQL operation에 공급해서는 안 된다. operation session만 Pooler로 보내야 request authentication과 다른 workload traffic이 결합되지 않고 rollback 단위가 작다.
- Decision Outcome: API `DATABASE_URL`은 현재 owner-compatible fallback인 `<release>-postgres-rw` direct Service를 유지하고 향후 API/Web principal 방향은 결정하지 않으며, GraphQL operation 전용 `OPERATION_DATABASE_URL`만 `<release>-postgres-pooler-rw:5432`를 사용한다. `postgres.credentials.api` trio가 구성된 경우에도 rendered env의 username, database와 password Secret source, scheme, path와 query는 현재 전환에서 재사용하고 operation URL의 host와 port를 포함한 authority만 in-chart Pooler Service `:5432`로 교체한다. Runtime operation client는 configured URL을 변경 없이 사용하며 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않는다. Web BFF baseline과 migration direct endpoint는 이 change에서 유지한다. #564의 CloudNativePG PgBouncer TLS/Vault/VSO static SCRAM 기반 `WORKER_DATABASE_*` seam은 별도 실행 경계로 제외하고 `OPERATION_DATABASE_URL`에 공급하지 않는다. API/Web principal transition은 PROD-716이 소유하며, 취소된 client-certificate/direct-rw 대안 PROD-470은 재개하지 않는다.
- Alternatives Considered: API `DATABASE_URL` 자체를 Pooler로 바꾸면 request authentication·startup까지 operation endpoint와 결합된다. API/Web 전체를 동시에 전환하면 Web에 operation lifecycle이 없고 rollback이 결합된다.
- Consequences: Helm은 API current fallback direct endpoint와 operation Pooler endpoint를 별도 env로 렌더해야 하며, configured trio에서도 새 credential selector 없이 authority(host와 port)만 `<release>-postgres-pooler-rw:5432`로 교체하고 username/database/password Secret source와 path/query는 현재 전환에서 보존해야 한다. Runtime은 configured operation URL을 변경 없이 operation client에 전달하고 #564 Worker seam은 이 operation lifecycle과 분리한다. Web BFF baseline과 migration direct endpoint는 유지하며 API/Web principal transition은 PROD-716이 소유한다. 호환되지 않는 configured URL을 runtime이 자동 보정한다는 계약은 없다.
- Confirmation / Follow-up: dev/prod Helm render와 live Rollout env에서 API current fallback `DATABASE_URL`, `OPERATION_DATABASE_URL`, Web BFF/migration host와 Secret ref를 비민감하게 확인하고 `WORKER_DATABASE_*`가 operation URL에 공급되지 않음을 정적으로 확인한다.

### Pooler operation startup parameter 호환성과 actor 초기화를 분리한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract / Incident Follow-up
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726, dev merge revision `de6034d3`
- Status: Active
- Context / Problem: `de6034d3` dev activation에서 operation postgres.js client가 API direct DB client의 `connection` startup options를 상속했고, PgBouncer가 지원하지 않는 옵션을 전달해 operation 초기화가 거부됐다. Argo/Rollout readiness는 통과했지만 GraphQL Query/Mutation이 초기화 단계에서 HTTP 500으로 실패했다. 어떤 timeout 숫자도 이 change의 계약으로 결정된 적이 없다.
- Decision Outcome: API `DATABASE_URL` direct client의 기존 timeout startup 동작은 변경하지 않으며 이 change의 범위 밖으로 둔다. Fix는 operation client 생성 시 direct DB client의 `connection` startup options를 전달하지 않는 것이다. Configured `OPERATION_DATABASE_URL`은 변경 없이 client에 전달하며 runtime은 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정하지 않는다. 실제 frontend connection을 만든 뒤 actor GUC만 하나의 initialization SQL round trip에서 session-level로 설정하고, 이 SQL이 성공하기 전에는 resolver를 실행하지 않는다. 연결 대기는 별도 숫자를 선택하지 않고 postgres.js의 기본 bounded connection timeout 동작에 맡긴다. endpoint, credential/Secret selector, Pooler CR·replica·resource·capacity는 변경하지 않는다.
- Alternatives Considered: 전체 activation merge revision을 즉시 revert하는 선택은 사용자 결정으로 보류하고 forward fix를 선택했다. direct DB client의 `connection` startup options를 operation client에 계속 전달하는 방식은 PgBouncer 호환성을 깨뜨린다. Configured URL을 runtime에서 조용히 정제하는 방식은 명시된 입력을 바꾸고 호환되지 않는 임의의 URL을 지원하는 것처럼 보이므로 채택하지 않는다. Actor GUC를 여러 SQL round trip 또는 resolver 이후에 설정하면 초기화 원자성과 resolver 전제 조건을 약화한다.
- Consequences: direct request/auth/startup workload와 operation Pooler lifecycle의 endpoint와 startup-parameter 경계가 분리된다. operation startup compatibility와 GraphQL smoke가 통과하기 전에는 live gate를 닫을 수 없으며, 실패 시 기존 whole-activation Git revert 절차를 fallback으로 유지한다. application-selected timeout 숫자는 추가하지 않는다.
- Confirmation / Follow-up: current API Pod 로그에 unsupported startup-parameter 오류가 없고 익명·Account-only·Account+Profile GraphQL smoke가 HTTP 500 없이 통과하는지 비민감한 상태로 기록한다. 이후 affinity, reset, metrics/capacity와 4.3/4.4/4.5 live gate를 별도로 검증한다.

### GraphQL user-data SQL은 operation `ctx.db`를 사용하고 trusted materialization만 direct 예외로 둔다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, Linear PROD-726
- Status: Active
- Context / Problem: RLS 적용 대상은 GraphQL user-data query와 그 결과 projection 및 domain action이다. Mutation nested result가 global DB를 사용하거나 원격 actor materialization을 operation session으로 억지로 감싸면 각각 결과 visibility와 Fedify 소유 lifecycle이 깨진다.
- Decision Outcome: GraphQL Query/Mutation의 resolver·loader·core domain action SQL은 operation `ctx.db`를 사용하고 Mutation nested result resolver도 같은 handle을 사용한다. request authentication/startup SQL은 API `DATABASE_URL` direct를 유지한다. 인증된 `searchProfiles`가 촉발하는 Fedify-owned remote actor materialization은 trusted direct side effect 예외로 허용하되, materialization 뒤 최종 GraphQL query/result projection은 `ctx.db`에서 실행한다. Fedify, Temporal Workflow/Activity와 worker는 GraphQL RLS 범위에서 제외한다.
- Alternatives Considered: Query root만 operation DB로 두면 Mutation payload 결과가 RLS 밖으로 빠진다. Fedify materialization까지 GraphQL operation DB에 넣으면 protocol-owned side effect와 GraphQL RLS lifecycle이 결합된다.
- Consequences: production GraphQL call graph에 global/raw DB fallback을 남기지 않으며, materialization 예외는 `searchProfiles`의 trusted side effect 단계로 한정한다. RLS policy·grant와 credential 전환은 이 change에서 수행하지 않는다.
- Confirmation / Follow-up: domain별 static/integration 검증과 dev live gate에서 nested result, materialization 후 최종 query와 operation handle을 확인한다. PROD-716은 API/Web principal credential source/cutover를 소유하고, Role/Secret provisioning, grant와 RLS policy는 각각의 별도 issue 경계로 남긴다.

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
- Decision Outcome: Account/Profile setting을 매 operation 모두 같은 initialization SQL round trip에서 session-level로 설정한다. 값이 있으면 actor UUID, 없으면 빈 문자열을 쓰고 setting SQL 실패 시 operation을 중단한다. Public helper의 UUID/`NULL` 의미는 integration test와 dev live gate에서 일회성 검증하며 runtime read-back은 하지 않는다.
- Alternatives Considered: 존재하는 actor만 설정하면 이전 state 방어가 불완전하다. 매 operation helper read-back은 이미 성공한 setting을 중복 확인하고 runtime을 helper 구현에 불필요하게 결합한다.
- Consequences: 익명, Account-only, Account+Profile operation이 동일한 actor 설정 경로를 사용하고 정상 operation에는 추가 read-back SQL이 없다. Direct client의 기존 startup timeout 동작은 이 operation 경계와 분리되어 유지된다.
- Confirmation / Follow-up: 세 identity matrix와 helper 의미, Pooler startup compatibility와 GraphQL smoke를 PostgreSQL integration 및 live probe로 확인하고 runtime query inventory에 read-back SQL이 없음을 확인한다.

### selectProfile actor 전환은 같은 operation session에서 반영한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, Linear PROD-726
- Status: Active
- Context / Problem: `selectProfile` Mutation은 `Sessions.activeProfileId`와 in-memory `ctx.session.profileId`를 바꾸므로, 같은 operation에서 뒤따르는 top-level Mutation field가 이전 session-level `kosmo.profile_id`를 보면 serial sibling의 actor GUC와 RLS visibility가 stale 상태가 된다.
- Decision Outcome: `selectProfile`은 자신이 소유하는 새 action-local narrow transaction을 같은 operation `ctx.db`에서 열어 `Sessions.activeProfileId`를 저장하고 session-level `kosmo.profile_id`를 selected Profile UUID로 갱신한다. transaction이 성공한 뒤 `ctx.session.profileId`도 갱신해 다음 top-level Mutation field가 같은 operation Database와 새 Profile actor를 사용하게 한다. `kosmo.account_id`는 변경하지 않으며 operation-wide transaction은 추가하지 않는다. 이 결정은 serial sibling의 stale GUC 전환만 다루고 authorization concurrency, locking 또는 TOCTOU safety를 보장하지 않는다.
- Alternatives Considered: `ctx.session.profileId`만 갱신하면 SQL의 actor setting이 stale 상태로 남는다. 별도 connection에서 setting을 바꾸면 operation session affinity를 깨뜨리고, operation-wide transaction은 sibling Mutation field의 기존 serial 경계를 불필요하게 결합한다. authorization concurrency나 TOCTOU를 해결하는 별도 locking은 이 change 범위가 아니다.
- Consequences: selectProfile 이후 같은 operation에서 실행되는 Mutation field는 새 Profile actor를 즉시 관찰할 수 있고, 새 action-local narrow transaction과 operation session lifecycle은 유지된다. 동시 authorization 판단이나 lock 경계는 기존 계약에 남는다.
- Confirmation / Follow-up: selectProfile 뒤 다음 top-level Mutation field가 `ctx.session.profileId`와 `public.kosmo_current_profile_id()`에서 새 Profile을 관찰하고, Account GUC가 unchanged이며 action-local transaction만 사용되는 regression test를 확인한다. 이 검증은 authorization concurrency/TOCTOU 증거가 아니다.

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

### overload는 postgres.js 기본 bounded connection 동작으로 제한한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726
- Status: Active
- Context / Problem: operation별 client가 동시에 몰릴 때 별도 semaphore나 retry queue를 추가하면 application 내부에 PgBouncer와 중복되는 대기·공정성·shutdown 상태가 생긴다.
- Decision Outcome: postgres.js의 기본 bounded connection timeout 동작만 사용한다. 기본 동작의 제한 시간 안에 frontend connection을 만들지 못하면 operation을 실패시키고 custom semaphore, retry loop 또는 queue를 추가하지 않는다. application-selected timeout 숫자는 추가하지 않는다.
- Alternatives Considered: application semaphore는 PgBouncer capacity와 이중 조정이 필요하다. 무제한 대기는 request와 connection leak을 장기화한다.
- Consequences: 순간 overload 일부는 오류로 노출되며 기본 bounded connection 동작은 실제 dev 부하와 metrics로 검증해야 한다.
- Confirmation / Follow-up: capacity 안의 completion, 초과 부하 timeout, `cl_waiting`/`maxwait`와 종료 뒤 connection baseline 복귀를 확인한다.

### 전체 activation revision을 Git revert하고 Pooler는 유지한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/postgres-session-pool.md`, Linear PROD-726, Linear PROD-728
- Status: Active
- Context / Problem: activation 실패 시 Pooler, Cluster 또는 Web/migration traffic을 out-of-band 수정하면 GitOps ownership과 독립 배포 경계를 깨뜨린다. endpoint만 되돌리면 operation plugin/code와 env가 남아 pre-activation 경계가 복원되지 않는다.
- Decision Outcome: 전체 activation merge/squash revision을 Git revert해 pre-activation tree를 배포한다. 그 revision에서 API `DATABASE_URL`은 current owner-compatible direct fallback을 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code는 부재해야 한다. API fallback, Pooler, Cluster, Web BFF baseline, migration과 Secret은 유지하며 #564 Worker seam은 별도 소유 경계로 남기고 Pooler manifest를 prune하지 않는다.
- Alternatives Considered: `OPERATION_DATABASE_URL`만 direct Service로 바꾸면 operation plugin/code가 남아 lifecycle 경계가 불일치한다. Pooler 삭제는 별도 PROD-728 resource lifecycle이고 application rollback에 포함하지 않는다. credential 변경은 PROD-716 범위다.
- Consequences: application activation은 하나의 Git revert로 code와 endpoint env를 함께 제거하고 database migration/data rollback은 없다. Pooler는 별도 resource로 계속 Ready 상태를 유지한다.
- Confirmation / Follow-up: pre-activation revision render에서 API current fallback direct host와 `OPERATION_DATABASE_URL` env 부재를 assertion하고 source tree에서 operation plugin/code 부재를 확인한다. sync 후 Pooler·Cluster readiness와 GraphQL health를 확인하며 #564 Worker seam은 이 rollback에서 변경하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
