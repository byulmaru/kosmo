## 1. PROD-726 production GraphQL DB consumer 정렬

**Authority / Provenance**

- `docs/architecture/core-services.md`
- PROD-371
- PROD-726

**Deliverable**

Production GraphQL Query/Mutation의 root·field·loader와 호출하는 core service가 operation의 명시적 `ctx.db`로 모든 SQL을 실행한다.

**Guardrails**

- request 인증에서 한 번 실행하는 identity SQL과 startup/bootstrap SQL은 operation session 밖의 기존 DB 경계를 유지한다.
- 기존 GraphQL schema, 제품 결과, 권한 predicate, 목록·정렬·pagination을 변경하지 않는다.
- 기존 domain transaction·savepoint·post-commit 의미를 유지하고 operation-wide transaction을 만들지 않는다.
- ActivityPub/Fedify와 worker의 no-operation caller는 자기 DB handle 또는 기존 commit 이후 fallback 경계를 유지한다.

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

각 일반 Query/Mutation은 하나의 실제 PgBouncer client connection에서 actor context와 모든 operation SQL을 실행하고 execution이 끝난 뒤 connection 종료를 await한다.

**Guardrails**

- application pool lease나 client를 operation 사이에 재사용하지 않는다.
- `kosmo.account_id`와 `kosmo.profile_id`를 모두 UUID 또는 빈 문자열로 session-level 설정하고 setting SQL 실패 시 resolver 실행을 중단한다. Public helper를 매 operation 다시 읽지 않는다.
- 일반 결과, GraphQL 오류, execution throw, cancellation, timeout과 abort에서 async close 완료를 보장한다.
- 현재 활성화되지 않은 Query/Mutation incremental AsyncIterable bridge를 추가하지 않는다.
- Subscription에는 Query/Mutation용 장기 DB session을 할당하지 않는다.
- custom semaphore, retry loop 또는 queue를 만들지 않고 bounded postgres.js connect timeout을 사용한다.

**Verification**

- fake operation client로 정상 result, GraphQL error, execution throw, cancellation/abort와 초기화 실패에서 close가 정확히 한 번 완료되는지 확인한다.
- 익명, Account-only, Account+Profile matrix에서 두 GUC 설정을 확인하고 helper 의미는 integration/live probe에서 일회성으로 확인한다.
- HTTP batch sibling의 Database identity, actor setting, DataLoader와 Pothos cache가 분리되는지 확인한다.
- capacity 초과에서 bounded timeout 후 connection/actor state가 남지 않는지 확인한다.

- [x] 2.1 종료 가능한 per-operation postgres.js/Drizzle client owner와 bounded connection timeout 경계를 구현한다.
- [x] 2.2 두 actor GUC의 session-level 초기화와 setting 실패 시 operation 중단을 구현하고 runtime helper read-back을 추가하지 않는다.
- [x] 2.3 일반 Query/Mutation execute를 `finally` cleanup으로 소유하고 incremental execution과 Subscription을 제외하는 Yoga lifecycle을 구현한다.
- [ ] 2.4 모든 완료·오류·중단·batch·overload 경계의 lifecycle 회귀를 검증한다.

## 3. PROD-726 API-only Pooler endpoint activation

**Authority / Provenance**

- `docs/operations/postgres-session-pool.md`
- PROD-728
- PROD-726
- PROD-716

**Deliverable**

GraphQL API workload만 CloudNativePG Pooler Service를 사용하고 Web BFF, worker와 migration workload는 direct PostgreSQL Service를 유지한다.

**Guardrails**

- PostgreSQL Secret, role 또는 credential selector를 변경하지 않는다.
- Pooler CR, replica, resource와 capacity 설정을 변경하지 않는다.
- API endpoint 전환은 Web/worker/migration과 독립적으로 Git revert할 수 있어야 한다.

**Verification**

- dev/prod Helm render에서 API host는 `<release>-postgres-pooler-rw`, Web/worker/migration host는 `<release>-postgres-rw`인지 확인한다.
- 모든 workload의 Secret name/key가 전환 전과 동일한지 값 노출 없이 확인한다.
- Helm lint, server-side dry-run과 direct endpoint rollback render를 통과시킨다.

- [x] 3.1 API operation endpoint와 shared API-role credential 선택을 분리해 API Rollout만 Pooler URL을 사용하게 한다.
- [x] 3.2 Web BFF, worker, migration의 direct endpoint와 모든 Secret 참조 불변을 Helm render로 검증한다.
- [x] 3.3 API-only direct endpoint rollback render와 Helm/admission 정적 검증을 완료한다.
- [x] 3.4 application activation, operation session live gate와 API-only rollback 절차를 canonical 운영 문서에 동기화한다.

## 4. PROD-726 integration, live gate와 closeout

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `docs/operations/postgres-session-pool.md`
- PROD-726

**Deliverable**

dev runtime에서 operation session의 admission, readiness, actor affinity, cleanup, reset과 capacity가 관찰 가능하게 검증되고 credential 전환 없이 독립 rollback할 수 있다.

**Guardrails**

- live gate 실패 시 application credential, RLS policy/grant 또는 out-of-band Kubernetes resource를 변경하지 않는다.
- Secret, connection string, actor UUID, database row와 backend PID를 검증 근거에 기록하지 않는다.
- live gate 전에는 OpenSpec을 archive하거나 PROD-726을 Done으로 처리하지 않는다.

**Verification**

- 전체 TypeScript, ESLint, Prettier, 관련 unit/integration/E2E, Helm lint/render와 OpenSpec strict validation을 통과시킨다.
- dev Argo sync와 API Rollout/Pod/Service readiness, 기존 GraphQL smoke를 exact merge revision에서 확인한다.
- Query/Mutation별 frontend connection, same-session backend affinity, 두 actor helper의 일회성 의미, 정상·오류·abort cleanup과 same-backend `DISCARD ALL` reset을 비민감하게 확인한다.
- `cnpg_pgbouncer_*` client/server/max-wait metrics와 capacity 안 completion, 초과 부하 timeout, 종료 뒤 connection baseline 복귀를 확인한다.
- API endpoint direct rollback이 Web/worker/migration, Pooler와 Cluster에 영향을 주지 않음을 확인한다.

- [ ] 4.1 전체 정적·unit·integration·E2E·Helm·OpenSpec 검증과 correctness/최소화 self-review를 완료한다.
- [ ] 4.2 구현 근거, PROD-716 제외 범위와 독립 rollback이 명시된 Ready PR을 게시하고 merge gate를 통과한다.
- [ ] 4.3 exact merge revision의 dev Argo/readiness와 GraphQL 행동 회귀를 검증한다.
- [ ] 4.4 actor session affinity, 모든 cleanup 경로, same-backend reset과 PgBouncer metrics/capacity를 live 검증한다.
- [ ] 4.5 live gate 근거를 Linear에 기록하고 canonical spec sync/archive 및 PROD-726 완료 처리를 수행한다.
