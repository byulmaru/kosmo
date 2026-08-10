## MODIFIED Requirements

### Requirement: 애플리케이션 전환과 독립된 배포 및 rollback

**Authority / Provenance**: Linear `PROD-728`, 병렬 경계 `PROD-708`, 활성화 `PROD-726`, 제외 범위 `PROD-716`.

Pooler 리소스는 MUST CloudNativePG Cluster 및 direct read-write Service와 독립적으로 유지된다. PROD-726 활성화에서 API `DATABASE_URL`은 MUST 기존 direct read-write Service를 사용하고, GraphQL operation 전용 `OPERATION_DATABASE_URL`만 MUST Pooler Service `<release>-postgres-pooler-rw:5432`를 사용한다. `postgres.credentials.api` trio가 구성된 경우 rendered API/operation URL은 MUST 같은 username, database와 password Secret source, scheme, path와 query를 유지하고, operation URL의 host와 port를 포함한 authority만 MUST in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체한다. Runtime operation client는 URL query에서 `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout` 세 key만 제거하고 unrelated query parameter는 유지해야 한다(MUST). 새 credential selector를 만들거나 PostgreSQL credential, role, RLS policy·grant를 변경해서는 안 된다(MUST NOT). Web BFF, worker와 migration workload는 MUST 기존 direct read-write Service와 credential을 유지한다. 실패 시 운영자는 MUST 전체 activation merge/squash revision을 Git revert해 pre-activation tree를 배포해야 하며, 그 tree에서 API `DATABASE_URL`은 direct Service를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code는 없어야 한다. PROD-728 Pooler 리소스와 Cluster, Web/worker/migration traffic은 MUST 유지한다.

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
- **AND** rendered `OPERATION_DATABASE_URL`은 같은 username, database와 Secret source, scheme, path와 query를 사용하고 host와 port를 포함한 authority만 `<release>-postgres-pooler-rw:5432`로 교체한다
- **AND** Runtime operation client는 세 timeout query key만 제거하고 `application_name` 같은 unrelated query parameter를 유지한다
- **AND** 새 credential selector나 role 전환은 렌더되지 않는다

#### Scenario: Pooler resource lifecycle을 별도로 관리한다

- **WHEN** API가 direct endpoint를 사용하는 상태에서 Pooler manifest만 배포하거나 제거한다
- **THEN** Cluster, direct read-write Service와 이를 사용하는 workload는 계속 유지된다

### Requirement: direct와 Pooler operation의 PostgreSQL timeout 초기화를 분리한다

**Authority / Provenance**: `docs/operations/postgres-session-pool.md`, Linear PROD-726, dev merge revision `de6034d3`.

API `DATABASE_URL` direct client는 기존 `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout` server startup 옵션과 값을 유지해야 한다(MUST). GraphQL operation `OPERATION_DATABASE_URL` Pooler client는 PgBouncer가 지원하지 않는 이 server timeout startup parameter를 보내서는 안 된다(MUST NOT). Operation client가 실제 frontend connection을 만든 뒤 actor GUC와 세 timeout을 하나의 initialization SQL round trip에서 session-level로 설정해야 하며(MUST), 성공하기 전에는 resolver를 실행해서는 안 된다(MUST NOT). 이 forward fix는 endpoint authority, credential/Secret selector, Pooler CR, replica, resource와 capacity를 변경하지 않는다(MUST NOT).

#### Scenario: Pooler가 지원하지 않는 startup parameter를 제거한다

- **WHEN** GraphQL operation client가 `OPERATION_DATABASE_URL` Pooler endpoint에 연결한다
- **THEN** `idle_in_transaction_session_timeout`, `lock_timeout`, `statement_timeout`을 startup parameter로 전송하지 않는다
- **AND** actor GUC와 세 timeout을 같은 session initialization SQL round trip에서 설정한다
- **AND** 초기화 성공 전에 resolver SQL을 실행하지 않는다

#### Scenario: direct client의 timeout 경계를 유지한다

- **WHEN** API request authentication 또는 startup/bootstrap이 `DATABASE_URL` direct client를 사용한다
- **THEN** 기존 세 server timeout startup 옵션과 값이 유지된다
- **AND** Web BFF, worker, migration, endpoint/credential Secret ref와 Pooler resource 설정은 변경되지 않는다

#### Scenario: unsupported startup log가 있으면 live gate를 실패시킨다

- **WHEN** forward fix release를 dev에 배포한 뒤 current API Pod 로그를 확인한다
- **THEN** PgBouncer unsupported startup-parameter 오류가 없어야 한다
- **AND** 익명·Account-only·Account+Profile GraphQL smoke가 초기화 HTTP 500 없이 기대한 결과를 반환해야 한다
