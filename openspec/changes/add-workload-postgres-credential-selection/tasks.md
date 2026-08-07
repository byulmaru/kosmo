## 1. PROD-709 API/Fedify runtime credential selector

**Authority / Provenance**

- `PROD-709`
- `PROD-369`
- `PROD-710`
- `PROD-715`
- `PROD-716`
- `PROD-719`
- `PROD-448`
- `docs/operations/production-migrations.md`
- `memory/database-migrations.md`

**Deliverable**

기존 Helm values와 workload 동작을 유지하면서 `api`/`fedify` atomic trio를 제공한다. `api` source는 API Rollout과 Web BFF 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 공유하고, `fedify` source는 Web inbound Fedify의 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`에만 additive로 렌더한다. Migration은 기존 owner fallback 및 `kosmo_migration` login → `SET ROLE kosmo` 경계를 유지한다.

**Guardrails**

- `postgres.credentials.api`와 `postgres.credentials.fedify`는 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 모두 채우거나 모두 비워야 한다. Partial 입력은 render를 실패시킨다.
- API와 Web BFF에 서로 다른 API source를 만들지 않는다. API Rollout에는 어떤 조합에서도 `FEDIFY_DATABASE_*`를 주입하지 않는다.
- Fedify source는 Web inbound Fedify env에만 추가하고 Web BFF 기본 `DATABASE_*`를 바꾸지 않는다.
- Migration env, Secret ref, `DATABASE_MIGRATION_ROLE`과 `SET ROLE kosmo` 실행 경계를 runtime selector에서 파생하지 않는다.
- `system`, `federation-system` 또는 `web`를 credential source 역할로 만들지 않는다.
- Secret value, role/membership/grant/RLS(`kosmo_fedify` `BYPASSRLS` 포함), DB client/connection, Temporal Workflow, Worker Activity/Deployment와 API outbound direct-call 전환을 생성·변경하지 않는다.

**Verification**

- Pre-selector default render와 empty selector render가 byte-identical인지 확인한다.
- API-only, Fedify-only, 양쪽 활성화, 각 selector rollback 및 12개 partial API/Fedify 조합 실패를 render로 검증한다.
- API/Web BFF 기본 `DATABASE_*` shared source, Web-only `FEDIFY_*`, API env 부재와 dev/prod migration document 불변을 확인한다.
- `helm lint`, focused Helm regression, Prettier, Node syntax, OpenSpec strict validation과 diff check를 실행한다.

- [x] 1.1 `api`/`fedify` values 기본값, atomic validation과 helper fallback을 구현한다.
- [x] 1.2 API source를 API/Web 기본 env에 공통 적용하고 Fedify source를 Web inbound Fedify env에만 additive로 렌더한다.
- [x] 1.3 default byte identity, API/Fedify 조합·rollback, 12개 partial 입력 실패와 migration invariance 회귀를 구현하고 focused/lint/format/syntax/strict 검증을 통과한다.
- [x] 1.4 구현 self-review와 최신 Linear evidence를 부모가 완료하고, 실제 결과를 PR/Linear에 기록한다.
