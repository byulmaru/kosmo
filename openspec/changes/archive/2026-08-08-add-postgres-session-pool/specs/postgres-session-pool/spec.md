## ADDED Requirements

### Requirement: Additive read-write session pool

**Authority / Provenance:** Linear `PROD-728`; 이 요구사항을 MUST 준수한다.

시스템은 MUST 기존 CloudNativePG Cluster의 primary read-write 경로를 대상으로 하는 별도 PgBouncer Pooler와 Service를 선언한다. Pooler는 MUST `session` mode를 사용하고 기존 direct PostgreSQL Service를 대체하거나 제거하지 않는다.

#### Scenario: Helm이 별도 session pool을 렌더링한다

- **WHEN** 운영자가 지원되는 환경 값으로 Helm chart를 렌더링한다
- **THEN** 기존 Cluster를 참조하는 read-write Pooler가 `session` mode와 별도 Service 이름으로 나타난다
- **THEN** 기존 CloudNativePG Cluster와 direct read-write Service 선언은 유지된다

#### Scenario: Client session 동안 backend session이 유지된다

- **WHEN** client가 Pooler Service에 연결해 같은 session에서 backend process identity와 session state를 연속 조회한다
- **THEN** client가 연결을 닫을 때까지 같은 backend PostgreSQL session이 사용된다

### Requirement: 반환된 session state 초기화

**Authority / Provenance:** Linear `PROD-728`; 이 요구사항을 MUST 준수한다.

PgBouncer는 MUST client session이 반환한 backend connection을 다른 client에게 제공하기 전에 `DISCARD ALL`로 session state를 초기화한다. 이 reset 경계는 MUST actor GUC를 포함한 이전 client의 session state가 다음 client로 유출되지 않음을 검증할 수 있게 한다.

#### Scenario: 다음 client가 이전 GUC를 관찰하지 못한다

- **WHEN** 첫 client가 session-level test GUC를 설정하고 연결을 종료한 뒤 다른 client가 재사용 가능한 Pooler connection으로 연결한다
- **THEN** 두 번째 client는 첫 client의 test GUC 값을 관찰하지 못한다

### Requirement: 명시적인 capacity와 availability 기본값

**Authority / Provenance:** Linear `PROD-728`; 이 요구사항을 MUST 준수한다.

Pooler 선언은 MUST PgBouncer의 최대 client connection 수와 user/database pair별 기본 server pool 크기, replica 수와 container resource request/limit를 명시한다. 값은 MUST Helm values에서 검토·조정 가능하고, 비정상 Pooler Pod는 Service readiness에서 제외될 수 있다.

#### Scenario: 기본 capacity와 resource 경계를 렌더링한다

- **WHEN** 별도 override 없이 chart를 렌더링한다
- **THEN** Pooler에 최대 client 수, 기본 server pool 크기, replica 수와 PgBouncer resource request/limit가 모두 명시된다

### Requirement: readiness와 pool 사용 상태 관찰

**Authority / Provenance:** Linear `PROD-728`; 이 요구사항을 MUST 준수한다.

운영자는 MUST Kubernetes Pooler, Deployment, Pod와 Service 상태에서 access layer readiness를 확인할 수 있다. 운영자는 MUST CloudNativePG가 노출하는 PgBouncer metrics에서 session pool mode, active/waiting client, active/idle server와 최대 대기 시간을 관찰할 수 있다.

#### Scenario: Pooler 상태와 metrics를 확인한다

- **WHEN** Pooler가 배포되고 metrics endpoint가 수집된다
- **THEN** 운영자는 Pooler/Deployment/Pod/Service readiness와 pool mode, client 대기, server 사용량, 최대 대기 지표를 확인할 수 있다

### Requirement: 애플리케이션 전환과 독립된 배포 및 rollback

**Authority / Provenance:** Linear `PROD-728`, 병렬 경계 `PROD-708`, 후속 활성화 `PROD-726`, 제외 범위 `PROD-716`; 이 요구사항을 MUST 준수한다.

이 변경은 MUST API/Web `DATABASE_URL`, PostgreSQL credential, GraphQL operation connection lifecycle, actor GUC 설정, RLS policy·grant를 변경하지 않는다. 기존 workload는 MUST direct read-write Service를 계속 사용한다. 운영자는 MUST Pooler 리소스만 배포하거나 제거해 애플리케이션 트래픽과 독립적으로 rollout 및 rollback할 수 있다.

#### Scenario: Pooler를 추가해도 workload 연결은 유지된다

- **WHEN** 기존 환경에 Pooler manifest를 추가해 배포한다
- **THEN** API/Web가 렌더링하는 database endpoint와 Secret 참조는 배포 전과 동일한 direct 경계를 유지한다

#### Scenario: Pooler만 제거한다

- **WHEN** 운영자가 이 변경을 rollback해 Pooler 리소스를 제거한다
- **THEN** 기존 Cluster, direct read-write Service와 이를 사용하는 API/Web workload는 계속 유지된다
