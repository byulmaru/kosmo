## Why

GraphQL operation별 session-level RLS actor context를 후속 전환에서 안전하게 사용할 수 있도록, 현재 direct PostgreSQL 연결과 독립된 PgBouncer session pooling access layer가 먼저 필요하다. PROD-728은 애플리케이션 트래픽이나 credential을 바꾸지 않고 이 기반만 additive하게 준비한다.

## What Changes

- 기존 CloudNativePG Cluster의 read-write Service를 대상으로 하는 별도 `Pooler`와 Service를 선언한다.
- PgBouncer를 session pooling mode로 고정하고 client 반환 시 `DISCARD ALL`로 backend session state를 초기화한다.
- client/server connection limit, replica와 resource 기본값을 선언하고 Pooler readiness와 PgBouncer metrics를 관찰할 수 있게 한다.
- 기존 API/Web `DATABASE_URL`, direct PostgreSQL Service, credential과 GraphQL DB lifecycle은 유지한다.
- Pooler 리소스만 제거해 기존 workload에 영향 없이 rollback할 수 있는 경계를 문서화하고 검증한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 변경 없음. 운영 맥락은 `docs/operations/production-migrations.md`, `docs/operations/postgres-backup.md`를 따른다.
- Linear Contract: `PROD-728`
- Linear Implementations: `PROD-728`; 병렬 경계 `PROD-708`; 후속 활성화 `PROD-726`; 제외되는 credential 전환 `PROD-716`

## Capabilities

### New Capabilities

- `postgres-session-pool`: 기존 direct endpoint와 독립된 CloudNativePG PgBouncer session pool의 선언, reset, 관측과 rollback 계약

### Modified Capabilities

없음.

## Impact

- `apps/helm`: CloudNativePG `Pooler` template, values와 이름 helper
- 운영 검증: Pooler/Service readiness, session affinity/reset, Prometheus metrics 확인 절차
- Kubernetes: 기존 Cluster와 같은 namespace의 additive read-write PgBouncer Deployment/Service
- API/Web, GraphQL, PostgreSQL role·credential, RLS policy와 기존 direct `-rw` Service에는 변경 없음
