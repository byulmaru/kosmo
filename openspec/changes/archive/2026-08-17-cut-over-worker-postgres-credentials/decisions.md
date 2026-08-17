# Decisions

이 기록은 PROD-715의 Worker credential transition을 role/password provisioning(PROD-369), object GRANT(PROD-724), GraphQL API cutover(PROD-716), Fedify MessageQueue(PROD-448)와 분리한다.

## Decision Log

### process-wide application DB는 표준 PG 환경변수 하나를 사용한다

- Date: 2026-08-15
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, user decision
- Decision Outcome: process-wide application DB client는 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`만 기본 source로 사용한다. API, Fedify consumer와 dev migration은 기존 owner `kosmo` source를, Web과 Temporal Worker는 `kosmo_worker` source를 사용한다. `DATABASE_URL` fallback, `hasComplete...` source-selection flag와 URL/password 조합은 사용하지 않는다.
- Alternatives Considered: 표준 PG env가 완전할 때만 URL source를 우선하거나 불완전한 trio를 검증하는 compatibility branch는 URL escaping과 source precedence를 다시 만들고 workload 간 계약을 갈라 놓는다.
- Consequences: process-wide source를 공급하는 Helm template과 local/integration harness가 표준 PG env를 채워야 한다. PROD-779 이후 GraphQL은 API process source를 공유하고, `FEDIFY_QUEUE_DATABASE_URL`/password만 MessageQueue 전용 secondary connection으로 남긴다.

### API custom URL/password selector trio는 제거한다

- Date: 2026-08-15
- Decision Class: Scope Boundary
- Status: Active
- Authority / Provenance: Linear `PROD-715`, user decision
- Decision Outcome: 사용되지 않는 `postgres.credentials.api.databaseUrl` 및 `passwordSecret.name/key` trio와 그 partial/complete validation contract를 제거한다. API process 기본 DB는 chart가 생성한 owner `kosmo` 표준 PG env를 사용하고, API에 Worker Secret을 주입하지 않는다.
- Alternatives Considered: 임의 API URL authority와 Secret selector를 유지하면 process-wide 표준 PG source에 불필요한 override와 URL/password 불일치 상태를 다시 도입한다.
- Consequences: API custom URL을 values로 설정하는 구성은 지원하지 않는다. GraphQL은 API process의 표준 `PG*` source를 공유하며 queue URL/password와 migration role 경계는 영향을 받지 않는다.

### Web/Worker process 기본 DB는 고정 Worker source를 사용한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, `PROD-716`
- Decision Outcome: Chart가 생성한 기존 direct read-write Service의 `PGHOST`/`PGPORT`, 고정 `PGUSER=kosmo_worker`/`PGDATABASE=kosmo`와 PROD-369의 release별 `PGPASSWORD` Secret ref를 Web과 Temporal Worker의 process 기본 DB에 사용한다. 두 workload는 `DATABASE_URL`/`DATABASE_PASSWORD` 없이 postgres.js의 표준 PG env 해석과 기존 전역 `db`를 유지하며 별도 selector, `WORKER_DATABASE_*` application connection, request client 또는 Fedify context DB handle을 만들지 않는다.
- Alternatives Considered: 취소된 `PROD-710`의 explicit Worker connection은 별도 callsite migration과 connection lifecycle을 불필요하게 만든다.
- Consequences: Web의 비GraphQL trusted 경로와 Worker DB Activity는 workload 기본 principal을 공유한다. API GraphQL은 PROD-779에 따라 API process 기본 source를 공유하며 API 역할 변경은 이 Worker cutover의 범위가 아니다.

### 기존 direct read-write Service와 SCRAM 인증을 사용한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-369`, `PROD-715`; canceled `PROD-470`
- Decision Outcome: Web과 Temporal Worker는 기존 PostgreSQL direct read-write Service에 TLS로 연결하고 Vault/VSO가 공급해 CNPG DatabaseRole이 조정한 `kosmo_worker` password로 인증한다. 기존 PgBouncer Pooler resource는 유지하지만 GraphQL consumer는 PROD-779에서 제거됐다.
- Alternatives Considered: Worker에 전용 Pooler나 custom authentication을 만드는 방식은 필요 없는 pooling·운영 경계를 추가한다. direct endpoint에 client certificate 인증을 추가하는 대안은 취소된 PROD-470 계약으로 재개하지 않는다.
- Consequences: Worker `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`는 chart가 direct endpoint와 고정 principal/database로 생성하고 `PGPASSWORD` Secret ref는 release별 `*-postgres-worker` / `password`로 고정한다. cert mount, `pg_hba`와 custom pool은 구현하지 않는다.

### API selector와 고정 Worker source의 workload 소유권을 분리한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, `PROD-716`
- Decision Outcome: API process와 GraphQL의 기본 source는 chart가 생성한 `kosmo` 표준 `PG*` env이고, 고정 Worker source는 Web/Worker 기본 표준 `PG*` env에만 사용한다. API Rollout에는 Worker Secret/env를 주입하지 않는다.
- Alternatives Considered: Web BFF에 API source를 공유하거나 API에 임의 URL selector를 남기면 비GraphQL trusted Web 경로가 잘못된 principal로 실행되거나 process-wide source precedence가 다시 생긴다.
- Consequences: API selector는 제거되며 API/Fedify consumer/dev migration의 owner source와 Web/Worker Worker source는 각 template에서 고정 생성된다.

### Worker PG env와 Secret ref는 selector 없이 고정 생성한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-709`, `PROD-715`
- Decision Outcome: API, Fedify consumer와 dev migration은 owner `PG*` env와 app/migration Secret ref를, Web/Worker는 values 입력 없이 Worker 표준 PG env와 Secret name/key를 chart의 release naming과 고정 계약으로 생성한다.
- Alternatives Considered: API와 동일한 임의 URL selector나 `enabled` flag를 Worker에 두면 고정된 principal/database/endpoint에 도달 불가능하거나 불필요한 상태와 URL/Secret 불일치 가능성을 만든다.
- Consequences: Secret value는 values/rendered manifest에 나타나지 않고 workload별 `PGPASSWORD` SecretKeyRef로만 주입한다. DatabaseRole과 각 workload가 같은 Secret-name helper를 사용한다.

### PROD-715는 기존 Temporal Worker activation gate를 유지한다

- Date: 2026-08-14
- Decision Class: Scope Boundary
- Status: Superseded by PROD-722 on 2026-08-16
- Authority / Provenance: Linear `PROD-715`, `PROD-722`
- Decision Outcome: 이 기록은 당시 PROD-715 credential wiring의 범위를 보존한다. 당시에는 두 activation key가 모두 켜진 application render에만 Temporal Worker ServiceAccount/Deployment와 chart-derived Worker source를 연결하고, Worker registration·startup·shutdown을 이 change에서 변경하지 않았다.
- Alternatives Considered: 당시에는 Worker business registration과 singleton lifecycle을 소유하는 PROD-722 후속 계약과 credential wiring을 분리하기 위해 activation gate를 유지했다.
- Consequences: 이 결정은 현재 규범이 아니다. PROD-722가 2026-08-16에 activation key를 제거하고 모든 application release에 Worker를 함께 render하도록 대체했다. Worker runtime readiness, drain과 registration은 PROD-722에서 결정·검증한다.

### 모든 application release에 Worker credential wiring을 적용한다

- Date: 2026-08-16
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-722`, user decision
- Decision Outcome: 유효한 immutable release image가 지정된 chart render에는 Web과 Temporal Worker가 항상 존재하며, 두 workload 모두 chart-derived `kosmo_worker` 표준 PG source와 `worker-database` Secret restart target을 사용한다. chart-wide 또는 Worker별 activation key는 resource 존재와 credential wiring을 제어하지 않는다.
- Alternatives Considered: 기존 gate를 유지하면 release가 정상이어도 Worker와 Secret rotation target이 조용히 빠질 수 있고, PROD-722의 singleton Worker contract와 불일치한다.
- Consequences: missing/invalid image는 render/configuration error로 남으며 workload-disabled bootstrap은 지원하지 않는다. Production sync/apply/cutover/live verification은 별도 사용자 승인 경계를 유지한다.

### Worker Secret 변경은 Web과 Worker를 재시작한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, user decision
- Decision Outcome: `worker-database` VaultStaticSecret destination이 변경되면 Web Rollout과 항상 렌더되는 Temporal Worker Deployment를 restart target으로 재시작해 새 `PGPASSWORD` SecretKeyRef를 적용한다.
- Alternatives Considered: Pod를 재시작하지 않으면 env로 주입된 기존 password가 남아 Secret rotation 뒤 인증 실패가 발생할 수 있다.
- Consequences: rotation은 기존 VSO destination과 workload restart lifecycle을 사용하며 별도 runtime credential refresh, URL 감지 또는 compatibility flag를 만들지 않는다.

### rollback은 workload wiring의 Git revert다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`
- Decision Outcome: Cutover 실패 시 전체 PROD-715 merge/squash revision을 Git revert해 Web 기본 DB와 Worker resource/source를 pre-PROD-715 manifest로 복구한다. 활성 Worker source의 인증 실패 중에는 owner로 자동 fallback하지 않는다.
- Alternatives Considered: runtime 자동 fallback은 principal 전환 실패를 숨긴다. Worker resource rendering은 PROD-722의 현재 always-render contract를 따른다.
- Consequences: rollback은 명시적 source revision 변경이며 API process/GraphQL source, migration과 queue source는 고정한다.

### Fedify MessageQueue database는 Worker principal과 분리한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, `PROD-724`, `PROD-448`
- Decision Outcome: `kosmo_fedify_queue` database/role과 `FEDIFY_QUEUE_DATABASE_*`는 MessageQueue 전용이며 `kosmo_worker` source를 재사용하지 않는다.
- Alternatives Considered: queue와 application credential 공유는 독립 database ownership과 retry transport 경계를 무너뜨린다.
- Consequences: PROD-715은 queue adapter, queue ACL과 consumer database를 변경하지 않는다.

### production 승인과 change 완료를 분리한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-369`, `PROD-724`, `PROD-715`
- Decision Outcome: implementation/PR/비운영 principal 검증으로 change를 완료할 수 있지만 production sync/apply/cutover/live verification은 별도 사용자 승인과 운영 절차로만 수행한다.
- Alternatives Considered: production evidence를 OpenSpec 완료 조건에 두면 승인 경계와 코드 완료를 결합하고 PR/CI를 운영 승인으로 오해하기 쉽다.
- Consequences: PR 본문과 완료 보고는 production 미수행 상태를 명시한다.

### Vault 동적 credential은 후속 capability다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-744`
- Decision Outcome: 현재 cutover는 VaultStaticSecret 기반 SCRAM credential을 사용한다. Vault lease, 임시 login role과 PgBouncer session 만료 정렬은 PROD-744에서 별도 설계한다.
- Alternatives Considered: 현재 transition에 동적 lease를 포함하면 독립 rollout·rollback 경계가 사라진다.
- Consequences: PROD-744는 PROD-715 완료 조건이 아니다.

### PROD-780이 application runtime source와 Worker role attribute를 대체한다

- Date: 2026-08-16
- Decision Class: Upstream Contract
- Status: Active
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, Linear `PROD-780`, `PROD-781`
- Decision Outcome: 이 change의 API/Fedify owner source와 shared-Worker workload target은 PROD-780의 새 `kosmo_runtime LOGIN NOBYPASSRLS` 표준 PG\* source로 대체된다. Legacy `kosmo_worker BYPASSRLS` provisioning은 PROD-782까지 유지하고 migration owner와 Fedify MessageQueue source 분리는 보존한다.
- Alternatives Considered: historical delta를 current authority로 계속 두는 방식은 구현 및 Active spec과 모순되어 제외한다.
- Consequences: 이 change의 기존 구현·검증 evidence는 historical record로 남고, current runtime spec sync/archive는 PROD-780이 소유한다. legacy `kosmo_api` ACL/default ACL/role/Secret 제거는 PROD-781이 소유한다.
