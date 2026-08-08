## 1. PROD-728 Additive PostgreSQL session pool

**Authority / Provenance**

- Linear `PROD-728`
- 병렬·후속 경계 Linear `PROD-708`, `PROD-726`, `PROD-716`
- 운영 맥락 `docs/operations/production-migrations.md`, `docs/operations/postgres-backup.md`

**Deliverable**

기존 CloudNativePG direct endpoint와 workload 연결에 영향 없이 별도 read-write PgBouncer session pool을 배포·관찰·rollback할 수 있다.

**Guardrails**

- Pooler는 session mode와 `DISCARD ALL` reset을 사용하고 기존 Cluster와 다른 이름의 별도 Service를 제공한다.
- client/server connection limit, 환경별 replica와 container resource request/limit를 명시한다.
- 기존 API/Web database endpoint·Secret, GraphQL operation lifecycle, actor GUC, RLS/role/grant와 credential을 변경하지 않는다.
- Pooler만 제거해 기존 direct workload에 영향 없이 rollback할 수 있어야 한다.
- 별도 monitoring CR이나 metrics Service port를 추측해 추가하지 않고 CloudNativePG readiness와 exporter 경계를 사용한다.

**Verification**

- dev/prod Helm lint와 render에서 Pooler Cluster 참조, `rw`/`session`, reset, limit, replica/resources를 확인한다.
- render diff에서 기존 Cluster와 API/Web `DATABASE_URL`·Secret 참조가 유지되고 Pooler만 additive한지 확인한다.
- 지원되는 cluster에서 server-side dry-run 뒤 Pooler/Deployment/Pod/Service readiness를 확인한다.
- live 두-client test에서 client session 동안 backend identity가 유지되고 첫 client 종료 뒤 test GUC가 다음 client에 남지 않는지 확인한다.
- exporter metrics에서 pool mode, client waiting, server active/idle와 max wait를 확인한다.

- [x] 1.1 session mode, reset, capacity, replica와 resource 경계를 가진 additive read-write Pooler를 Helm에 구현한다.
- [x] 1.2 readiness, session affinity/reset, exporter metrics와 Pooler-only rollback 검증 절차를 운영 문서에 추가한다.
- [x] 1.3 dev/prod lint·render와 OpenSpec strict validation을 통과하고 기존 workload endpoint/credential 불변을 정적으로 검증한다.
- [x] 1.4 배포된 환경에서 admission/readiness, session affinity/reset와 exporter metrics를 검증하고 PROD-728에 비민감 근거를 기록한다.
