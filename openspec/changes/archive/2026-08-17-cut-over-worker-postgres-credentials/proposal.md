> **Reconciliation (PROD-780, 2026-08-16):** This active change predates the shared application-runtime transition. Its historical owner/API source split is superseded for application workloads: API, Web, Temporal Worker and Fedify application consumers use the retained `kosmo_worker` standard `PG*` source; the migration owner and Fedify MessageQueue remain separate. `kosmo_worker` is `LOGIN NOBYPASSRLS`. Existing `kosmo_api` role/ACL/default ACL/Vault/CNPG Secret provisioning remains rollback-compatible until PROD-781, while owner `kosmo` credential retirement remains PROD-712. This reconciliation does not archive or sync the canonical active specs.

## Why

프로세스 전역 application DB의 입력 경로가 workload마다 URL, password 조합과 selector로 갈라져 있으면 비밀번호의 URL escaping과 source 우선순위를 별도로 유지해야 한다. process-wide 기본 DB는 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` 환경변수 하나로 고정한다. API GraphQL, Web, Temporal Worker와 Fedify application consumer는 `kosmo_worker` shared source를 사용하고, dev/production migration은 각 migration owner 경계를 유지한다.

## What Changes

- `postgres.credentials.api` URL/password trio와 process-wide `DATABASE_URL` fallback을 제거한다. API와 Fedify consumer는 shared Worker source를 표준 `PG*` 환경변수로 사용하고 dev/production migration은 기존 migration owner 경계를 유지한다.
- `postgres.credentials.fedify`/`worker` selector와 `FEDIFY_DATABASE_*`/`WORKER_DATABASE_*` env seam을 제거한다.
- Chart가 기존 direct read-write Service를 가리키는 `PGHOST`/`PGPORT`, workload별 고정 `PGUSER`/`PGDATABASE`와 해당 release Secret의 `PGPASSWORD` ref를 생성한다. API/Web/Temporal Worker/Fedify application consumer는 `kosmo_worker`와 Worker Secret을 사용하고 migration owner/queue source는 별도로 유지한다.
- 모든 application release에 Worker ServiceAccount/Deployment와 chart-derived Worker source를 함께 연결한다. Worker runtime registration과 activation lifecycle은 PROD-722가 소유하며, 이 credential change는 별도 workload activation key를 만들거나 유지하지 않는다.
- Web trusted federation, Fedify listener, Temporal Worker DB Activity와 일반 core service는 기존 process 전역 기본 `db`를 그대로 사용한다. process 기본 DB는 표준 `PG*` 환경변수만 읽는다.
- GraphQL Query/Mutation은 API process의 표준 `PG*` DB를 공유하고 `OPERATION_DATABASE_URL`을 사용하지 않는다. Fedify MessageQueue 전용 `FEDIFY_QUEUE_DATABASE_URL`/password만 별도 secondary connection으로 유지한다.
- Cutover rollback은 전체 PROD-780 merge/squash revision을 Git revert해 pre-PROD-780 workload source로 복구한다. 인증 실패 중 owner로 자동 fallback하지 않는다.
- **BREAKING** 아직 production에서 소비하지 않은 내부 `fedify` 이름은 alias나 dual-read 없이 제거한다.
- 별도 application pool/handle, Fedify request DB context, process 기본 DB용 URL fallback/완전성 flag, Worker runtime registration/singleton lifecycle(PROD-722), Temporal domain Workflow, Fedify MessageQueue(PROD-448), 역할·VaultStaticSecret provisioning(PROD-369), 객체 GRANT(PROD-724), production sync/apply는 포함하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. 내부 배포·보안 경계다.
- Linear Contract / Implementation: `PROD-715`
- Required predecessors: 완료된 `PROD-369`, `PROD-724`, `PROD-709`
- Superseded predecessor: 취소된 별도 connection/SQL boundary `PROD-710`
- Related: `PROD-722` Worker runtime/activation 후속, 장기 Vault 동적 credential `PROD-744`
- Superseded alternative: 취소된 client-certificate/direct connection `PROD-470`

## Capabilities

### New Capabilities

- `worker-postgres-credential-cutover`: Web trusted federation ingress와 Temporal Worker workload 기본 DB의 `kosmo_worker` SCRAM principal 전환, 독립 rollback과 비운영 검증 계약.

### Modified Capabilities

- `workload-postgres-credential-selection`: Web/Worker 기본 DB를 고정 Worker `PG*` source로 전환하고 API/migration/queue 경계에 유입되지 않게 한다.
- `temporal-worker-runtime-foundation`: 항상 렌더되는 Worker Deployment가 process 기본 표준 PG env로 Worker source를 사용한다.

## Impact

- Helm의 workload별 고정 `PG*` env/Secret helper, API/Fedify consumer/dev migration과 Web/Worker template의 env 투영, Worker Secret 변경 시 restart target.
- 모든 process-wide workload 기본 표준 `PG*` source, shared Worker Secret consumer와 rotation target, migration·queue 경계와 기존 Pooler resource 불변, Git revert rollback과 live role 검증. Worker runtime registration과 lifecycle은 변경·검증하지 않는다.
- 완료된 PROD-369/724의 역할·ACL을 소비하되 application SQL과 DB handle은 변경하지 않는다.
- production sync/apply는 사용자의 별도 명시적 승인 없이는 수행하지 않는다.
