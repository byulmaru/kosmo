## ADDED Requirements

### Requirement: 기본 활성 Business Worker Helm component

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-730` Kosmo Helm chart는 실제 Reply Workflow/Activity와 `kosmo` task queue가 등록된 Worker Deployment와 전용 ServiceAccount를 기본 활성 상태로 제공해야 한다(MUST). dev는 1개, prod는 2개의 replica를 기본값으로
render하고, 공통 runtime image의 Worker command, HTTP liveness/readiness probe, 환경별 Temporal
endpoint·namespace를 전달해야 한다(MUST). component는 명시적 override로 비활성화할 수 있어야 한다(MUST).

#### Scenario: dev 기본 Helm render

- **WHEN** dev chart를 Worker override 없이 render한다
- **THEN** 1개 replica, Worker command, HTTP probes와 dev Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 render된다

#### Scenario: prod 기본 Helm render

- **WHEN** prod chart를 Worker override 없이 render한다
- **THEN** 2개 replica, Worker command, HTTP probes와 prod Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 render된다

#### Scenario: Worker component rollback override

- **WHEN** 운영자가 Worker component를 명시적으로 비활성화해 chart를 render한다
- **THEN** Worker Deployment와 ServiceAccount가 생성되지 않는다

## REMOVED Requirements

### Requirement: 기본 비활성 Worker Helm component

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-730`

**Reason**: foundation 단계에는 business registration이 없어 Worker를 기본 비활성으로 유지했지만,
PROD-722가 실제 Reply Workflow/Activity와 task queue를 등록하므로 기본 비활성 전제가 더 이상 성립하지 않는다.

**Migration**: 기존 dev/prod replica, command, probe와 Temporal namespace 입력을 유지한 환경 중립 Business Worker
component를 기본 활성화한다. 긴급 rollback은 기존 `worker.enabled` override를 false로 설정한다.
