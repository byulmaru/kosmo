## Why

Web trusted federation ingress와 Temporal Worker DB Activity는 기존 CloudNativePG PgBouncer를 유지하면서 owner가 아닌 `kosmo_worker` 실행 경계로 전환되어야 한다. PROD-715는 완료된 PROD-709의 Fedify 전용 selector 명칭을 Worker 역할로 정정하고, API/Web BFF 기본 connection과 독립적으로 SCRAM credential을 선택·rollback할 수 있게 한다.

## What Changes

- `postgres.credentials.fedify`와 `FEDIFY_DATABASE_*`를 제거하고 `postgres.credentials.worker`와 `WORKER_DATABASE_*`로 대체한다.
- Worker URL·password Secret atomic trio를 Web trusted federation ingress와 Temporal Worker Deployment에만 주입한다.
- PROD-710의 명시적 Worker connection에 이 source를 전달해 기존 PgBouncer를 통해 `kosmo_worker`로 연결한다.
- API Rollout과 Web BFF 기본 `DATABASE_*`, migration과 기존 PgBouncer/TLS 경계는 변경하지 않는다.
- Worker selector가 비활성일 때 PROD-710의 명시적 handle은 승인된 기존 owner connection을 사용한다. 인증 실패 중에는 owner로 자동 fallback하지 않는다.
- **BREAKING** 아직 production에서 소비하지 않은 내부 `fedify` 이름은 alias나 dual-read 없이 제거한다.
- Temporal domain Workflow, Fedify MessageQueue(PROD-448), API/Web BFF `kosmo_api` cutover(PROD-716), 역할·VaultStaticSecret provisioning(PROD-369), 객체 GRANT(PROD-724), production sync/apply는 포함하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. 내부 배포·보안 경계다.
- Linear Contract / Implementation: `PROD-715`
- Required predecessors: `PROD-369`, `PROD-724`, `PROD-710`, 완료된 `PROD-709`
- Related: 완료된 `PROD-730`, 장기 Vault 동적 credential `PROD-744`
- Superseded alternative: 취소된 client-certificate/direct connection `PROD-470`

## Capabilities

### New Capabilities

- `worker-postgres-credential-cutover`: Web trusted federation ingress와 Temporal Worker DB Activity의 명시적 `kosmo_worker` SCRAM connection, 독립 cutover·rollback과 production 검증 계약.

### Modified Capabilities

- `workload-postgres-credential-selection`: `fedify` selector/env를 `worker` selector/env로 대체하고 Web trusted ingress와 Worker에만 투영한다.
- `temporal-worker-runtime-foundation`: 기본 비활성 Worker Deployment가 기본 `DATABASE_*`와 별도 `WORKER_DATABASE_*` 입력을 받을 수 있게 한다.

## Impact

- Helm Worker selector validation과 Web/Worker env 투영.
- PROD-710의 Web trusted ingress와 Temporal Worker DB Activity 명시적 connection bootstrap.
- API 비주입, 기본 connection·migration·PgBouncer 불변, partial selector 거부, rollback과 live role 검증.
- PROD-369/724/710 blocker가 남아 있는 동안 selector/env migration처럼 독립 검증 가능한 준비만 진행한다.
- production sync/apply는 사용자의 별도 명시적 승인 없이는 수행하지 않는다.
