## MODIFIED Requirements

### Requirement: 애플리케이션 전환과 독립된 배포 및 rollback

**Authority / Provenance**: Linear `PROD-728`, 병렬 경계 `PROD-708`, 활성화 `PROD-726`, 제외 범위 `PROD-716`.

Pooler 리소스는 MUST CloudNativePG Cluster 및 direct read-write Service와 독립적으로 유지된다. PROD-726 활성화에서 GraphQL operation을 실행하는 API workload만 MUST Pooler Service를 database endpoint로 사용한다. Web BFF, worker와 migration workload는 MUST 기존 direct read-write Service와 credential을 유지한다. 이 활성화는 MUST PostgreSQL credential, RLS policy·grant를 변경하지 않는다. 운영자는 MUST API endpoint만 direct Service로 되돌려 Pooler 리소스와 Web/worker/migration traffic에 영향 없이 rollback할 수 있다.

#### Scenario: API workload만 Pooler로 전환한다

- **WHEN** PROD-726 application activation을 지원되는 환경에 배포한다
- **THEN** API workload의 database endpoint는 `<release>-postgres-pooler-rw`를 사용한다
- **AND** Web BFF, worker와 migration workload는 `<release>-postgres-rw`를 계속 사용한다
- **AND** workload의 PostgreSQL Secret 참조는 변경되지 않는다

#### Scenario: API endpoint를 direct Service로 rollback한다

- **WHEN** 운영자가 PROD-726 application activation을 rollback한다
- **THEN** API workload만 기존 `<release>-postgres-rw` endpoint로 되돌아간다
- **AND** Web BFF, worker, migration workload, Cluster, direct Service와 Pooler 리소스는 유지된다

#### Scenario: Pooler resource lifecycle을 별도로 관리한다

- **WHEN** API가 direct endpoint를 사용하는 상태에서 Pooler manifest만 배포하거나 제거한다
- **THEN** Cluster, direct read-write Service와 이를 사용하는 workload는 계속 유지된다
