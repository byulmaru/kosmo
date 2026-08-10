## MODIFIED Requirements

### Requirement: 애플리케이션 전환과 독립된 배포 및 rollback

**Authority / Provenance**: Linear `PROD-728`, 병렬 경계 `PROD-708`, 활성화 `PROD-726`, 제외 범위 `PROD-716`.

Pooler 리소스는 MUST CloudNativePG Cluster 및 direct read-write Service와 독립적으로 유지된다. PROD-726 활성화에서 API `DATABASE_URL`은 MUST 기존 direct read-write Service를 사용하고, GraphQL operation 전용 `OPERATION_DATABASE_URL`만 MUST Pooler Service `<release>-postgres-pooler-rw:5432`를 사용한다. `postgres.credentials.api` trio가 구성된 경우 API와 operation URL은 MUST 같은 username, database와 password Secret source, scheme, path와 query를 유지하고, operation URL의 host와 port를 포함한 authority만 MUST in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체한다. 새 credential selector를 만들거나 PostgreSQL credential, role, RLS policy·grant를 변경해서는 안 된다(MUST NOT). Web BFF, worker와 migration workload는 MUST 기존 direct read-write Service와 credential을 유지한다. 실패 시 운영자는 MUST 전체 activation merge/squash revision을 Git revert해 pre-activation tree를 배포해야 하며, 그 tree에서 API `DATABASE_URL`은 direct Service를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code는 없어야 한다. PROD-728 Pooler 리소스와 Cluster, Web/worker/migration traffic은 MUST 유지한다.

#### Scenario: API operation만 Pooler로 전환한다

- **WHEN** PROD-726 application activation을 지원되는 환경에 배포한다
- **THEN** API `DATABASE_URL`은 `<release>-postgres-rw`를 사용한다
- **AND** API `OPERATION_DATABASE_URL`은 `<release>-postgres-pooler-rw`를 사용한다
- **AND** Web BFF, worker와 migration workload는 `<release>-postgres-rw`를 계속 사용한다
- **AND** workload의 PostgreSQL Secret 참조는 변경되지 않는다

#### Scenario: 전체 activation revision을 direct Service 경계로 rollback한다

- **WHEN** 운영자가 PROD-726 전체 activation merge/squash revision을 Git revert하고 pre-activation revision을 배포한다
- **THEN** API `DATABASE_URL`은 기존 `<release>-postgres-rw` direct endpoint를 유지한다
- **AND** API `OPERATION_DATABASE_URL` env와 operation plugin/code는 pre-activation revision에 존재하지 않는다
- **AND** Web BFF, worker, migration workload, Cluster, direct Service와 PROD-728 Pooler 리소스는 유지된다

#### Scenario: configured API trio를 operation endpoint에서 재사용한다

- **WHEN** `postgres.credentials.api`의 URL과 password Secret trio가 구성된 상태에서 API activation을 렌더한다
- **THEN** API `DATABASE_URL`은 제공된 direct URL의 username, database, authority와 Secret source를 유지한다
- **AND** `OPERATION_DATABASE_URL`은 같은 username, database와 Secret source, scheme, path와 query를 사용하고 host와 port를 포함한 authority만 `<release>-postgres-pooler-rw:5432`로 교체한다
- **AND** 새 credential selector나 role 전환은 렌더되지 않는다

#### Scenario: Pooler resource lifecycle을 별도로 관리한다

- **WHEN** API가 direct endpoint를 사용하는 상태에서 Pooler manifest만 배포하거나 제거한다
- **THEN** Cluster, direct read-write Service와 이를 사용하는 workload는 계속 유지된다
