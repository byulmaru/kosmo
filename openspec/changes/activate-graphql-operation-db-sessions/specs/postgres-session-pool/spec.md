## MODIFIED Requirements

### Requirement: 애플리케이션 전환과 독립된 배포 및 rollback

**Authority / Provenance**: Linear `PROD-728`, 병렬 경계 `PROD-708`, 활성화 `PROD-726`, 제외 범위 `PROD-716`.

Pooler 리소스는 MUST CloudNativePG Cluster 및 direct read-write Service와 독립적으로 유지된다. PROD-726 활성화에서 API `DATABASE_URL`은 MUST 현재 owner-compatible fallback인 기존 direct read-write Service를 사용하며 향후 API/Web principal 방향을 결정하지 않고, GraphQL operation 전용 `OPERATION_DATABASE_URL`만 MUST Pooler Service `<release>-postgres-pooler-rw:5432`를 사용한다. `postgres.credentials.api` trio가 구성된 경우 rendered API/operation URL은 MUST 현재 전환에서 같은 username, database와 password Secret source, scheme, path와 query를 유지하고, operation URL의 host와 port를 포함한 authority만 MUST in-chart Pooler Service `<release>-postgres-pooler-rw:5432`로 교체한다. Runtime operation client는 API direct DB client의 `connection` startup options를 상속해서는 안 되며(MUST NOT), configured `OPERATION_DATABASE_URL`을 변경 없이 사용해야 하고 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정해서는 안 된다(MUST NOT). 새 credential selector를 만들거나 PostgreSQL credential, role, RLS policy·grant를 변경해서는 안 된다(MUST NOT). Web BFF baseline과 migration workload는 MUST 이 change에서 기존 direct read-write Service를 유지한다. #564의 CloudNativePG PgBouncer TLS/Vault/VSO static SCRAM 기반 선택적 trusted Worker `WORKER_DATABASE_*` seam은 MUST 이 GraphQL operation 경계에서 사용하지 않고 `OPERATION_DATABASE_URL`에 공급하지 않는다. API/Web principal transition은 MUST PROD-716이 소유하며, 취소된 client-certificate/direct-rw 대안 PROD-470은 재개하지 않는다. 실패 시 운영자는 MUST 전체 activation merge/squash revision을 Git revert해 pre-activation tree를 배포해야 하며, 그 tree에서 API `DATABASE_URL`은 current fallback direct Service를 유지하고 `OPERATION_DATABASE_URL` env와 operation plugin/code는 없어야 한다. PROD-728 Pooler 리소스와 Cluster, Web BFF baseline, migration traffic은 MUST 유지한다.

#### Scenario: API operation만 Pooler로 전환한다

- **WHEN** PROD-726 application activation을 지원되는 환경에 배포한다
- **THEN** API `DATABASE_URL`은 `<release>-postgres-rw`를 사용한다
- **AND** API `OPERATION_DATABASE_URL`은 `<release>-postgres-pooler-rw`를 사용한다
- **AND** Web BFF baseline과 migration workload는 `<release>-postgres-rw`를 계속 사용한다
- **AND** #564 `WORKER_DATABASE_*` seam은 `OPERATION_DATABASE_URL`에 공급되지 않는다
- **AND** workload의 PostgreSQL Secret 참조는 변경되지 않는다

#### Scenario: 전체 activation revision을 direct Service 경계로 rollback한다

- **WHEN** 운영자가 PROD-726 전체 activation merge/squash revision을 Git revert하고 pre-activation revision을 배포한다
- **THEN** API `DATABASE_URL`은 기존 `<release>-postgres-rw` direct endpoint를 유지한다
- **AND** API `OPERATION_DATABASE_URL` env와 operation plugin/code는 pre-activation revision에 존재하지 않는다
- **AND** Web BFF baseline, migration workload, Cluster, direct Service와 PROD-728 Pooler 리소스는 유지된다
- **AND** #564 trusted Worker seam과 API/Web principal transition(PROD-716)은 변경되지 않는다

#### Scenario: configured API trio를 operation endpoint에서 재사용한다

- **WHEN** `postgres.credentials.api`의 URL과 password Secret trio가 구성된 상태에서 API activation을 렌더한다
- **THEN** API `DATABASE_URL`은 제공된 direct URL의 username, database, authority와 Secret source를 유지한다
- **AND** rendered `OPERATION_DATABASE_URL`은 같은 username, database와 Secret source, scheme, path와 query를 사용하고 host와 port를 포함한 authority만 `<release>-postgres-pooler-rw:5432`로 교체한다
- **AND** Runtime operation client는 configured `OPERATION_DATABASE_URL`을 변경 없이 사용하며 호환되지 않는 URL을 자동 보정하지 않는다
- **AND** 새 credential selector나 role 전환은 렌더되지 않는다

#### Scenario: Pooler resource lifecycle을 별도로 관리한다

- **WHEN** API가 direct endpoint를 사용하는 상태에서 Pooler manifest만 배포하거나 제거한다
- **THEN** Cluster, direct read-write Service와 이를 사용하는 workload는 계속 유지된다

### Requirement: direct와 Pooler operation의 startup parameter 경계를 분리한다

**Authority / Provenance**: `docs/operations/postgres-session-pool.md`, Linear PROD-726, dev merge revision `de6034d3`.

API `DATABASE_URL` direct client의 기존 server timeout startup 동작은 변경하지 않으며 이 change의 범위 밖으로 둔다(MUST). GraphQL operation `OPERATION_DATABASE_URL` Pooler client는 API direct DB client의 `connection` startup options를 상속해서는 안 된다(MUST NOT). Configured operation URL은 변경 없이 사용해야 하며 runtime은 query parameter를 변경하거나 호환되지 않는 URL을 자동 보정해서는 안 된다(MUST NOT). Operation client가 실제 frontend connection을 만든 뒤 actor GUC만 하나의 initialization SQL round trip에서 session-level로 설정해야 하며(MUST), 성공하기 전에는 resolver를 실행해서는 안 된다(MUST NOT). 연결 대기는 postgres.js의 기본 bounded connection timeout 동작에 맡기며 application-selected timeout 숫자를 추가하지 않는다(MUST NOT). 이 forward fix는 endpoint authority, credential/Secret selector, Pooler CR, replica, resource와 capacity를 변경하지 않는다(MUST NOT).

#### Scenario: operation client가 direct startup options를 상속하지 않는다

- **WHEN** GraphQL operation client가 `OPERATION_DATABASE_URL` Pooler endpoint에 연결한다
- **THEN** operation client는 API direct DB client의 `connection` startup options를 상속하지 않는다
- **AND** configured `OPERATION_DATABASE_URL`은 변경 없이 사용하며 호환되지 않는 URL을 자동 보정하지 않는다
- **AND** actor GUC만 같은 session initialization SQL round trip에서 설정한다
- **AND** 초기화 성공 전에 resolver SQL을 실행하지 않는다

#### Scenario: direct client의 timeout 경계를 유지한다

- **WHEN** API request authentication 또는 startup/bootstrap이 `DATABASE_URL` direct client를 사용한다
- **THEN** 기존 server timeout startup 동작은 변경되지 않는다
- **AND** Web BFF baseline, migration, endpoint/credential Secret ref와 Pooler resource 설정은 변경되지 않는다
- **AND** #564 trusted Worker seam은 이 operation 경계에서 사용하지 않는다

#### Scenario: unsupported startup log가 있으면 live gate를 실패시킨다

- **WHEN** forward fix release를 dev에 배포한 뒤 current API Pod 로그를 확인한다
- **THEN** PgBouncer unsupported startup-parameter 오류가 없어야 한다
- **AND** 익명·Account-only·Account+Profile GraphQL smoke가 초기화 HTTP 500 없이 기대한 결과를 반환해야 한다
