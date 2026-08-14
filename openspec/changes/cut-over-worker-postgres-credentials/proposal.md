## Why

Web trusted federation ingress와 Temporal Worker는 기존 CloudNativePG PgBouncer를 유지하면서 owner가 아닌 `kosmo_worker` 실행 경계로 전환되어야 한다. GraphQL Query/Mutation만 별도 operation `ctx.db`를 사용하므로, PROD-715는 별도 Worker application connection이나 runtime selector를 만들지 않고 두 workload의 process 기본 database credential을 고정된 Worker source로 전환한다.

## What Changes

- `postgres.credentials.fedify`/`worker` selector와 `FEDIFY_DATABASE_*`/`WORKER_DATABASE_*` env seam을 제거한다.
- Chart가 기존 PgBouncer를 가리키는 `kosmo_worker` URL과 PROD-369의 release별 `*-postgres-worker` / `password` Secret ref를 생성해 Web과 Temporal Worker workload의 기본 `DATABASE_*` source로 사용한다.
- `workloads.enabled`인 application render에서는 Temporal Worker ServiceAccount/Deployment를 항상 생성하고 별도 `worker.enabled` 입력을 제거한다.
- Business capability가 아직 등록되지 않은 foundation Worker는 Temporal/DB에 연결하지 않고 health/readiness를 제공하는 idle process로 유지한다. 부분 또는 잘못된 명시 registration은 계속 구성 오류로 거부한다.
- Web trusted federation, Fedify listener, Temporal Worker DB Activity와 일반 core service는 기존 process 전역 기본 `db`를 그대로 사용한다.
- API Rollout의 `DATABASE_*`/`OPERATION_DATABASE_URL`, migration, Fedify MessageQueue database와 기존 PgBouncer/TLS 경계는 변경하지 않는다.
- Cutover rollback은 전체 PROD-715 merge/squash revision을 Git revert해 기존 owner source로 복구한다. 인증 실패 중 owner로 자동 fallback하지 않는다.
- **BREAKING** 아직 production에서 소비하지 않은 내부 `fedify` 이름은 alias나 dual-read 없이 제거한다.
- 별도 `WORKER_DATABASE_*` application pool/handle, Fedify request DB context, Temporal domain Workflow, Fedify MessageQueue(PROD-448), GraphQL `kosmo_api` cutover(PROD-716), 역할·VaultStaticSecret provisioning(PROD-369), 객체 GRANT(PROD-724), production sync/apply는 포함하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. 내부 배포·보안 경계다.
- Linear Contract / Implementation: `PROD-715`
- Required predecessors: 완료된 `PROD-369`, `PROD-724`, `PROD-709`
- Superseded predecessor: 취소된 별도 connection/SQL boundary `PROD-710`
- Related: 완료된 `PROD-730`, 장기 Vault 동적 credential `PROD-744`
- Superseded alternative: 취소된 client-certificate/direct connection `PROD-470`

## Capabilities

### New Capabilities

- `worker-postgres-credential-cutover`: Web trusted federation ingress와 Temporal Worker workload 기본 DB의 `kosmo_worker` SCRAM principal 전환, 독립 rollback과 비운영 검증 계약.

### Modified Capabilities

- `workload-postgres-credential-selection`: Web/Worker 기본 `DATABASE_*`를 고정 Worker source로 전환하고 API/migration/queue 경계에 유입되지 않게 한다.
- `temporal-worker-runtime-foundation`: `workloads.enabled` 전역 gate에서 렌더되는 Worker Deployment가 process 기본 `DATABASE_*`로 Worker source를 사용한다.

## Impact

- Helm의 고정 Worker URL/Secret helper, Web/Worker env 투영, 항상 생성되는 Worker resources와 미등록 foundation의 healthy idle lifecycle.
- Web/Worker workload 기본 `DATABASE_*` source, API 비주입, migration·queue·PgBouncer 불변, Git revert rollback과 live role 검증.
- 완료된 PROD-369/724의 역할·ACL을 소비하되 application SQL과 DB handle은 변경하지 않는다.
- production sync/apply는 사용자의 별도 명시적 승인 없이는 수행하지 않는다.
