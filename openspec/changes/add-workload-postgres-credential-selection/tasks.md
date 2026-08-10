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

기존 Helm values와 workload 동작을 유지하면서 `api`/`fedify` atomic trio를 제공한다. `api` source는 API Rollout과 Web BFF 및 활성화된 Worker의 기본 `DATABASE_URL`/`DATABASE_PASSWORD`가 공유하고, `fedify` source는 Web inbound Fedify와 활성화된 Worker의 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 입력 seam에 additive로 렌더한다. Migration은 기존 owner fallback 및 `kosmo_migration` login → `SET ROLE kosmo` 경계를 유지한다.

**Guardrails**

- `postgres.credentials.api`와 `postgres.credentials.fedify`는 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 모두 채우거나 모두 비워야 한다. Partial 입력은 render를 실패시킨다.
- API와 Web BFF에 서로 다른 API source를 만들지 않는다. API Rollout에는 어떤 조합에서도 `FEDIFY_DATABASE_*`를 주입하지 않는다.
- Fedify source는 Web inbound Fedify와 활성화된 Worker의 기존 env seam에만 추가하고 Web BFF 기본 `DATABASE_*`를 바꾸지 않는다.
- Migration env, Secret ref, `DATABASE_MIGRATION_ROLE`과 `SET ROLE kosmo` 실행 경계를 runtime selector에서 파생하지 않는다.
- `system`, `federation-system` 또는 `web`를 credential source 역할로 만들지 않는다.
- `fedify`/`FEDIFY_DATABASE_*`는 구현 당시의 legacy selector seam이며 `kosmo_worker` role/`worker-database` Secret 이름 계약이 아니다. Worker Deployment의 입력 seam은 이미 존재하지만 Secret value, role/membership/grant/RLS(`kosmo_worker` `BYPASSRLS` 포함), DB client/connection, Temporal Workflow, Worker Activity와 API outbound direct-call 전환을 생성·변경하지 않는다.

**Verification**

- 구현 시 일회성 수동 `helm template` 실행으로 pre-selector default와 empty selector render의 byte identity를 확인한다.
- 같은 수동 검증에서 대표 API-only/Fedify-only/양쪽 활성화와 selector rollback, 대표 partial API/Fedify 입력 실패를 확인한다.
- API/Web BFF/Worker 기본 `DATABASE_*` shared source, Web/Worker `FEDIFY_*`, API env 부재와 dev/prod migration document 불변을 수동 출력 비교로 기록한다.
- `helm lint`, Prettier, OpenSpec strict validation과 diff check를 실행한다. 재사용 가능한 regression script, CI/package hook 또는 golden hash fixture는 추가하지 않는다.

- [x] 1.1 `api`/`fedify` values 기본값, atomic validation과 helper fallback을 구현한다.
- [x] 1.2 API source를 API/Web/활성 Worker 기본 env에 공통 적용하고 Fedify source를 Web inbound Fedify와 활성 Worker env seam에 additive로 렌더한다.
- [x] 1.3 구현 시 일회성 수동 Helm template 검증으로 default byte identity, 대표 API/Fedify 조합·rollback, 대표 partial 입력 실패와 migration invariance를 확인하고 `helm lint`/format/strict/diff 검증을 통과한다.
- [x] 1.4 구현 self-review와 최신 Linear evidence를 부모가 완료하고, 실제 결과를 PR/Linear에 기록한다.
