# Decisions

이 기록은 PROD-715의 Worker credential transition을 role/password provisioning(PROD-369), object GRANT(PROD-724), GraphQL API cutover(PROD-716), Fedify MessageQueue(PROD-448)와 분리한다.

## Decision Log

### Web/Worker process 기본 DB는 고정 Worker source를 사용한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, `PROD-716`
- Decision Outcome: Chart가 생성한 고정 `kosmo_worker` URL과 PROD-369의 release별 Worker Secret ref를 Web과 Temporal Worker의 기본 `DATABASE_URL`/`DATABASE_PASSWORD`에 사용한다. 두 workload는 기존 전역 `db`를 유지하며 별도 selector, `WORKER_DATABASE_*` application connection, request client 또는 Fedify context DB handle을 만들지 않는다.
- Alternatives Considered: 취소된 `PROD-710`의 explicit Worker connection은 GraphQL 전용 `ctx.db` 경계와 맞지 않고 callsite migration을 불필요하게 만든다.
- Consequences: Web의 비GraphQL trusted 경로와 Worker DB Activity는 workload 기본 principal을 공유한다. API GraphQL operation은 별도 `kosmo_api` 경계를 유지한다.

### 기존 CloudNativePG PgBouncer와 SCRAM 인증을 유지한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-369`, `PROD-715`; canceled `PROD-470`
- Decision Outcome: workload는 기존 PgBouncer에 TLS로 연결하고 Vault/VSO가 공급해 CNPG DatabaseRole이 조정한 `kosmo_worker` password로 인증한다.
- Alternatives Considered: client certificate 때문에 PostgreSQL direct Service로 연결하거나 전용 Pooler를 만드는 방식은 현재 pooling·운영 경계를 깨거나 불필요하게 확장한다.
- Consequences: Worker URL은 chart가 고정된 `kosmo_worker`/`kosmo`와 기존 PgBouncer endpoint로 생성하고 Secret ref는 release별 `*-postgres-worker` / `password`로 고정한다. cert mount, `pg_hba`와 custom pool은 구현하지 않는다.

### API selector와 고정 Worker source의 workload 소유권을 분리한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`, `PROD-716`
- Decision Outcome: API selector source는 API Rollout의 `DATABASE_*`/`OPERATION_DATABASE_*`에만 사용하고 고정 Worker source는 Web/Worker 기본 `DATABASE_*`에만 사용한다. API Rollout에는 Worker Secret/env를 주입하지 않는다.
- Alternatives Considered: Web BFF에 API source를 계속 공유하면 비GraphQL trusted Web 경로가 `kosmo_api` RLS principal로 실행된다.
- Consequences: API selector는 Web/Worker source나 rollback에 관여하지 않는다.

### Worker URL과 Secret ref는 selector 없이 고정 생성한다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-709`, `PROD-715`
- Decision Outcome: API는 기존 URL/password Secret trio를 유지한다. Worker는 values 입력을 전혀 받지 않고 URL과 Secret name/key를 chart의 release naming으로 생성한다.
- Alternatives Considered: API와 동일한 임의 URL selector나 `enabled` flag를 Worker에도 두면 고정된 principal/database/endpoint에 도달 불가능하거나 불필요한 상태와 URL/Secret 불일치 가능성을 만든다.
- Consequences: Secret value는 values/rendered manifest에 나타나지 않고 고정 SecretKeyRef로만 주입한다. DatabaseRole과 workload가 같은 Secret-name helper를 사용한다.

### Temporal Worker는 별도 enable flag 없이 항상 배포한다

- Date: 2026-08-14
- Decision Class: User Decision
- Status: Active
- Authority / Provenance: Linear `PROD-715`, user decision
- Decision Outcome: `workloads.enabled`인 application render에서는 Temporal Worker ServiceAccount/Deployment를 항상 생성하고 `worker.enabled` 또는 동등한 Worker-only off 상태를 두지 않는다.
- Alternatives Considered: foundation을 기본 비활성으로 유지하거나 환경별 Worker toggle을 두는 방식은 정상 운영에서 사용하지 않는 상태와 배포 조합만 늘린다.
- Consequences: 전체 application workload gate는 유지하지만 Worker만 독립적으로 끄는 rollback은 지원하지 않는다. 등록된 business capability가 없을 때 process는 health/readiness를 제공하는 idle 상태로 유지되며 Temporal/DB connection을 열지 않는다. 부분 또는 잘못된 명시 registration은 계속 실패한다.

### rollback은 workload wiring의 Git revert다

- Date: 2026-08-14
- Decision Class: Derived Contract
- Status: Active
- Authority / Provenance: Linear `PROD-715`
- Decision Outcome: Cutover 실패 시 전체 PROD-715 merge/squash revision을 Git revert해 Web 기본 DB와 Worker resource/source를 pre-PROD-715 manifest로 복구한다. 활성 Worker source의 인증 실패 중에는 owner로 자동 fallback하지 않는다.
- Alternatives Considered: runtime `enabled` flag나 자동 fallback은 정상 배포에 사용하지 않는 상태를 영구 유지하고 principal 전환 실패를 숨긴다.
- Consequences: rollback은 명시적 source revision 변경이며 API selector, migration과 queue source는 고정한다.

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
