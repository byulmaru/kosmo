## Why

Web trusted federation ingress와 Temporal Worker는 기존 PostgreSQL direct read-write Service를 통해 owner가 아닌 `kosmo_worker` 실행 경계로 전환되어야 한다. GraphQL Query/Mutation만 별도 operation `ctx.db`와 PgBouncer를 사용하므로, PROD-715는 별도 Worker application connection이나 runtime selector를 만들지 않고 두 workload의 process 기본 database credential을 고정된 Worker source로 전환한다.

## What Changes

- `postgres.credentials.fedify`/`worker` selector와 `FEDIFY_DATABASE_*`/`WORKER_DATABASE_*` env seam을 제거한다.
- Chart가 기존 direct read-write Service를 가리키는 `PGHOST`/`PGPORT`, 고정 `PGUSER=kosmo_worker`/`PGDATABASE=kosmo`와 PROD-369의 release별 `PGPASSWORD` Secret ref를 생성해 Web과 enabled Temporal Worker workload의 process 기본 DB source로 사용한다.
- 기존 `workloads.enabled && worker.enabled` activation gate를 유지하고, enabled Worker ServiceAccount/Deployment에만 chart-derived Worker source를 연결한다. `worker.enabled`의 기본값과 activation lifecycle은 이 change에서 변경하지 않는다.
- Web trusted federation, Fedify listener, Temporal Worker DB Activity와 일반 core service는 기존 process 전역 기본 `db`를 그대로 사용한다.
- API Rollout의 `DATABASE_*`/`OPERATION_DATABASE_URL`, migration, Fedify MessageQueue database와 GraphQL operation 전용 PgBouncer/TLS 경계는 변경하지 않는다.
- Cutover rollback은 전체 PROD-715 merge/squash revision을 Git revert해 기존 owner source로 복구한다. 인증 실패 중 owner로 자동 fallback하지 않는다.
- **BREAKING** 아직 production에서 소비하지 않은 내부 `fedify` 이름은 alias나 dual-read 없이 제거한다.
- 별도 `WORKER_DATABASE_*` application pool/handle, Fedify request DB context, Worker runtime registration/singleton lifecycle(PROD-722), Temporal domain Workflow, Fedify MessageQueue(PROD-448), GraphQL `kosmo_api` cutover(PROD-716), 역할·VaultStaticSecret provisioning(PROD-369), 객체 GRANT(PROD-724), production sync/apply는 포함하지 않는다.

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
- `temporal-worker-runtime-foundation`: 기존 activation gate가 켜진 Worker Deployment가 process 기본 표준 PG env로 Worker source를 사용한다.

## Impact

- Helm의 고정 Worker `PG*` env/Secret helper, Web과 enabled Worker template의 env 투영, Worker Secret 변경 시 conditional restart target.
- Web/Worker workload 기본 표준 `PG*` source, API 비주입, migration·queue·GraphQL operation PgBouncer 불변, Git revert rollback과 live role 검증. Worker runtime registration과 lifecycle은 변경·검증하지 않는다.
- 완료된 PROD-369/724의 역할·ACL을 소비하되 application SQL과 DB handle은 변경하지 않는다.
- production sync/apply는 사용자의 별도 명시적 승인 없이는 수행하지 않는다.
