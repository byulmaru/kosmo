## 1. PROD-726 production GraphQL DB consumer 정렬

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-371
- PROD-726

**Deliverable**

Production GraphQL user-data Query/Mutation의 root·field·loader와 호출하는 core domain action이 operation의 명시적 `ctx.db`로 모든 SQL을 실행한다. Mutation nested result resolver와 loader도 같은 operation handle을 사용한다.

**Guardrails**

- request 인증에서 한 번 실행하는 identity SQL과 startup/bootstrap SQL은 API의 current owner-compatible `DATABASE_URL` direct fallback 경계를 유지한다.
- 인증된 `searchProfiles`가 촉발하는 Fedify-owned remote actor materialization trusted side effect는 direct DB 예외로 허용하되, materialization 후 최종 GraphQL query와 result projection은 operation `ctx.db`를 사용한다.
- 기존 GraphQL schema, 제품 결과, 권한 predicate, 목록·정렬·pagination을 변경하지 않는다.
- 기존 domain transaction·savepoint·post-commit 의미를 유지하고 operation-wide transaction을 만들지 않는다.
- Fedify inbound/delivery, Temporal Workflow/Activity와 #564 trusted Worker execution은 자기 DB lifecycle을 유지하며 GraphQL RLS 범위에 포함하지 않는다. `WORKER_DATABASE_*`는 `OPERATION_DATABASE_URL`에 공급하지 않는다.

**Verification**

- CodeGraph call path와 targeted static search로 Account/Profile/Media/Hashtag/Session/Feedback/Post 결합 경로의 global/raw DB fallback이 없는지 확인한다.
- 각 domain integration test에서 주입한 operation handle이 nested loader와 core action까지 전달되는지 확인한다.
- 기존 Post/Bookmark/Reaction/Notification, Profile/Follow, Media upload, Hashtag, Session과 Feedback 회귀를 통과시킨다.

- [x] 1.1 production GraphQL operation SQL consumer와 core call graph를 인벤토리하고 허용된 request/startup 예외를 분류한다.
- [x] 1.2 Account/Profile/Media/Hashtag/Session/Feedback root·field·loader SQL을 operation `ctx.db`로 정렬한다.
- [x] 1.3 GraphQL이 호출하는 core action과 post-commit SQL에 operation Database를 전달하고 기존 transaction/savepoint를 보존한다.
- [x] 1.4 global/raw fallback 부재와 domain별 handle propagation을 정적·integration 검증한다.

## 2. PROD-726 Query/Mutation database session lifecycle

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/operations/postgres-session-pool.md`
- PROD-370
- PROD-708
- PROD-726

**Deliverable**

각 일반 Query/Mutation은 `OPERATION_DATABASE_URL`의 하나의 실제 PgBouncer client connection에서 actor context, user-data query/result projection/domain action SQL을 실행하고 execution이 끝난 뒤 connection 종료를 await한다. API `DATABASE_URL` direct client의 기존 server timeout startup 동작은 이 change의 범위 밖으로 두고 변경하지 않는다. Operation Pooler client는 PgBouncer가 지원하지 않는 server timeout startup/query parameter를 보내지 않으며 actor GUC만 하나의 initialization SQL round trip에서 session-level로 설정하고 성공 전에는 resolver를 실행하지 않는다. 연결 대기는 별도 숫자를 선택하지 않고 postgres.js의 기본 bounded connection timeout 동작에 맡긴다. `selectProfile`이 active Profile을 전환하면 자신이 소유하는 새 action-local narrow transaction을 같은 operation Database에서 열어 `kosmo.profile_id`와 `ctx.session.profileId`를 갱신해 다음 top-level Mutation field가 새 actor를 사용하게 하며, `kosmo.account_id`와 operation-wide transaction 경계는 유지한다. 범위는 serial sibling 사이 stale GUC 전환이며 authorization concurrency, locking 또는 TOCTOU safety는 포함하지 않는다. API `DATABASE_URL`은 direct request/auth/startup 경계를 유지한다.

**Guardrails**

- application pool lease나 client를 operation 사이에 재사용하지 않는다.
- `kosmo.account_id`와 `kosmo.profile_id`를 모두 UUID 또는 빈 문자열로 session-level 설정하고 setting SQL 실패 시 resolver 실행을 중단한다. Public helper를 매 operation 다시 읽지 않는다.
- direct client의 기존 server timeout startup 동작은 변경하지 않고 이 change의 범위 밖으로 둔다. Operation Pooler client는 `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout`을 startup/query parameter로 보내지 않으며 actor GUC만 initialization SQL round trip에서 session-level로 설정한다.
- 일반 결과, GraphQL 오류, execution throw, cancellation, timeout과 abort에서 async close 완료를 보장한다.
- 현재 활성화되지 않은 Query/Mutation incremental AsyncIterable bridge를 추가하지 않는다.
- Subscription에는 Query/Mutation용 장기 DB session을 할당하지 않는다.
- Fedify-owned remote actor materialization trusted side effect와 Temporal/worker execution은 이 operation session lifecycle에 포함하지 않는다.
- custom semaphore, retry loop 또는 queue를 만들지 않고 postgres.js 기본 bounded connection timeout 동작을 사용한다. application-selected timeout 숫자는 추가하지 않는다.
- endpoint, credential/Secret selector, Pooler CR·replica·resource·capacity는 이 forward fix에서 변경하지 않는다.

**Verification**

- fake operation client로 정상 result, GraphQL error, execution throw, cancellation/abort와 초기화 실패에서 close가 정확히 한 번 완료되는지 확인한다.
- 익명, Account-only, Account+Profile matrix에서 actor GUC만 한 initialization SQL round trip으로 설정되고 resolver가 그 전에 시작되지 않는지 확인한다. helper 의미는 integration/live probe에서 일회성으로 확인한다.
- `selectProfile` 뒤 다음 top-level Mutation field가 같은 operation Database에서 새 `ctx.session.profileId`와 `kosmo.profile_id`를 관찰하고, `kosmo.account_id`가 변하지 않으며 selectProfile-owned action-local narrow transaction만 사용함을 확인한다. 이 검증은 authorization concurrency, locking 또는 TOCTOU safety를 다루지 않는다.
- HTTP batch sibling의 Database identity, actor setting, DataLoader와 Pothos cache가 분리되는지 확인한다.
- capacity 초과에서 postgres.js 기본 bounded connection timeout 동작 후 connection/actor state가 남지 않는지 확인한다.

- [x] 2.1 종료 가능한 per-operation postgres.js/Drizzle client owner와 postgres.js 기본 bounded connection timeout 경계를 구현한다.
- [x] 2.2 두 actor GUC의 session-level 초기화와 setting 실패 시 operation 중단을 구현하고 runtime helper read-back을 추가하지 않는다.
- [x] 2.3 일반 Query/Mutation execute를 `finally` cleanup으로 소유하고 incremental execution과 Subscription을 제외하는 Yoga lifecycle을 구현한다.
- [ ] 2.4 모든 완료·오류·중단·batch·overload 경계의 lifecycle 회귀를 검증한다.

## 3. PROD-726 Pooler endpoint activation

**Authority / Provenance**

- `docs/operations/postgres-session-pool.md`
- PROD-728
- PROD-726
- PROD-716

**Deliverable**

GraphQL API의 `OPERATION_DATABASE_URL`만 CloudNativePG Pooler Service를 사용하고 API `DATABASE_URL`은 현재 owner-compatible direct fallback으로 유지한다. Web BFF baseline과 migration은 이 change에서 direct PostgreSQL Service를 유지한다. #564의 선택적 trusted Worker `WORKER_DATABASE_*` seam은 별도 실행 경계로 이 change에서 소비하지 않으며 `OPERATION_DATABASE_URL`에 공급하지 않는다. API/Web principal transition은 PROD-716이 소유한다.

**Guardrails**

- PostgreSQL Secret, role 또는 credential selector를 변경하지 않는다.
- configured `postgres.credentials.api` trio의 rendered env username, database와 password Secret source, scheme, path와 query는 유지하고 `OPERATION_DATABASE_URL`의 host와 port를 포함한 authority만 in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체한다. Runtime operation client는 URL query에서 세 server timeout key만 제거하고 unrelated query parameter는 유지한다. 새 credential selector는 만들지 않는다.
- Pooler CR, replica, resource와 capacity 설정을 변경하지 않는다.
- 실패 시 전체 activation merge/squash revision을 Git revert해 pre-activation tree로 되돌릴 수 있어야 한다. 이 revision은 API `DATABASE_URL` current fallback direct를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code를 제거해야 하며, Web BFF baseline, migration, PROD-728 Pooler와 Cluster는 유지한다. #564 Worker seam은 선점하거나 변경하지 않는다.

**Verification**

- dev/prod Helm render에서 API `DATABASE_URL`은 current owner-compatible fallback인 `<release>-postgres-rw`, API `OPERATION_DATABASE_URL`은 `<release>-postgres-pooler-rw`, Web BFF와 migration host는 `<release>-postgres-rw`인지 확인한다. #564 `WORKER_DATABASE_*` seam은 이 operation endpoint 검증에서 소비하지 않으며 `OPERATION_DATABASE_URL`에 공급되지 않아야 한다.
- 모든 workload의 Secret name/key가 전환 전과 동일한지 값 노출 없이 확인한다.
- configured API trio 대표 조합에서 rendered API direct URL의 authority와 operation URL의 username/database/password Secret source, scheme, path/query 보존 및 Pooler authority `<release>-postgres-pooler-rw:5432` 교체를 값 노출 없이 확인한다. Operation client regression은 PgBouncer가 지원하지 않는 server-timeout query key 제거와 `application_name` 같은 unrelated query parameter 보존을 확인한다.
- Helm lint, server-side dry-run과 pre-activation revision render를 통과시킨다. Render는 API `DATABASE_URL` direct host와 `OPERATION_DATABASE_URL` env 부재, operation plugin/code 부재를 assertion한다.

- [x] 3.1 API `DATABASE_URL` direct endpoint와 operation 전용 `OPERATION_DATABASE_URL` Pooler endpoint를 분리하고 shared API-role credential 선택은 유지한다.
- [x] 3.2 Web BFF baseline과 migration의 direct endpoint 및 이 change에 포함된 API-role Secret 참조 불변을 Helm render로 검증하고, #564 `WORKER_DATABASE_*` seam은 별도 경계로 제외한다.
- [x] 3.3 pre-activation `DATABASE_URL` direct render와 `OPERATION_DATABASE_URL` env 부재, Helm/admission 정적 검증을 완료한다.
- [x] 3.4 application activation, operation session live gate와 whole activation Git-revert rollback 절차를 canonical 운영 문서에 동기화한다.

## 4. PROD-726 integration, live gate와 closeout

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/operations/postgres-session-pool.md`
- PROD-726

**Deliverable**

dev runtime에서 GraphQL user-data query/result projection/domain action operation session의 admission, readiness, actor affinity, cleanup, reset과 capacity가 관찰 가능하게 검증되고 credential 전환 없이 whole activation revision을 rollback할 수 있다. Rollback 뒤 PROD-728 Pooler는 유지된다.

**Guardrails**

- live gate 실패 시 application credential, RLS policy/grant 또는 out-of-band Kubernetes resource를 변경하지 않는다.
- Secret, connection string, actor UUID, database row와 backend PID를 검증 근거에 기록하지 않는다.
- live gate 전에는 OpenSpec을 archive하거나 PROD-726을 Done으로 처리하지 않는다.

**Verification**

- 전체 TypeScript, ESLint, Prettier, 관련 unit/integration/E2E, Helm lint/render와 OpenSpec strict validation을 통과시킨다.
- forward fix release의 dev Argo sync와 API Rollout/Pod/Service readiness를 확인하고 current API Pod 로그에 PgBouncer unsupported startup-parameter 오류가 없는지 확인한다.
- 익명·Account-only·Account+Profile 기존 GraphQL smoke가 초기화 HTTP 500 없이 기대한 결과를 반환하는지 확인한다. 로그 원문, URL, Secret과 actor UUID는 근거에 남기지 않는다.
- Query/Mutation별 frontend connection, same-session backend affinity, Mutation nested result, `searchProfiles` materialization 후 최종 query의 `ctx.db` 사용, 두 actor helper의 일회성 의미, 정상·오류·abort cleanup과 same-backend `DISCARD ALL` reset을 비민감하게 확인한다.
- `cnpg_pgbouncer_*` client/server/max-wait metrics와 capacity 안 completion, 초과 부하 timeout, 종료 뒤 connection baseline 복귀를 확인한다.
- 전체 activation merge/squash revision Git revert가 API `DATABASE_URL` current fallback direct를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code를 제거하며, Web BFF baseline, migration, PROD-728 Pooler와 Cluster에 영향을 주지 않음을 확인한다. #564 Worker seam과 API/Web principal transition(PROD-716)은 이 change에서 건드리지 않는다.

- [x] 4.1 전체 정적·unit·integration·E2E·Helm·OpenSpec 검증과 correctness/최소화 self-review를 완료한다.
- [x] 4.2 구현 근거, PROD-716 제외 범위와 whole activation Git-revert rollback 및 PROD-728 Pooler 유지가 명시된 Ready PR을 게시하고 merge gate를 통과한다.
- [ ] 4.3 exact merge revision의 dev Argo/readiness와 GraphQL 행동 회귀를 검증한다.
- [ ] 4.4 actor session affinity, 모든 cleanup 경로, same-backend reset과 PgBouncer metrics/capacity를 live 검증한다.
- [ ] 4.5 live gate 근거를 Linear에 기록하고 canonical spec sync/archive 및 PROD-726 완료 처리를 수행한다.
