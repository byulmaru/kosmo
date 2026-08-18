## Why

현재 production 배포는 장기 `production` 브랜치에 변경을 다시 전달해야 시작되어 `main` merge와 실제 배포 source가 분리되고, 긴급한 비-main commit을 명시적으로 승인해 배포할 경로도 없다. `main`의 각 merge에서 dev 배포는 유지하되 production checkout·credential·build·상태 변경은 `prod` Environment 승인 뒤 하나의 gated job에서 실행하고, 예외적으로 정확한 commit SHA를 선택하는 감사 가능한 수동 경로를 제공해야 한다.

## What Changes

- **BREAKING** 장기 `production` 브랜치 PR merge·push 기반 release를 폐기하고 `main` push의 immutable SHA를 기본 production source로 사용한다.
- `main` push에서 기존 dev image는 자동 build·배포하고, production 경로는 `prod` Environment 승인 대기만 만든다. 승인 전에는 production source checkout, Vault/ECR/Sentry credential 접근과 prod image build를 실행하지 않는다.
- `prod` 승인 뒤 하나의 gated job이 main event의 immutable full SHA를 checkout하고 prod image를 build한 뒤, 같은 SHA와 그 build digest로 migration과 모든 production workload를 배포한다.
- Main에 저장된 workflow를 수동 실행해 repository의 정확한 40자리 commit SHA를 선택하는 production release 경로를 추가한다. 임의 SHA의 code checkout, prod secret 접근, build와 deploy는 `prod` 승인 뒤에만 실행한다.
- Dev/prod 및 automatic/manual image metadata를 분리하고, 현재 production에 실제 승인·배포된 digest에만 `stable` 보존 tag를 적용한다.
- Git tag, mutable image tag와 workflow 실행 ref는 production source identity로 사용하지 않는다.
- Rollback은 DB-compatible revert를 `main`에 merge하거나 호환 가능한 immutable SHA를 수동 승인해 새 forward release로 수행하며 database history를 되돌리지 않는다.
- 기존 `adopt-production-release-branch`의 production branch source·PR 승인 결정을 이 변경으로 대체하고, live 전환 뒤 남은 obsolete task와 archive 상태를 정리한다.

## Authority / Provenance

- Canonical: 없음. 이 변경은 제품 도메인·디자인이 아니라 repository와 운영 release 계약을 변경하며, 운영 절차는 `docs/operations/production-release.md`, `docs/operations/production-migrations.md`, `docs/operations/openpanel.md`, `docs/operations/sentry.md`가 설명한다.
- Linear Contract: `PROD-783`
- Linear Implementations: `PROD-783`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `production-release`: 기본 source와 사람 승인 경계를 production PR에서 main release의 `prod` Environment 승인으로 바꾸고, 승인 뒤 임의 commit SHA를 별도 build·배포하는 수동 경로를 추가한다.

## Impact

- `.github/workflows/docker-build.yml`, `.github/workflows/deploy-dev.yml`과 production release workflow: trigger, 환경별 build, artifact·digest 전달, Environment 승인, manual SHA preflight와 concurrency
- `apps/terraform/argocd.tf`, `apps/terraform/ecr.tf`: production bootstrap source, release overlay ownership, OIDC ref trust와 image lifecycle metadata
- 외부 Vault GitHub Actions role과 GitHub `prod` Environment: exact `environment:prod` identity, required reviewer와 deployment policy
- `docs/operations/production-release.md`, `docs/operations/production-migrations.md`, `docs/operations/openpanel.md`, `docs/operations/sentry.md`, `apps/terraform/README.md`
- `openspec/specs/production-release/spec.md`, `openspec/changes/adopt-production-release-branch/**`와 관련 active production/Sentry decision 설명
