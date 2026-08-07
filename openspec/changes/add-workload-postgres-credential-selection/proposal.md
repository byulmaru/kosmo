## Why

현재 API Rollout과 Web BFF 기본 DB 경로는 CloudNativePG bootstrap owner credential을 공유하고, Web inbound Fedify도 같은 Web 프로세스 안에서 실행된다. 비소유 역할을 downstream에서 provision하더라도 chart에 역할별 환경 선택 경계가 없으면 API 기본 연결과 Fedify inbound 연결을 독립적으로 준비하거나 되돌릴 수 없다. PROD-709는 `api`/`fedify`/`migration` runtime 역할을 명확히 하되, 실제 Secret·role·DB client/connection·Temporal 전환을 끌어오지 않고 additive selector만 제공한다.

## What Changes

- `postgres.credentials.api`에 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key` atomic trio를 추가해 API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 하나의 source를 공유하도록 한다.
- `postgres.credentials.fedify`에 같은 atomic trio를 추가해 현재 Web inbound Fedify에만 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 additive로 렌더한다.
- API Rollout에는 Fedify env를 주입하지 않고, Web BFF 기본 `DATABASE_*`를 Fedify source로 덮어쓰지 않는다.
- 기존 values를 사용하고 selector를 비활성화한 rendered manifest는 byte-identical하게 유지한다. Partial trio는 Helm render를 실패시킨다.
- `migration` runtime 역할은 기존 `kosmo_migration` login → `SET ROLE kosmo` production 경계와 dev owner fallback을 그대로 유지하며 runtime selector와 분리한다.
- `kosmo_fedify`의 `BYPASSRLS`, role/policy/Secret provisioning은 downstream으로 남긴다. API outbound Fedify direct-call 제거, Temporal Workflow + Worker Fedify Activity, 아직 없는 Worker Deployment와 credential 소비는 PROD-448/719가 소유한다.
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
- `apps/helm/templates/api/rollout.yaml`, `apps/helm/templates/web/rollout.yaml`: API shared `DATABASE_*`와 Web-only `FEDIFY_DATABASE_*` 환경 주입.
- `apps/helm/templates/database-migration-job.yaml`: runtime selector와 무관한 기존 migration env/Secret/role 경계 유지 여부만 regression으로 확인.
- Helm render 회귀 검증: default byte identity, API/Fedify 조합·rollback, partial failure, API Fedify env 부재와 migration document 불변.
- Downstream follow-up: `PROD-369`의 role/Secret/RLS provisioning, `PROD-715/716`의 runtime transition, `PROD-448/719`의 API outbound Fedify 및 Worker/Temporal 전환. 이 change는 해당 결과를 구현하지 않는다.
