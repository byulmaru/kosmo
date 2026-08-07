## Why

현재 API와 Web BFF 및 같은 Web 프로세스의 federation/system 경로는 CloudNativePG bootstrap owner의 같은 Secret과 URL을 사용하므로, 비소유 역할을 먼저 provision해도 역할별 credential 전환을 독립적으로 배포하거나 되돌릴 수 없다. API와 Web BFF가 공유하는 API credential과 Web 프로세스의 federation/system 전용 DB connection credential 선택 계약을 additive opt-in으로 먼저 제공해야 후속 전환을 단계적으로 진행할 수 있다.

## What Changes

- API Rollout과 Web BFF 기본 DB 연결이 같은 PostgreSQL API credential source를 선택할 수 있는 Helm 값을 추가한다.
- Web 프로세스의 federation/system 전용 DB connection에만 별도 system credential source를 제공하고 API 기본 연결을 덮어쓰지 않는다.
- 기존 values를 사용하는 render와 runtime은 현재 owner Secret, username과 read-write endpoint를 그대로 유지한다.
- API/system 역할 경계는 password Secret 계약과 향후 Vault PKI가 제공할 file-based PostgreSQL 환경 계약을 선택적으로 받을 수 있다.
- Production migration Job의 별도 owner credential 경계를 runtime 선택 값과 명시적으로 분리해 유지한다.
- API/system credential 선택은 image 변경과 서로 독립적으로 opt-in 및 rollback할 수 있다.
- 실제 Secret 값 생성, PostgreSQL 역할 provisioning, API/system credential 전환과 RLS 전환은 포함하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 문서 없음. PostgreSQL workload credential 선택은 내부 배포 계약이다.
- Linear Contract: `PROD-709`
- Linear Implementations: `PROD-709`

## Capabilities

### New Capabilities

- `workload-postgres-credential-selection`: API, system 및 migration PostgreSQL credential 경계와 additive workload별 선택·rollback 계약.

### Modified Capabilities

없음.

## Impact

- `apps/helm/values.yaml`: 비활성 기본값을 가진 API/system 역할별 PostgreSQL credential 입력.
- `apps/helm/templates/_helpers.tpl`: runtime credential의 기본 owner fallback과 opt-in render helpers.
- `apps/helm/templates/api/rollout.yaml`, `apps/helm/templates/web/rollout.yaml`: workload별 PostgreSQL 환경 주입.
- `apps/helm/templates/database-migration-job.yaml`: runtime 선택과 독립된 migration owner 연결 보존.
- Helm lint/render 회귀 검증: 기존 values 동일성, API/Web BFF 공유 source, Web-only system 입력, password/file 계약과 selector별 rollback.
- 후속 blocker: `PROD-715`, `PROD-716`. 이 change는 두 이슈의 실제 credential 전환을 구현하지 않는다.
