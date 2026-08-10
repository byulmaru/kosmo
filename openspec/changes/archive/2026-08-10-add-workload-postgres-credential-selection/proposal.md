## Why

현재 API Rollout과 Web BFF 기본 DB 경로는 CloudNativePG bootstrap owner credential을 공유하고, Web inbound Fedify도 같은 Web 프로세스 안에서 실행된다. 비소유 역할을 downstream에서 provision하더라도 chart에 역할별 환경 선택 경계가 없으면 API 기본 연결과 Fedify inbound 연결을 독립적으로 준비하거나 되돌릴 수 없다. PROD-709는 `api`/`fedify`/`migration` runtime 역할을 명확히 하되, 실제 Secret·role·DB client/connection·Temporal 전환을 끌어오지 않고 additive selector만 제공한다.

## What Changes

- `postgres.credentials.api`에 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key` atomic trio를 추가해 API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 하나의 source를 공유하도록 한다.
- `postgres.credentials.fedify`에 같은 atomic trio를 추가해 Web inbound Fedify와 명시적으로 활성화된 Worker Deployment에 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 additive로 렌더한다.
- API Rollout에는 Fedify env를 주입하지 않고, Web BFF 기본 `DATABASE_*`를 Fedify source로 덮어쓰지 않는다.
- 기존 values를 사용하고 selector를 비활성화한 rendered manifest는 byte-identical하게 유지한다. Partial trio는 Helm render를 실패시킨다.
- `migration` runtime 역할은 기존 `kosmo_migration` login → `SET ROLE kosmo` production 경계와 dev owner fallback을 그대로 유지하며 runtime selector와 분리한다.
- 이 change가 구현한 `fedify`/`FEDIFY_DATABASE_*` 이름은 legacy password selector seam으로만 유지한다. 이 seam은 Web과 후속 Worker foundation에 이미 연결돼 있다. 실제 BYPASSRLS identity와 generated certificate는 PROD-369의 `kosmo_worker` DatabaseRole이 provision하고, certificate selector 소비는 PROD-470, selector/env를 `worker`/`WORKER_DATABASE_*`로 옮기고 실제 Worker principal로 cutover하는 일은 PROD-715가 소유한다.
- 실제 Secret 값, role/권한, DB client/connection, migration 전환, Temporal/Worker resource를 생성하거나 전환하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. PostgreSQL workload credential selector는 내부 배포 계약이다.
- Linear Contract: `PROD-709`
- Related downstream authority: `PROD-369`, `PROD-715`, `PROD-716`, `PROD-719`, `PROD-448`, `PROD-564`
- Linear Implementation: `PROD-709`

## Capabilities

### New Capabilities

- `workload-postgres-credential-selection`: `api`/`fedify` runtime selector와 기존 `migration` credential 경계의 additive atomic trio 및 rollback 계약.

### Modified Capabilities

없음.

## Impact

- `apps/helm/values.yaml`: 비활성 기본값을 가진 `api`/`fedify` credential trio 입력.
- `apps/helm/templates/_helpers.tpl`: role별 atomic validation과 API source fallback helper.
- `apps/helm/templates/api/rollout.yaml`, `apps/helm/templates/web/rollout.yaml`, `apps/helm/templates/worker.yaml`: API shared `DATABASE_*`와 Web/Worker `FEDIFY_DATABASE_*` 입력 seam. API에는 Fedify env를 주입하지 않는다.
- 구현 시 일회성 수동 Helm template 검증 evidence: default byte identity, API/Fedify 조합·rollback, partial failure, API Fedify env 부재와 migration document 불변.
- 이 change는 재사용 가능한 regression script, CI/package hook 또는 committed golden hash fixture를 소유하지 않는다.
- Downstream follow-up: `PROD-369`의 `kosmo_api`/`kosmo_worker` role·generated certificate provisioning, `PROD-470`의 certificate selector 소비, `PROD-715/716`의 selector 명칭 migration과 실제 runtime principal transition, `PROD-448/719`의 API outbound Fedify 및 Worker/Temporal capability 활성화. Worker 입력 seam 자체는 이미 foundation에 연결돼 있으며 이 change는 해당 후속 결과를 구현하지 않는다.
