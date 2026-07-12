## ADDED Requirements

### Requirement: Runtime migration command

dev에 배포되는 runtime image는 애플리케이션 server 시작과 분리된 명시적 migration command로 image에 포함된 Drizzle SQL migration을 대상 PostgreSQL에 적용해야 한다(MUST).

#### Scenario: Pending migration 적용

- **WHEN** runtime migration command가 미적용 migration이 있는 dev database를 대상으로 실행된다
- **THEN** 시스템은 migration을 version control 순서대로 적용한다
- **AND** 시스템은 성공적으로 적용된 migration을 Drizzle migration history에 기록한다
- **AND** 시스템은 기존 domain data를 reset하거나 schema 전체를 재생성하지 않는다

#### Scenario: Pending migration 없는 실행

- **WHEN** runtime migration command가 모든 migration이 적용된 dev database를 대상으로 실행된다
- **THEN** 시스템은 domain schema와 data를 변경하지 않고 성공한다

#### Scenario: Migration 실패

- **WHEN** SQL migration이 실패한다
- **THEN** migration command는 실패 exit status를 반환한다
- **AND** 실패한 migration을 적용 완료로 기록하지 않는다

### Requirement: Migration 단일 실행

시스템은 PostgreSQL advisory lock을 사용해 같은 database에서 migration runner가 동시에 하나만 migration을 실행하도록 보장해야 한다(MUST).

#### Scenario: Lock 획득 성공

- **WHEN** 실행 중인 다른 migration runner가 없는 상태에서 runner가 시작된다
- **THEN** runner는 migration 전용 advisory lock을 획득한다
- **AND** migration 완료 또는 database session 종료 시 lock을 해제한다

#### Scenario: 동시 runner 거부

- **WHEN** 다른 runner가 migration advisory lock을 보유한 상태에서 새 runner가 시작된다
- **THEN** 새 runner는 lock 해제를 기다리지 않고 migration을 중복 실행하지 않는다
- **AND** 새 runner는 명시적인 실패 exit status를 반환한다

### Requirement: Dev PreSync migration Job

dev Helm release는 API 또는 web container의 startup/initContainer와 분리된 단일 Kubernetes Job으로 runtime migration command를 실행해야 한다(MUST).

#### Scenario: Argo full sync의 migration 선행 실행

- **WHEN** dev application에 Argo CD full sync가 시작된다
- **THEN** Argo CD는 application resource sync 전에 migration Job을 `PreSync` hook으로 실행한다
- **AND** Job은 dev workload와 같은 `latest` image reference를 사용한다
- **AND** Job은 단일 Pod에서 재시작 없이 migration command를 실행한다

#### Scenario: Migration Job 실패

- **WHEN** migration Job이 실패한다
- **THEN** Argo CD sync는 실패한다
- **AND** dev deployment workflow는 API와 web Rollout restart를 실행하지 않는다

### Requirement: Migration-gated dev rollout

Deploy Dev workflow는 Docker Build 성공 후 migration을 포함한 Argo CD full sync를 완료하고, 성공한 경우에만 API와 web Rollout을 restart해야 한다(MUST).

#### Scenario: Migration 성공 후 rollout

- **WHEN** Docker Build가 성공하고 Argo CD full sync와 migration Job이 성공한다
- **THEN** deployment workflow는 `kosmo-api`와 `kosmo-web` Rollout restart를 실행한다

#### Scenario: Dev deploy 직렬 실행

- **WHEN** migration-aware dev deployment가 실행 중인 동안 새 Docker Build가 완료된다
- **THEN** 시스템은 실행 중 deployment를 취소하지 않는다
- **AND** 같은 environment의 migration-aware deployment를 동시에 실행하지 않는다

#### Scenario: Dev downtime 허용

- **WHEN** 기존 workload와 호환되지 않는 migration을 dev에 적용한다
- **THEN** 시스템은 migration과 새 `latest` workload restart 사이의 일시적인 dev 오류를 허용한다
- **AND** 시스템은 production 수준의 무중단 호환 또는 rollback 보장을 이 dev workflow에서 제공하지 않는다
