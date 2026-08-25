## MODIFIED Requirements

### Requirement: Dev Sync migration Job

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`, `PROD-831`. Dev Helm release는 API 또는 web container의 startup/initContainer와 분리된 단일 Kubernetes Job으로 runtime migration command를 실행해야 한다(MUST). Job은 같은 source full SHA와 build identity에서 생성·검증된 runtime release set의 전용 `migration` image를 사용해야 하며(MUST), API, Web, Temporal Worker와 Fedify Consumer workload는 같은 release set의 각 지정 image를 사용해야 한다(MUST). Migration Job이 성공하기 전에는 해당 release set의 workload를 교체하거나 활성화해서는 안 된다(MUST NOT).

#### Scenario: Argo full sync의 migration-gated workload 교체

- **WHEN** dev application에 같은 source full SHA와 build identity를 가진 runtime image release set으로 Argo CD full sync가 시작된다
- **THEN** Argo CD는 기반 리소스를 적용한 뒤 release set의 전용 `migration` image를 사용하는 migration Job을 `Sync` wave 1 hook으로 실행한다
- **AND** dev workload는 migration Job이 성공한 뒤 wave 2에서 교체된다
- **AND** API, Web, Temporal Worker와 Fedify Consumer workload는 release set에서 각자 지정된 image reference를 사용한다
- **AND** Job은 단일 Pod에서 재시작 없이 migration command를 실행한다

#### Scenario: Runtime release set 불일치

- **WHEN** migration image 또는 workload image가 source full SHA·build identity가 서로 다른 release set에서 전달되거나 지정 image가 누락된다
- **THEN** Helm render 또는 Argo CD sync는 workload activation 전에 실패한다
- **AND** migration Job은 다른 release set의 image를 사용해 실행하거나 성공을 가장하지 않는다

#### Scenario: Migration Job 실패

- **WHEN** migration Job이 실패한다
- **THEN** Argo CD sync는 실패한다
- **AND** dev deployment workflow는 API와 web Rollout 및 background Deployment restart를 실행하지 않는다

### Requirement: Migration-gated dev rollout

Deploy Dev workflow는 같은 source full SHA와 build identity에서 생성된 runtime image release set의 Docker Build와 검증이 성공한 후 migration을 포함한 Argo CD full sync를 완료하고, 성공한 경우에만 API와 web Rollout 및 렌더된 background Deployment를 restart해야 한다(MUST).

#### Scenario: Migration 성공 후 rollout

- **WHEN** runtime image release set의 Docker Build·검증이 성공하고 Argo CD full sync와 migration Job이 성공한다
- **THEN** deployment workflow는 release set의 지정 image를 사용해 `kosmo-api`와 `kosmo-web` Rollout 및 렌더된 background Deployment의 restart를 실행한다

#### Scenario: Dev deploy 직렬 실행

- **WHEN** migration-aware dev deployment가 실행 중인 동안 새 runtime image release set build가 완료된다
- **THEN** 시스템은 실행 중 deployment를 취소하지 않는다
- **AND** 같은 environment의 migration-aware deployment를 동시에 실행하지 않는다

#### Scenario: Dev downtime 허용

- **WHEN** 기존 workload와 호환되지 않는 migration을 dev에 적용한다
- **THEN** 시스템은 migration과 새 release set workload restart 사이의 일시적인 dev 오류를 허용한다
- **AND** 시스템은 production 수준의 무중단 호환 또는 rollback 보장을 이 dev workflow에서 제공하지 않는다
